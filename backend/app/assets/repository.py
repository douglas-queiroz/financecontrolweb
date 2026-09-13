import uuid
from calendar import monthrange
from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assets.models import (
    BTC_CURRENCY_CODE,
    Asset,
    AssetCategory,
    AssetTransaction,
    AssetValueHistory,
    Currency,
    FxRateHistory,
    TransactionType,
    ValueSource,
)
from app.assets.schemas import (
    AssetCreate,
    AssetRead,
    AssetTransactionCreate,
    AssetTransactionRead,
    AssetUpdate,
    AssetValueUpdate,
    MonthlyTotal,
)


class AssetNotFoundError(Exception):
    def __init__(self, asset_id: uuid.UUID):
        self.asset_id = asset_id
        super().__init__(f"Asset {asset_id} not found")


class MissingFxRateError(Exception):
    def __init__(self, currency: str, date: date_type):
        self.currency = currency
        self.date = date
        super().__init__(f"No exchange rate on record for {currency} on {date}; supply fx_rate_to_brl")


class InsufficientQuantityError(Exception):
    def __init__(self, asset_id: uuid.UUID, requested: Decimal, available: Decimal):
        self.asset_id = asset_id
        self.requested = requested
        self.available = available
        super().__init__(f"Cannot sell {requested}: only {available} available")


class NotABondError(Exception):
    def __init__(self, asset_id: uuid.UUID):
        self.asset_id = asset_id
        super().__init__(f"Asset {asset_id} is not a bond; manual value updates are bond-only")


class AssetRepository:
    def __init__(self, db: Session):
        self.db = db

    def _get(self, asset_id: uuid.UUID) -> Asset:
        asset = self.db.get(Asset, asset_id)
        if asset is None:
            raise AssetNotFoundError(asset_id)
        return asset

    def _latest_price(self, asset_id: uuid.UUID, as_of: date_type | None = None) -> Decimal | None:
        stmt = select(AssetValueHistory.price).where(AssetValueHistory.asset_id == asset_id)
        if as_of is not None:
            stmt = stmt.where(AssetValueHistory.date <= as_of)
        stmt = stmt.order_by(AssetValueHistory.date.desc(), AssetValueHistory.created_at.desc()).limit(1)
        return self.db.scalar(stmt)

    def _latest_fx_rate(self, currency: str, as_of: date_type | None = None) -> Decimal | None:
        stmt = select(FxRateHistory.rate_to_brl).where(FxRateHistory.currency == currency)
        if as_of is not None:
            stmt = stmt.where(FxRateHistory.date <= as_of)
        stmt = stmt.order_by(FxRateHistory.date.desc(), FxRateHistory.created_at.desc()).limit(1)
        return self.db.scalar(stmt)

    def _upsert_manual_fx_rate(self, currency: str, on_date: date_type, rate: Decimal) -> None:
        exists = self.db.scalar(
            select(FxRateHistory.id).where(
                FxRateHistory.currency == currency, FxRateHistory.date == on_date
            )
        )
        if exists is not None:
            return
        self.db.add(
            FxRateHistory(
                id=uuid.uuid4(),
                currency=currency,
                rate_to_brl=rate,
                date=on_date,
                source=ValueSource.manual.value,
            )
        )

    def _resolve_fx_rate(
        self, currency: str, on_date: date_type, provided_rate: Decimal | None
    ) -> Decimal:
        existing = self._latest_fx_rate(currency, as_of=on_date)
        if existing is not None:
            return existing
        if provided_rate is not None:
            self._upsert_manual_fx_rate(currency, on_date, provided_rate)
            return provided_rate
        raise MissingFxRateError(currency, on_date)

    def _apply_buy(
        self,
        asset: Asset,
        quantity: Decimal,
        unit_price: Decimal,
        on_date: date_type,
        provided_fx_rate: Decimal | None,
    ) -> None:
        if asset.category == AssetCategory.bitcoin.value:
            unit_price_brl = unit_price
            self._upsert_manual_fx_rate(BTC_CURRENCY_CODE, on_date, unit_price)
        elif asset.currency == Currency.BRL.value:
            unit_price_brl = unit_price
        else:
            fx_rate = self._resolve_fx_rate(asset.currency, on_date, provided_fx_rate)
            unit_price_brl = unit_price * fx_rate

        old_qty = asset.quantity
        new_qty = old_qty + quantity
        asset.average_cost = (old_qty * asset.average_cost + quantity * unit_price) / new_qty
        asset.average_cost_brl = (
            old_qty * asset.average_cost_brl + quantity * unit_price_brl
        ) / new_qty
        asset.quantity = new_qty

    def _apply_sell(
        self,
        asset: Asset,
        quantity: Decimal,
        unit_price: Decimal,
        on_date: date_type,
        provided_fx_rate: Decimal | None,
    ) -> Decimal:
        if quantity > asset.quantity:
            raise InsufficientQuantityError(asset.id, quantity, asset.quantity)

        if asset.category == AssetCategory.bitcoin.value:
            unit_price_brl = unit_price
            self._upsert_manual_fx_rate(BTC_CURRENCY_CODE, on_date, unit_price)
        elif asset.currency == Currency.BRL.value:
            unit_price_brl = unit_price
        else:
            fx_rate = self._resolve_fx_rate(asset.currency, on_date, provided_fx_rate)
            unit_price_brl = unit_price * fx_rate

        realized = quantity * (unit_price_brl - asset.average_cost_brl)
        asset.quantity -= quantity
        return realized

    def _current_value_brl(self, asset: Asset) -> Decimal:
        if asset.category == AssetCategory.bitcoin.value:
            rate = self._latest_fx_rate(BTC_CURRENCY_CODE)
            if rate is None:
                return (asset.quantity * asset.average_cost_brl).quantize(Decimal("0.01"))
            return (asset.quantity * rate).quantize(Decimal("0.01"))

        price = self._latest_price(asset.id)
        if price is None:
            return (asset.quantity * asset.average_cost_brl).quantize(Decimal("0.01"))

        if asset.currency == Currency.BRL.value:
            return (asset.quantity * price).quantize(Decimal("0.01"))

        rate = self._latest_fx_rate(asset.currency)
        if rate is None:
            return (asset.quantity * asset.average_cost_brl).quantize(Decimal("0.01"))
        return (asset.quantity * price * rate).quantize(Decimal("0.01"))

    def _to_read(self, asset: Asset) -> AssetRead:
        current_value_brl = self._current_value_brl(asset)
        basis_brl = (asset.quantity * asset.average_cost_brl).quantize(Decimal("0.01"))
        unrealized = current_value_brl - basis_brl
        return AssetRead(
            id=asset.id,
            name=asset.name,
            category=AssetCategory(asset.category),
            code=asset.code,
            currency=Currency(asset.currency) if asset.currency else None,
            quantity=asset.quantity,
            average_cost=asset.average_cost,
            average_cost_brl=asset.average_cost_brl,
            current_value_brl=current_value_brl,
            unrealized_gain_loss_brl=unrealized,
            created_at=asset.created_at,
        )

    def _to_transaction_read(self, transaction: AssetTransaction) -> AssetTransactionRead:
        return AssetTransactionRead(
            id=transaction.id,
            asset_id=transaction.asset_id,
            type=TransactionType(transaction.type),
            quantity=transaction.quantity,
            unit_price=transaction.unit_price,
            total_amount=transaction.total_amount,
            realized_gain_loss_brl=transaction.realized_gain_loss_brl,
            date=transaction.date,
            created_at=transaction.created_at,
        )

    def create_asset(self, data: AssetCreate) -> AssetRead:
        asset = Asset(
            id=uuid.uuid4(),
            name=data.name,
            category=data.category.value,
            code=data.code,
            currency=data.currency.value if data.currency else None,
            quantity=Decimal("0"),
            average_cost=Decimal("0"),
            average_cost_brl=Decimal("0"),
        )
        self.db.add(asset)
        self._apply_buy(asset, data.quantity, data.unit_price, data.date, data.fx_rate_to_brl)

        transaction = AssetTransaction(
            id=uuid.uuid4(),
            asset_id=asset.id,
            type=TransactionType.buy.value,
            quantity=data.quantity,
            unit_price=data.unit_price,
            total_amount=data.quantity * data.unit_price,
            realized_gain_loss_brl=None,
            date=data.date,
        )
        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(asset)
        return self._to_read(asset)

    def create_transaction(
        self, asset_id: uuid.UUID, data: AssetTransactionCreate
    ) -> AssetTransactionRead:
        asset = self._get(asset_id)
        total_amount = data.quantity * data.unit_price

        if data.type == TransactionType.buy:
            self._apply_buy(asset, data.quantity, data.unit_price, data.date, data.fx_rate_to_brl)
            realized = None
        else:
            realized = self._apply_sell(
                asset, data.quantity, data.unit_price, data.date, data.fx_rate_to_brl
            )

        transaction = AssetTransaction(
            id=uuid.uuid4(),
            asset_id=asset_id,
            type=data.type.value,
            quantity=data.quantity,
            unit_price=data.unit_price,
            total_amount=total_amount,
            realized_gain_loss_brl=realized,
            date=data.date,
        )
        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)
        return self._to_transaction_read(transaction)

    def list_assets(self) -> list[AssetRead]:
        stmt = select(Asset).order_by(Asset.name.asc())
        return [self._to_read(asset) for asset in self.db.scalars(stmt)]

    def all_assets(self) -> list[Asset]:
        return list(self.db.scalars(select(Asset)))

    def priceable_assets(self) -> list[Asset]:
        stmt = select(Asset).where(
            Asset.category.in_([AssetCategory.stock.value, AssetCategory.reit.value])
        )
        return list(self.db.scalars(stmt))

    def record_market_price(self, asset_id: uuid.UUID, price: Decimal, on_date: date_type) -> None:
        exists = self.db.scalar(
            select(AssetValueHistory.id).where(
                AssetValueHistory.asset_id == asset_id, AssetValueHistory.date == on_date
            )
        )
        if exists is not None:
            return
        self.db.add(
            AssetValueHistory(
                id=uuid.uuid4(),
                asset_id=asset_id,
                price=price,
                date=on_date,
                source=ValueSource.market.value,
            )
        )

    def record_market_fx_rate(self, currency: str, rate: Decimal, on_date: date_type) -> None:
        exists = self.db.scalar(
            select(FxRateHistory.id).where(
                FxRateHistory.currency == currency, FxRateHistory.date == on_date
            )
        )
        if exists is not None:
            return
        self.db.add(
            FxRateHistory(
                id=uuid.uuid4(),
                currency=currency,
                rate_to_brl=rate,
                date=on_date,
source=ValueSource.market.value,
            )
        )

    def latest_market_price(self) -> date_type | None:
        return self.db.scalar(
            select(AssetValueHistory.date)
            .where(AssetValueHistory.source == ValueSource.market.value)
            .order_by(AssetValueHistory.date.desc(), AssetValueHistory.created_at.desc())
            .limit(1)
        )

    def latest_market_fx_rate(self) -> date_type | None:
        return self.db.scalar(
            select(FxRateHistory.date)
            .where(FxRateHistory.source == ValueSource.market.value)
            .order_by(FxRateHistory.date.desc(), FxRateHistory.created_at.desc())
            .limit(1)
        )

    def update_asset_name(self, asset_id: uuid.UUID, data: AssetUpdate) -> AssetRead:
        asset = self._get(asset_id)
        asset.name = data.name
        self.db.commit()
        self.db.refresh(asset)
        return self._to_read(asset)

    def delete_asset(self, asset_id: uuid.UUID) -> None:
        asset = self._get(asset_id)
        self.db.delete(asset)
        self.db.commit()

    def list_transactions(self, asset_id: uuid.UUID) -> list[AssetTransactionRead]:
        self._get(asset_id)
        stmt = (
            select(AssetTransaction)
            .where(AssetTransaction.asset_id == asset_id)
            .order_by(AssetTransaction.date.desc(), AssetTransaction.created_at.desc())
        )
        return [self._to_transaction_read(t) for t in self.db.scalars(stmt)]

    def create_manual_value(self, asset_id: uuid.UUID, data: AssetValueUpdate) -> AssetRead:
        asset = self._get(asset_id)
        if asset.category != AssetCategory.bond.value:
            raise NotABondError(asset_id)
        self.db.add(
            AssetValueHistory(
                id=uuid.uuid4(),
                asset_id=asset_id,
                price=data.price,
                date=data.date,
                source=ValueSource.manual.value,
            )
        )
        self.db.commit()
        self.db.refresh(asset)
        return self._to_read(asset)

    def _value_as_of(self, asset: Asset, quantity: Decimal, as_of: date_type) -> Decimal:
        if asset.category == AssetCategory.bitcoin.value:
            rate = self._latest_fx_rate(BTC_CURRENCY_CODE, as_of)
            if rate is None:
                return (quantity * asset.average_cost_brl).quantize(Decimal("0.01"))
            return (quantity * rate).quantize(Decimal("0.01"))

        price = self._latest_price(asset.id, as_of)
        if price is None:
            return (quantity * asset.average_cost_brl).quantize(Decimal("0.01"))

        if asset.currency == Currency.BRL.value:
            return (quantity * price).quantize(Decimal("0.01"))

        rate = self._latest_fx_rate(asset.currency, as_of)
        if rate is None:
            return (quantity * asset.average_cost_brl).quantize(Decimal("0.01"))
        return (quantity * price * rate).quantize(Decimal("0.01"))

    def fetch_monthly_totals(self, today: date_type) -> list[MonthlyTotal]:
        start_index = today.year * 12 + (today.month - 1) - 11
        months = []
        for offset in range(12):
            index = start_index + offset
            year, month = divmod(index, 12)
            months.append((year, month + 1))

        buckets: dict[tuple[int, int], Decimal] = {}
        assets = list(self.db.scalars(select(Asset)))

        for asset in assets:
            transactions = list(
                self.db.scalars(
                    select(AssetTransaction)
                    .where(AssetTransaction.asset_id == asset.id)
                    .order_by(AssetTransaction.date.asc(), AssetTransaction.created_at.asc())
                )
            )
            txn_index = 0
            quantity = Decimal("0")
            for year, month_number in months:
                boundary = date_type(year, month_number, monthrange(year, month_number)[1])
                while txn_index < len(transactions) and transactions[txn_index].date <= boundary:
                    transaction = transactions[txn_index]
                    if transaction.type == TransactionType.buy.value:
                        quantity += transaction.quantity
                    else:
                        quantity -= transaction.quantity
                    txn_index += 1
                if quantity > 0:
                    key = (year, month_number)
                    buckets[key] = buckets.get(key, Decimal("0")) + self._value_as_of(
                        asset, quantity, boundary
                    )

        return [
            MonthlyTotal(month=f"{year}-{month_number:02d}", total=buckets.get((year, month_number), Decimal("0")))
            for year, month_number in months
        ]