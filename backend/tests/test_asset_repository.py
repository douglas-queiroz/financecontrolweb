from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest

from app.assets.models import Asset, AssetCategory, Currency, TransactionType
from app.assets.repository import (
    AssetNotFoundError,
    AssetRepository,
    InsufficientQuantityError,
    MissingFxRateError,
    NotABondError,
)
from app.assets.schemas import AssetCreate, AssetTransactionCreate, AssetUpdate, AssetValueUpdate


def _stock_input(**overrides):
    defaults = dict(
        name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
        quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
    )
    defaults.update(overrides)
    return AssetCreate(**defaults)


def _bond_input(**overrides):
    defaults = dict(
        name="Tesouro IPCA", category=AssetCategory.bond, code=None, currency=Currency.BRL,
        quantity=Decimal("1"), unit_price=Decimal("1000.00"), date=date(2026, 1, 1),
    )
    defaults.update(overrides)
    return AssetCreate(**defaults)


def test_create_brl_stock_sets_average_cost(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())
    assert asset.quantity == Decimal("10")
    assert asset.average_cost == Decimal("30.00")
    assert asset.average_cost_brl == Decimal("30.00")


def test_create_bitcoin_sets_average_cost_brl_from_unit_price(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(
        AssetCreate(
            name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=None,
            quantity=Decimal("0.01"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
        )
    )
    assert asset.average_cost == Decimal("250000.00")
    assert asset.average_cost_brl == Decimal("250000.00")


def test_create_usd_stock_requires_fx_rate_when_none_on_record(db_session):
    repo = AssetRepository(db_session)
    with pytest.raises(MissingFxRateError):
        repo.create_asset(
            _stock_input(name="AAPL", code="AAPL", currency=Currency.USD, unit_price=Decimal("150.00"))
        )


def test_create_usd_stock_uses_supplied_fx_rate(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(
        _stock_input(
            name="AAPL", code="AAPL", currency=Currency.USD, unit_price=Decimal("150.00"),
            fx_rate_to_brl=Decimal("5.00"),
        )
    )
    assert asset.average_cost == Decimal("150.00")
    assert asset.average_cost_brl == Decimal("750.00")


def test_second_buy_updates_average_cost(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())

    repo.create_transaction(
        asset.id,
        AssetTransactionCreate(
            type=TransactionType.buy, quantity=Decimal("10"), unit_price=Decimal("40.00"),
            date=date(2026, 2, 1),
        ),
    )

    refreshed = db_session.get(Asset, asset.id)
    assert refreshed.quantity == Decimal("20")
    assert refreshed.average_cost == Decimal("35.00")


def test_sell_computes_realized_gain_loss(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())

    transaction = repo.create_transaction(
        asset.id,
        AssetTransactionCreate(
            type=TransactionType.sell, quantity=Decimal("4"), unit_price=Decimal("40.00"),
            date=date(2026, 2, 1),
        ),
    )

    assert transaction.realized_gain_loss_brl == Decimal("40.00")  # 4 * (40 - 30)

    refreshed = db_session.get(Asset, asset.id)
    assert refreshed.quantity == Decimal("6")
    assert refreshed.average_cost == Decimal("30.00")  # unchanged by a sell


def test_sell_more_than_held_is_rejected(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())

    with pytest.raises(InsufficientQuantityError):
        repo.create_transaction(
            asset.id,
            AssetTransactionCreate(
                type=TransactionType.sell, quantity=Decimal("11"), unit_price=Decimal("40.00"),
                date=date(2026, 2, 1),
            ),
        )


def test_current_value_falls_back_to_cost_basis_without_price_history(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())
    assert asset.current_value_brl == Decimal("300.00")
    assert asset.unrealized_gain_loss_brl == Decimal("0")


def test_list_assets_returns_all_assets(db_session):
    repo = AssetRepository(db_session)
    repo.create_asset(_stock_input(name="PETR4"))
    repo.create_asset(_stock_input(name="VALE3", code="VALE3"))
    assert len(repo.list_assets()) == 2


def test_update_asset_name(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())
    updated = repo.update_asset_name(asset.id, AssetUpdate(name="Petrobras"))
    assert updated.name == "Petrobras"


def test_delete_asset(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())
    repo.delete_asset(asset.id)
    assert repo.list_assets() == []


def test_update_missing_asset_raises(db_session):
    repo = AssetRepository(db_session)
    with pytest.raises(AssetNotFoundError):
        repo.update_asset_name(UUID(int=0), AssetUpdate(name="X"))


def test_list_transactions_newest_first(db_session):
    repo = AssetRepository(db_session)
    asset = repo.create_asset(_stock_input())  # buy on 2026-01-01
    repo.create_transaction(
        asset.id,
        AssetTransactionCreate(
            type=TransactionType.buy, quantity=Decimal("1"), unit_price=Decimal("31.00"),
            date=date(2026, 2, 1),
        ),
    )
    transactions = repo.list_transactions(asset.id)
    assert [t.date for t in transactions] == [date(2026, 2, 1), date(2026, 1, 1)]


def test_manual_value_update_for_bond(db_session):
    repo = AssetRepository(db_session)
    bond = repo.create_asset(_bond_input())
    updated = repo.create_manual_value(
        bond.id, AssetValueUpdate(price=Decimal("1050.00"), date=date(2026, 2, 1))
    )
    assert updated.current_value_brl == Decimal("1050.00")


def test_manual_value_update_rejected_for_non_bond(db_session):
    repo = AssetRepository(db_session)
    stock = repo.create_asset(_stock_input())
    with pytest.raises(NotABondError):
        repo.create_manual_value(stock.id, AssetValueUpdate(price=Decimal("35.00"), date=date(2026, 2, 1)))


def test_monthly_totals_zero_fills_before_first_buy(db_session):
    repo = AssetRepository(db_session)
    repo.create_asset(_stock_input(date=date(2026, 9, 1)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert len(totals) == 12
    assert totals[0].month == "2025-10"
    assert totals[-1].month == "2026-09"
    assert [t.total for t in totals[:-1]] == [Decimal("0")] * 11
    assert totals[-1].total == Decimal("300.00")


def test_monthly_totals_replays_quantity_and_sums_across_assets(db_session):
    repo = AssetRepository(db_session)
    repo.create_asset(_stock_input(name="A", code="A", quantity=Decimal("5"), unit_price=Decimal("20.00"), date=date(2026, 1, 5)))
    asset_a = next(a for a in repo.list_assets() if a.name == "A")
    repo.create_transaction(
        asset_a.id,
        AssetTransactionCreate(
            type=TransactionType.sell, quantity=Decimal("2"), unit_price=Decimal("25.00"),
            date=date(2026, 3, 10),
        ),
    )
    repo.create_asset(_stock_input(name="B", code="B", quantity=Decimal("4"), unit_price=Decimal("10.00"), date=date(2026, 2, 28)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert totals[0].month == "2025-10"
    assert totals[3].month == "2026-01"
    assert totals[3].total == Decimal("100.00")
    assert totals[4].month == "2026-02"
    assert totals[4].total == Decimal("140.00")
    assert totals[9].month == "2026-07"
    assert totals[9].total == Decimal("100.00")


def test_monthly_totals_boundary_transaction_on_last_day_counts_for_that_month(db_session):
    repo = AssetRepository(db_session)
    repo.create_asset(_stock_input(name="C", code="C", quantity=Decimal("1"), unit_price=Decimal("50.00"), date=date(2025, 10, 31)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert totals[0].month == "2025-10"
    assert totals[0].total == Decimal("50.00")
    assert totals[1].total == Decimal("50.00")


def test_monthly_totals_values_usd_assets_at_supplied_fx(db_session):
    repo = AssetRepository(db_session)
    repo.create_asset(
        _stock_input(name="AAPL", code="AAPL", currency=Currency.USD, quantity=Decimal("10"),
                     unit_price=Decimal("150.00"), fx_rate_to_brl=Decimal("5.00"), date=date(2026, 9, 1))
    )

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert totals[-1].total == Decimal("7500.00")


def test_monthly_totals_uses_latest_price_as_of_each_month(db_session):
    repo = AssetRepository(db_session)
    bond = repo.create_asset(_bond_input(quantity=Decimal("1"), unit_price=Decimal("1000.00"), date=date(2026, 5, 10)))
    repo.create_manual_value(bond.id, AssetValueUpdate(price=Decimal("1050.00"), date=date(2026, 7, 20)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert totals[7].month == "2026-05"
    assert totals[7].total == Decimal("1000.00")
    assert totals[8].total == Decimal("1000.00")
    assert totals[9].month == "2026-07"
    assert totals[9].total == Decimal("1050.00")
    assert totals[10].total == Decimal("1050.00")
    assert totals[11].total == Decimal("1050.00")