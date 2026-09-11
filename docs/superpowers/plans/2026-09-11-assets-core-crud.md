# Assets — Core CRUD & Manual Valuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Assets feature's CRUD, buy/sell ledger, and average-cost gain/loss tracking end to end (backend + frontend), with "current value" falling back to cost basis until Phase 2's price/FX job exists.

**Architecture:** A new `backend/app/assets/` module (models/schemas/repository/router) mirrors the existing `app/expenses/` layering exactly. The frontend gets a new `features/assets/` folder plus two small reusable pieces (`lib/currency.ts`, `components/CurrencyInput.tsx`) that also happen to complete the previously-approved BRL-formatting spec's reusable utilities (wiring them into the existing `ExpenseRow`/`ExpenseForm` stays out of scope here).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2 (backend, Python, pytest); React 19 + TypeScript + React Query + React Router + Vitest/Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-09-11-assets-feature-design.md` (Phase 1 of that spec's suggested phasing — Phases 2/3 get their own plans once this one lands, since their interfaces depend on what this phase actually produces).

## Global Constraints

- `category`, `code`, and `currency` are immutable after an `Asset` is created (spec: "Categories, currency, and pricing rules").
- Cost basis uses a running **average cost** only — no FIFO lots.
- Currency amounts use `Numeric(12, 2)`; `quantity` uses `Numeric(20, 8)` (fits Bitcoin's 8-decimal precision); FX rates use `Numeric(12, 6)` — exact precisions from the spec's data model tables.
- `realized_gain_loss_brl` and `current_value_brl`/`unrealized_gain_loss_brl` are always in BRL, never in the asset's native currency (spec: "Buy/sell transactions & cost basis").
- No backfilling of historical prices/FX rates from before this feature ships.
- Pydantic `Decimal` fields are always serialized as strings via `field_serializer`, matching the existing `ExpenseRead.amount` pattern (`backend/app/expenses/schemas.py:63`).
- Follow existing repo conventions exactly: SQLAlchemy `Mapped`/`mapped_column` style from `backend/app/expenses/models.py`, repository/router/error patterns from `backend/app/expenses/repository.py` and `router.py`, and the `db_session`/`client` pytest fixtures from `backend/tests/conftest.py` and `backend/tests/test_router.py`.

---

### Task 1: Asset domain models

**Files:**
- Create: `backend/app/assets/__init__.py`
- Create: `backend/app/assets/models.py`
- Test: `backend/tests/test_asset_models.py`

**Interfaces:**
- Produces: `app.assets.models.AssetCategory` (str Enum: `reit`, `stock`, `bond`, `bitcoin`), `Currency` (str Enum: `USD`, `EUR`, `BRL`), `TransactionType` (str Enum: `buy`, `sell`), `ValueSource` (str Enum: `market`, `manual`), `BTC_CURRENCY_CODE: str = "BTC"`, and SQLAlchemy models `Asset`, `AssetTransaction`, `AssetValueHistory`, `FxRateHistory` (all subclass `app.core.database.Base`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_asset_models.py
import uuid
from datetime import date

from app.assets.models import Asset, AssetTransaction, AssetValueHistory, FxRateHistory


def _make_asset(**overrides):
    defaults = dict(
        id=uuid.uuid4(),
        name="PETR4",
        category="stock",
        code="PETR4",
        currency="BRL",
        quantity="10",
        average_cost="30.00",
        average_cost_brl="30.00",
    )
    defaults.update(overrides)
    return Asset(**defaults)


def test_create_and_read_asset(db_session):
    asset = _make_asset()
    db_session.add(asset)
    db_session.commit()

    fetched = db_session.get(Asset, asset.id)
    assert fetched is not None
    assert fetched.name == "PETR4"
    assert fetched.category == "stock"


def test_create_and_read_asset_transaction(db_session):
    asset = _make_asset()
    db_session.add(asset)
    db_session.commit()

    transaction = AssetTransaction(
        id=uuid.uuid4(),
        asset_id=asset.id,
        type="buy",
        quantity="10",
        unit_price="30.00",
        total_amount="300.00",
        realized_gain_loss_brl=None,
        date=date(2026, 1, 1),
    )
    db_session.add(transaction)
    db_session.commit()

    fetched = db_session.get(AssetTransaction, transaction.id)
    assert fetched is not None
    assert fetched.asset_id == asset.id
    assert fetched.realized_gain_loss_brl is None


def test_deleting_asset_cascades_transactions_and_value_history(db_session):
    asset = _make_asset()
    db_session.add(asset)
    db_session.commit()

    transaction = AssetTransaction(
        id=uuid.uuid4(), asset_id=asset.id, type="buy", quantity="10", unit_price="30.00",
        total_amount="300.00", realized_gain_loss_brl=None, date=date(2026, 1, 1),
    )
    value = AssetValueHistory(
        id=uuid.uuid4(), asset_id=asset.id, price="31.00", date=date(2026, 1, 2), source="market",
    )
    db_session.add_all([transaction, value])
    db_session.commit()

    db_session.delete(asset)
    db_session.commit()

    assert db_session.get(AssetTransaction, transaction.id) is None
    assert db_session.get(AssetValueHistory, value.id) is None


def test_create_and_read_fx_rate_history(db_session):
    rate = FxRateHistory(
        id=uuid.uuid4(), currency="USD", rate_to_brl="5.10", date=date(2026, 1, 1), source="market",
    )
    db_session.add(rate)
    db_session.commit()

    fetched = db_session.get(FxRateHistory, rate.id)
    assert fetched is not None
    assert fetched.currency == "USD"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.assets'`

- [ ] **Step 3: Create the empty package and write the models**

```python
# backend/app/assets/__init__.py
```

```python
# backend/app/assets/models.py
import uuid
from datetime import date as date_type
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AssetCategory(str, Enum):
    reit = "reit"
    stock = "stock"
    bond = "bond"
    bitcoin = "bitcoin"


class Currency(str, Enum):
    USD = "USD"
    EUR = "EUR"
    BRL = "BRL"


class TransactionType(str, Enum):
    buy = "buy"
    sell = "sell"


class ValueSource(str, Enum):
    market = "market"
    manual = "manual"


BTC_CURRENCY_CODE = "BTC"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    code: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    currency: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    average_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    average_cost_brl: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, onupdate=_utcnow
    )

    transactions: Mapped[list["AssetTransaction"]] = relationship(cascade="all, delete-orphan")
    value_history: Mapped[list["AssetValueHistory"]] = relationship(cascade="all, delete-orphan")


class AssetTransaction(Base):
    __tablename__ = "asset_transactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    realized_gain_loss_brl: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True, default=None
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)


class AssetValueHistory(Base):
    __tablename__ = "asset_value_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id"), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)


class FxRateHistory(Base):
    __tablename__ = "fx_rate_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    currency: Mapped[str] = mapped_column(String, nullable=False)
    rate_to_brl: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_models.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/__init__.py backend/app/assets/models.py backend/tests/test_asset_models.py
git commit -m "feat(assets): add Asset, AssetTransaction, AssetValueHistory, FxRateHistory models"
```

---

### Task 2: Alembic migration

**Files:**
- Modify: `backend/alembic/env.py`
- Create: `backend/alembic/versions/<autogenerated>_create_assets_tables.py`

**Interfaces:**
- Consumes: `app.assets.models` (Task 1) — imported so `Base.metadata` includes the new tables for autogenerate.
- Produces: the `assets`, `asset_transactions`, `asset_value_history`, `fx_rate_history` tables in the database schema.

- [ ] **Step 1: Register the new models with Alembic's target metadata**

```python
# backend/alembic/env.py — add after the existing expenses import
from app.expenses import models  # noqa: F401  (registers Expense with Base.metadata)
from app.assets import models as asset_models  # noqa: F401  (registers Asset tables with Base.metadata)
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
cd backend && source venv/bin/activate && alembic revision --autogenerate -m "create assets tables"
```
Expected: a new file appears under `backend/alembic/versions/`.

- [ ] **Step 3: Review the generated file**

Open the new file and confirm the `upgrade()`/`downgrade()` bodies match this shape (the revision id/`down_revision` are auto-filled and will differ — leave those as generated):

```python
def upgrade() -> None:
    op.create_table('assets',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('code', sa.String(), nullable=True),
    sa.Column('currency', sa.String(), nullable=True),
    sa.Column('quantity', sa.Numeric(precision=20, scale=8), nullable=False),
    sa.Column('average_cost', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('average_cost_brl', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('asset_transactions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('asset_id', sa.Uuid(), nullable=False),
    sa.Column('type', sa.String(), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=20, scale=8), nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('realized_gain_loss_brl', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('asset_value_history',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('asset_id', sa.Uuid(), nullable=False),
    sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('fx_rate_history',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('currency', sa.String(), nullable=False),
    sa.Column('rate_to_brl', sa.Numeric(precision=12, scale=6), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('fx_rate_history')
    op.drop_table('asset_value_history')
    op.drop_table('asset_transactions')
    op.drop_table('assets')
```

If the generated file's column order/table order differs, that's fine — what matters is every column/type/nullability above is present. Fix anything that doesn't match (e.g. wrong `Numeric` precision) directly in the generated file.

- [ ] **Step 4: Apply the migration**

Run: `cd backend && source venv/bin/activate && alembic upgrade head`
Expected: runs without error; ends at the new revision.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/env.py backend/alembic/versions/
git commit -m "feat(assets): add migration for assets tables"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/assets/schemas.py`
- Test: `backend/tests/test_asset_schemas.py`

**Interfaces:**
- Consumes: `AssetCategory`, `Currency`, `TransactionType` from `app.assets.models` (Task 1).
- Produces: `AssetCreate(name, category, code, currency, quantity, unit_price, date, fx_rate_to_brl)`, `AssetUpdate(name)`, `AssetTransactionCreate(type, quantity, unit_price, date, fx_rate_to_brl)`, `AssetValueUpdate(price, date)`, `AssetRead(id, name, category, code, currency, quantity, average_cost, average_cost_brl, current_value_brl, unrealized_gain_loss_brl, created_at)`, `AssetTransactionRead(id, asset_id, type, quantity, unit_price, total_amount, realized_gain_loss_brl, date, created_at)` — all in `app.assets.schemas`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_asset_schemas.py
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.assets.models import AssetCategory, Currency, TransactionType
from app.assets.schemas import AssetCreate, AssetTransactionCreate, AssetValueUpdate


def test_valid_stock_create():
    asset = AssetCreate(
        name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
        quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
    )
    assert asset.code == "PETR4"


def test_stock_requires_code():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code=None, currency=Currency.BRL,
            quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )


def test_bond_rejects_code():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="Tesouro", category=AssetCategory.bond, code="X", currency=Currency.BRL,
            quantity=Decimal("1"), unit_price=Decimal("100.00"), date=date(2026, 1, 1),
        )


def test_bond_requires_currency():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="Tesouro", category=AssetCategory.bond, code=None, currency=None,
            quantity=Decimal("1"), unit_price=Decimal("100.00"), date=date(2026, 1, 1),
        )


def test_bitcoin_rejects_code_and_currency():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=Currency.BRL,
            quantity=Decimal("0.01"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
        )


def test_valid_bitcoin_create():
    asset = AssetCreate(
        name="Bitcoin", category=AssetCategory.bitcoin, code=None, currency=None,
        quantity=Decimal("0.01"), unit_price=Decimal("250000.00"), date=date(2026, 1, 1),
    )
    assert asset.currency is None


def test_rejects_non_positive_quantity():
    with pytest.raises(ValidationError):
        AssetCreate(
            name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
            quantity=Decimal("0"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
        )


def test_transaction_rejects_non_positive_unit_price():
    with pytest.raises(ValidationError):
        AssetTransactionCreate(
            type=TransactionType.buy, quantity=Decimal("1"), unit_price=Decimal("0"), date=date(2026, 1, 1),
        )


def test_value_update_requires_positive_price():
    with pytest.raises(ValidationError):
        AssetValueUpdate(price=Decimal("0"), date=date(2026, 1, 1))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.assets.schemas'`

- [ ] **Step 3: Write the schemas**

```python
# backend/app/assets/schemas.py
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_serializer, field_validator, model_validator

from app.assets.models import AssetCategory, Currency, TransactionType


class AssetCreate(BaseModel):
    name: str
    category: AssetCategory
    code: str | None = None
    currency: Currency | None = None
    quantity: Decimal
    unit_price: Decimal
    date: date
    fx_rate_to_brl: Decimal | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be empty")
        return value

    @field_validator("quantity", "unit_price")
    @classmethod
    def positive(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("must be greater than 0")
        return value

    @model_validator(mode="after")
    def category_fields(self) -> "AssetCreate":
        if self.category in (AssetCategory.reit, AssetCategory.stock):
            if not self.code or not self.code.strip():
                raise ValueError("code is required for reit/stock assets")
            if self.currency is None:
                raise ValueError("currency is required for reit/stock assets")
        elif self.category == AssetCategory.bond:
            if self.code is not None:
                raise ValueError("bond assets must not have a code")
            if self.currency is None:
                raise ValueError("currency is required for bond assets")
        elif self.category == AssetCategory.bitcoin:
            if self.code is not None:
                raise ValueError("bitcoin assets must not have a code")
            if self.currency is not None:
                raise ValueError("bitcoin assets must not have a currency")
        return self


class AssetTransactionCreate(BaseModel):
    type: TransactionType
    quantity: Decimal
    unit_price: Decimal
    date: date
    fx_rate_to_brl: Decimal | None = None

    @field_validator("quantity", "unit_price")
    @classmethod
    def positive(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("must be greater than 0")
        return value


class AssetUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be empty")
        return value


class AssetValueUpdate(BaseModel):
    price: Decimal
    date: date

    @field_validator("price")
    @classmethod
    def price_positive(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("price must be greater than 0")
        return value


class AssetRead(BaseModel):
    id: UUID
    name: str
    category: AssetCategory
    code: str | None
    currency: Currency | None
    quantity: Decimal
    average_cost: Decimal
    average_cost_brl: Decimal
    current_value_brl: Decimal
    unrealized_gain_loss_brl: Decimal
    created_at: datetime

    @field_serializer(
        "quantity", "average_cost", "average_cost_brl", "current_value_brl", "unrealized_gain_loss_brl"
    )
    def serialize_decimal(self, value: Decimal) -> str:
        return str(value)


class AssetTransactionRead(BaseModel):
    id: UUID
    asset_id: UUID
    type: TransactionType
    quantity: Decimal
    unit_price: Decimal
    total_amount: Decimal
    realized_gain_loss_brl: Decimal | None
    date: date
    created_at: datetime

    @field_serializer("quantity", "unit_price", "total_amount")
    def serialize_decimal(self, value: Decimal) -> str:
        return str(value)

    @field_serializer("realized_gain_loss_brl")
    def serialize_realized(self, value: Decimal | None) -> str | None:
        return str(value) if value is not None else None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_schemas.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/schemas.py backend/tests/test_asset_schemas.py
git commit -m "feat(assets): add asset/transaction/value-update schemas"
```

---

### Task 4: Repository — asset creation

**Files:**
- Create: `backend/app/assets/repository.py`
- Test: `backend/tests/test_asset_repository.py`

**Interfaces:**
- Consumes: models from Task 1, schemas from Task 3.
- Produces: `AssetRepository(db)` with `create_asset(data: AssetCreate) -> AssetRead`; errors `AssetNotFoundError(asset_id)`, `MissingFxRateError(currency, date)`; private helpers `_get`, `_latest_price`, `_latest_fx_rate`, `_upsert_manual_fx_rate`, `_resolve_fx_rate`, `_apply_buy`, `_current_value_brl`, `_to_read` (later tasks extend this same class/file).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_asset_repository.py
from datetime import date
from decimal import Decimal

import pytest

from app.assets.models import AssetCategory, Currency
from app.assets.repository import AssetRepository, MissingFxRateError
from app.assets.schemas import AssetCreate


def _stock_input(**overrides):
    defaults = dict(
        name="PETR4", category=AssetCategory.stock, code="PETR4", currency=Currency.BRL,
        quantity=Decimal("10"), unit_price=Decimal("30.00"), date=date(2026, 1, 1),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.assets.repository'`

- [ ] **Step 3: Write the repository**

```python
# backend/app/assets/repository.py
import uuid
from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assets.models import (
    BTC_CURRENCY_CODE,
    Asset,
    AssetCategory,
    AssetValueHistory,
    Currency,
    FxRateHistory,
    ValueSource,
)
from app.assets.schemas import AssetCreate, AssetRead


class AssetNotFoundError(Exception):
    def __init__(self, asset_id: uuid.UUID):
        self.asset_id = asset_id
        super().__init__(f"Asset {asset_id} not found")


class MissingFxRateError(Exception):
    def __init__(self, currency: str, date: date_type):
        self.currency = currency
        self.date = date
        super().__init__(f"No exchange rate on record for {currency} on {date}; supply fx_rate_to_brl")


class AssetRepository:
    def __init__(self, db: Session):
        self.db = db

    def _get(self, asset_id: uuid.UUID) -> Asset:
        asset = self.db.get(Asset, asset_id)
        if asset is None:
            raise AssetNotFoundError(asset_id)
        return asset

    def _latest_price(self, asset_id: uuid.UUID) -> Decimal | None:
        stmt = (
            select(AssetValueHistory.price)
            .where(AssetValueHistory.asset_id == asset_id)
            .order_by(AssetValueHistory.date.desc(), AssetValueHistory.created_at.desc())
            .limit(1)
        )
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

    def _current_value_brl(self, asset: Asset) -> Decimal:
        if asset.category == AssetCategory.bitcoin.value:
            rate = self._latest_fx_rate(BTC_CURRENCY_CODE)
            if rate is None:
                return asset.quantity * asset.average_cost_brl
            return asset.quantity * rate

        price = self._latest_price(asset.id)
        if price is None:
            return asset.quantity * asset.average_cost_brl

        if asset.currency == Currency.BRL.value:
            return asset.quantity * price

        rate = self._latest_fx_rate(asset.currency)
        if rate is None:
            return asset.quantity * asset.average_cost_brl
        return asset.quantity * price * rate

    def _to_read(self, asset: Asset) -> AssetRead:
        current_value_brl = self._current_value_brl(asset)
        unrealized = current_value_brl - asset.quantity * asset.average_cost_brl
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

        from app.assets.models import AssetTransaction, TransactionType

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
```

Note: the `AssetTransaction`/`TransactionType` import is deliberately inline inside `create_asset` for this task only, to avoid an unused top-level import before Task 5 adds the rest of the transaction methods that use them at module level — **Task 5 moves this import to the top of the file** alongside its own additions (don't leave it inline after Task 5).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/repository.py backend/tests/test_asset_repository.py
git commit -m "feat(assets): add asset creation with average-cost and FX resolution"
```

---

### Task 5: Repository — buy/sell transactions

**Files:**
- Modify: `backend/app/assets/repository.py`
- Modify: `backend/tests/test_asset_repository.py`

**Interfaces:**
- Consumes: everything from Task 4 (same class).
- Produces (added to `AssetRepository`): `create_transaction(asset_id, data: AssetTransactionCreate) -> AssetTransactionRead`; error `InsufficientQuantityError(asset_id, requested, available)`; private helpers `_apply_sell`, `_to_transaction_read`.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/test_asset_repository.py
from app.assets.models import TransactionType
from app.assets.repository import InsufficientQuantityError
from app.assets.schemas import AssetTransactionCreate


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

    from app.assets.models import Asset as AssetModel
    refreshed = db_session.get(AssetModel, asset.id)
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

    from app.assets.models import Asset as AssetModel
    refreshed = db_session.get(AssetModel, asset.id)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: the 3 new tests FAIL with `AttributeError: 'AssetRepository' object has no attribute 'create_transaction'`

- [ ] **Step 3: Add buy/sell handling**

Move the inline import from Task 4 to the top of the file, then add the sell path and `create_transaction`:

```python
# backend/app/assets/repository.py — replace the top-of-file imports with:
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
from app.assets.schemas import AssetCreate, AssetRead, AssetTransactionCreate, AssetTransactionRead
```

Remove the inline `from app.assets.models import AssetTransaction, TransactionType` line inside `create_asset` (now redundant given the top-level import above).

Add to the class:

```python
class InsufficientQuantityError(Exception):
    def __init__(self, asset_id: uuid.UUID, requested: Decimal, available: Decimal):
        self.asset_id = asset_id
        self.requested = requested
        self.available = available
        super().__init__(f"Cannot sell {requested}: only {available} available")
```

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/repository.py backend/tests/test_asset_repository.py
git commit -m "feat(assets): add buy/sell transactions with realized gain/loss"
```

---

### Task 6: Repository — list, name update, delete, list transactions

**Files:**
- Modify: `backend/app/assets/repository.py`
- Modify: `backend/tests/test_asset_repository.py`

**Interfaces:**
- Produces (added to `AssetRepository`): `list_assets() -> list[AssetRead]`, `update_asset_name(asset_id, data: AssetUpdate) -> AssetRead`, `delete_asset(asset_id) -> None`, `list_transactions(asset_id) -> list[AssetTransactionRead]`.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/test_asset_repository.py
from app.assets.schemas import AssetUpdate


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
    import uuid as uuid_module

    from app.assets.repository import AssetNotFoundError

    repo = AssetRepository(db_session)
    with pytest.raises(AssetNotFoundError):
        repo.update_asset_name(uuid_module.uuid4(), AssetUpdate(name="X"))


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: the 6 new tests FAIL with `AttributeError`

- [ ] **Step 3: Add the methods**

```python
# backend/app/assets/repository.py — add to imports:
from app.assets.schemas import AssetUpdate
```

```python
    def list_assets(self) -> list[AssetRead]:
        stmt = select(Asset).order_by(Asset.name.asc())
        return [self._to_read(asset) for asset in self.db.scalars(stmt)]

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/repository.py backend/tests/test_asset_repository.py
git commit -m "feat(assets): add list/update/delete and transaction history"
```

---

### Task 7: Repository — bond manual value update

**Files:**
- Modify: `backend/app/assets/repository.py`
- Modify: `backend/tests/test_asset_repository.py`

**Interfaces:**
- Produces (added to `AssetRepository`): `create_manual_value(asset_id, data: AssetValueUpdate) -> AssetRead`; error `NotABondError(asset_id)`.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/test_asset_repository.py
from app.assets.repository import NotABondError
from app.assets.schemas import AssetValueUpdate


def _bond_input(**overrides):
    defaults = dict(
        name="Tesouro IPCA", category=AssetCategory.bond, code=None, currency=Currency.BRL,
        quantity=Decimal("1"), unit_price=Decimal("1000.00"), date=date(2026, 1, 1),
    )
    defaults.update(overrides)
    return AssetCreate(**defaults)


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: the 2 new tests FAIL with `AttributeError`/`ImportError`

- [ ] **Step 3: Add the method**

```python
# backend/app/assets/repository.py — add to imports:
from app.assets.schemas import AssetValueUpdate
```

```python
class NotABondError(Exception):
    def __init__(self, asset_id: uuid.UUID):
        self.asset_id = asset_id
        super().__init__(f"Asset {asset_id} is not a bond; manual value updates are bond-only")
```

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_repository.py -v`
Expected: 15 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/repository.py backend/tests/test_asset_repository.py
git commit -m "feat(assets): add bond-only manual value updates"
```

---

### Task 8: Router and app wiring

**Files:**
- Create: `backend/app/assets/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_asset_router.py`

**Interfaces:**
- Consumes: `AssetRepository` and all its errors (Tasks 4-7), schemas (Task 3).
- Produces: `router = APIRouter(prefix="/api/assets", ...)` mounted in `app.main.app`, exposing `GET/POST /api/assets`, `PATCH/DELETE /api/assets/{asset_id}`, `GET/POST /api/assets/{asset_id}/transactions`, `POST /api/assets/{asset_id}/value`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_asset_router.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    engine.dispose()


def _create_stock(client, **overrides):
    body = {
        "name": "PETR4", "category": "stock", "code": "PETR4", "currency": "BRL",
        "quantity": "10", "unit_price": "30.00", "date": "2026-01-01",
    }
    body.update(overrides)
    return client.post("/api/assets", json=body)


def test_create_and_list_asset(client):
    response = _create_stock(client)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "PETR4"
    assert body["current_value_brl"] == "300.00"

    listed = client.get("/api/assets").json()
    assert len(listed) == 1


def test_create_stock_missing_code_rejected(client):
    response = client.post(
        "/api/assets",
        json={
            "name": "X", "category": "stock", "currency": "BRL", "quantity": "1",
            "unit_price": "1.00", "date": "2026-01-01",
        },
    )
    assert response.status_code == 422


def test_create_usd_asset_without_fx_rate_returns_422(client):
    response = client.post(
        "/api/assets",
        json={
            "name": "AAPL", "category": "stock", "code": "AAPL", "currency": "USD",
            "quantity": "1", "unit_price": "150.00", "date": "2026-01-01",
        },
    )
    assert response.status_code == 422


def test_buy_sell_transaction_flow(client):
    created = _create_stock(client).json()

    sell = client.post(
        f"/api/assets/{created['id']}/transactions",
        json={"type": "sell", "quantity": "4", "unit_price": "40.00", "date": "2026-02-01"},
    )
    assert sell.status_code == 201
    assert sell.json()["realized_gain_loss_brl"] == "40.00"

    transactions = client.get(f"/api/assets/{created['id']}/transactions").json()
    assert len(transactions) == 2


def test_sell_more_than_held_returns_422(client):
    created = _create_stock(client).json()
    response = client.post(
        f"/api/assets/{created['id']}/transactions",
        json={"type": "sell", "quantity": "11", "unit_price": "40.00", "date": "2026-02-01"},
    )
    assert response.status_code == 422


def test_update_asset_name(client):
    created = _create_stock(client).json()
    response = client.patch(f"/api/assets/{created['id']}", json={"name": "Petrobras"})
    assert response.status_code == 200
    assert response.json()["name"] == "Petrobras"


def test_update_missing_asset_returns_404(client):
    response = client.patch(
        "/api/assets/00000000-0000-0000-0000-000000000000", json={"name": "X"}
    )
    assert response.status_code == 404


def test_delete_asset(client):
    created = _create_stock(client).json()
    response = client.delete(f"/api/assets/{created['id']}")
    assert response.status_code == 204
    assert client.get("/api/assets").json() == []


def test_bond_manual_value_update(client):
    created = client.post(
        "/api/assets",
        json={
            "name": "Tesouro", "category": "bond", "currency": "BRL", "quantity": "1",
            "unit_price": "1000.00", "date": "2026-01-01",
        },
    ).json()
    response = client.post(
        f"/api/assets/{created['id']}/value", json={"price": "1050.00", "date": "2026-02-01"}
    )
    assert response.status_code == 200
    assert response.json()["current_value_brl"] == "1050.00"


def test_manual_value_update_rejected_for_non_bond(client):
    created = _create_stock(client).json()
    response = client.post(
        f"/api/assets/{created['id']}/value", json={"price": "35.00", "date": "2026-02-01"}
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_router.py -v`
Expected: FAIL — 404s everywhere since the router doesn't exist yet.

- [ ] **Step 3: Write the router and mount it**

```python
# backend/app/assets/router.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.assets.repository import (
    AssetNotFoundError,
    AssetRepository,
    InsufficientQuantityError,
    MissingFxRateError,
    NotABondError,
)
from app.assets.schemas import (
    AssetCreate,
    AssetRead,
    AssetTransactionCreate,
    AssetTransactionRead,
    AssetUpdate,
    AssetValueUpdate,
)
from app.core.database import get_db

router = APIRouter(prefix="/api/assets", tags=["assets"])


def get_repository(db: Session = Depends(get_db)) -> AssetRepository:
    return AssetRepository(db)


@router.get("", response_model=list[AssetRead])
def list_assets(repo: AssetRepository = Depends(get_repository)):
    return repo.list_assets()


@router.post("", response_model=AssetRead, status_code=201)
def create_asset(data: AssetCreate, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.create_asset(data)
    except MissingFxRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: UUID, data: AssetUpdate, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.update_asset_name(asset_id, data)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: UUID, repo: AssetRepository = Depends(get_repository)):
    try:
        repo.delete_asset(asset_id)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{asset_id}/transactions", response_model=list[AssetTransactionRead])
def list_transactions(asset_id: UUID, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.list_transactions(asset_id)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{asset_id}/transactions", response_model=AssetTransactionRead, status_code=201)
def create_transaction(
    asset_id: UUID, data: AssetTransactionCreate, repo: AssetRepository = Depends(get_repository)
):
    try:
        return repo.create_transaction(asset_id, data)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InsufficientQuantityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except MissingFxRateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{asset_id}/value", response_model=AssetRead)
def update_value(asset_id: UUID, data: AssetValueUpdate, repo: AssetRepository = Depends(get_repository)):
    try:
        return repo.create_manual_value(asset_id, data)
    except AssetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotABondError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
```

```python
# backend/app/main.py — add the import and include_router call
from app.assets.router import router as assets_router
...
app.include_router(assets_router)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && source venv/bin/activate && pytest tests/test_asset_router.py -v`
Expected: 10 passed

Then run the full backend suite to confirm nothing else broke:
Run: `cd backend && source venv/bin/activate && pytest -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/assets/router.py backend/app/main.py backend/tests/test_asset_router.py
git commit -m "feat(assets): expose assets API endpoints"
```

---

### Task 9: Frontend — BRL currency utilities

**Files:**
- Create: `frontend/src/lib/currency.ts`
- Test: `frontend/src/lib/currency.test.ts`

**Interfaces:**
- Produces: `formatBRL(value: string | number): string`, `centsToDecimalString(cents: number): string`, `decimalStringToCents(value: string): number` from `src/lib/currency.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/currency.test.ts
import { describe, expect, it } from 'vitest'
import { centsToDecimalString, decimalStringToCents, formatBRL } from './currency'

function normalizeSpaces(value: string): string {
  return value.replace(/ /g, ' ')
}

describe('formatBRL', () => {
  it('formats a whole number with the BRL symbol and two decimals', () => {
    expect(normalizeSpaces(formatBRL(0))).toBe('R$ 0,00')
  })

  it('uses a period as the thousands separator and comma as the decimal separator', () => {
    expect(normalizeSpaces(formatBRL('1234567.89'))).toBe('R$ 1.234.567,89')
  })

  it('accepts a plain number', () => {
    expect(normalizeSpaces(formatBRL(1234.5))).toBe('R$ 1.234,50')
  })
})

describe('centsToDecimalString / decimalStringToCents', () => {
  it('round-trips cents through a canonical decimal string', () => {
    expect(centsToDecimalString(123456)).toBe('1234.56')
    expect(decimalStringToCents('1234.56')).toBe(123456)
  })

  it('pads single-digit cents with a leading zero', () => {
    expect(centsToDecimalString(105)).toBe('1.05')
  })

  it('treats an empty or invalid string as zero cents', () => {
    expect(decimalStringToCents('')).toBe(0)
    expect(decimalStringToCents('not a number')).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/currency.test.ts`
Expected: FAIL — cannot find module `./currency`

- [ ] **Step 3: Write the utilities**

```ts
// frontend/src/lib/currency.ts
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value
  return BRL_FORMATTER.format(numeric)
}

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const wholePart = Math.floor(abs / 100)
  const centsPart = abs % 100
  return `${sign}${wholePart}.${centsPart.toString().padStart(2, '0')}`
}

export function decimalStringToCents(value: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/currency.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/currency.ts frontend/src/lib/currency.test.ts
git commit -m "feat(currency): add BRL formatting and cents<->decimal conversions"
```

---

### Task 10: Frontend — CurrencyInput component

**Files:**
- Create: `frontend/src/components/CurrencyInput.tsx`
- Test: `frontend/src/components/CurrencyInput.test.tsx`

**Interfaces:**
- Consumes: `formatBRL`, `centsToDecimalString`, `decimalStringToCents` from `src/lib/currency.ts` (Task 9).
- Produces: `CurrencyInput({ value, onChange, className?, id? })` from `src/components/CurrencyInput.tsx` — `value`/`onChange` carry the canonical decimal string (e.g. `"1234.56"`).

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/CurrencyInput.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CurrencyInput } from './CurrencyInput'

function ControlledWrapper() {
  const [value, setValue] = useState('0.00')
  return <CurrencyInput value={value} onChange={setValue} />
}

describe('CurrencyInput', () => {
  it('builds a cents-first masked display as the user types digits', async () => {
    render(<ControlledWrapper />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    await userEvent.type(input, '15000')
    expect(input.value).toContain('150,00')
  })

  it('emits the canonical decimal string via onChange for each keystroke', async () => {
    const handleChange = vi.fn()
    render(<CurrencyInput value="0.00" onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '150')
    expect(handleChange).toHaveBeenLastCalledWith('1.50')
  })

  it('removes the last digit on backspace', async () => {
    const handleChange = vi.fn()
    render(<CurrencyInput value="0.00" onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '150')
    await userEvent.type(input, '{backspace}')
    expect(handleChange).toHaveBeenLastCalledWith('0.15')
  })

  it('resyncs the displayed value when the value prop changes externally', () => {
    const { rerender } = render(<CurrencyInput value="10.00" onChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toContain('10,00')
    rerender(<CurrencyInput value="25.50" onChange={() => {}} />)
    expect(input.value).toContain('25,50')
  })

  it('shows an empty field when the value is zero', () => {
    render(<CurrencyInput value="0.00" onChange={() => {}} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/CurrencyInput.test.tsx`
Expected: FAIL — cannot find module `./CurrencyInput`

- [ ] **Step 3: Write the component**

```tsx
// frontend/src/components/CurrencyInput.tsx
import { useEffect, useState, type KeyboardEvent } from 'react'
import { centsToDecimalString, decimalStringToCents, formatBRL } from '../lib/currency'

interface CurrencyInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
}

const ALLOWED_NON_DIGIT_KEYS = ['Tab', 'ArrowLeft', 'ArrowRight', 'Shift']

export function CurrencyInput({ value, onChange, className, id }: CurrencyInputProps) {
  const [cents, setCents] = useState(() => decimalStringToCents(value))

  useEffect(() => {
    setCents(decimalStringToCents(value))
  }, [value])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault()
      const nextCents = cents * 10 + Number(event.key)
      if (nextCents > Number.MAX_SAFE_INTEGER) return
      setCents(nextCents)
      onChange(centsToDecimalString(nextCents))
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      const nextCents = Math.floor(cents / 10)
      setCents(nextCents)
      onChange(centsToDecimalString(nextCents))
      return
    }
    if (!ALLOWED_NON_DIGIT_KEYS.includes(event.key) && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault()
    }
  }

  return (
    <input
      id={id}
      inputMode="numeric"
      value={cents === 0 ? '' : formatBRL(cents / 100)}
      onChange={() => {}}
      onKeyDown={handleKeyDown}
      className={className}
    />
  )
}
```

Pasting is intentionally inert: since the input is fully controlled and every native change is ignored (`onChange={() => {}}`), a paste event's text is reverted on the next render rather than corrupting the mask. That's accepted behavior for this masked input, not a bug to fix.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/CurrencyInput.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CurrencyInput.tsx frontend/src/components/CurrencyInput.test.tsx
git commit -m "feat(currency): add cents-first masked CurrencyInput"
```

---

### Task 11: Frontend — types, API client patch method, assets API hooks

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`
- Create: `frontend/src/features/assets/types.ts`
- Create: `frontend/src/api/assets.ts`
- Test: `frontend/src/api/assets.test.tsx`

**Interfaces:**
- Produces: `apiClient.patch<T>(path, body)` (added to the existing `apiClient` in `src/api/client.ts`); types `Asset`, `AssetCategory`, `Currency`, `TransactionType`, `AssetCreateInput`, `AssetTransaction`, `AssetTransactionInput`, `AssetValueUpdateInput` from `src/features/assets/types.ts`; hooks `useAssets()`, `useCreateAsset()`, `useUpdateAssetName()`, `useDeleteAsset()`, `useAssetTransactions(assetId: string)`, `useCreateAssetTransaction(assetId: string)`, `useUpdateAssetValue(assetId: string)` from `src/api/assets.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// append to frontend/src/api/client.test.ts
it('sends a PATCH request with a JSON body', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '1' }) })
  vi.stubGlobal('fetch', fetchMock)

  await apiClient.patch('/assets/1', { name: 'New name' })

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/assets/1',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'New name' }) }),
  )
})
```

```tsx
// frontend/src/api/assets.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { useAssets, useCreateAsset, useCreateAssetTransaction } from './assets'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useAssets', () => {
  it('fetches the asset list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: '1', name: 'PETR4' }])

    const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.get).toHaveBeenCalledWith('/assets')
  })
})

describe('useCreateAsset', () => {
  it('posts the new asset', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: '1' })

    const { result } = renderHook(() => useCreateAsset(), { wrapper: createWrapper() })

    result.current.mutate({
      name: 'PETR4', category: 'stock', code: 'PETR4', currency: 'BRL',
      quantity: '10', unit_price: '30.00', date: '2026-01-01', fx_rate_to_brl: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/assets', expect.objectContaining({ name: 'PETR4' }))
  })
})

describe('useCreateAssetTransaction', () => {
  it('posts a transaction for the given asset', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 't1' })

    const { result } = renderHook(() => useCreateAssetTransaction('a1'), { wrapper: createWrapper() })

    result.current.mutate({
      type: 'sell', quantity: '4', unit_price: '40.00', date: '2026-02-01', fx_rate_to_brl: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith(
      '/assets/a1/transactions',
      expect.objectContaining({ type: 'sell' }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/client.test.ts src/api/assets.test.tsx`
Expected: FAIL — `apiClient.patch` doesn't exist, and `./assets` doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/api/client.ts — add to the apiClient object, alongside get/post/put/delete
patch: <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
```

```ts
// frontend/src/features/assets/types.ts
export type AssetCategory = 'reit' | 'stock' | 'bond' | 'bitcoin'
export type Currency = 'USD' | 'EUR' | 'BRL'
export type TransactionType = 'buy' | 'sell'

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  code: string | null
  currency: Currency | null
  quantity: string
  average_cost: string
  average_cost_brl: string
  current_value_brl: string
  unrealized_gain_loss_brl: string
  created_at: string
}

export interface AssetCreateInput {
  name: string
  category: AssetCategory
  code: string | null
  currency: Currency | null
  quantity: string
  unit_price: string
  date: string
  fx_rate_to_brl: string | null
}

export interface AssetTransaction {
  id: string
  asset_id: string
  type: TransactionType
  quantity: string
  unit_price: string
  total_amount: string
  realized_gain_loss_brl: string | null
  date: string
  created_at: string
}

export interface AssetTransactionInput {
  type: TransactionType
  quantity: string
  unit_price: string
  date: string
  fx_rate_to_brl: string | null
}

export interface AssetValueUpdateInput {
  price: string
  date: string
}
```

```ts
// frontend/src/api/assets.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type {
  Asset,
  AssetCreateInput,
  AssetTransaction,
  AssetTransactionInput,
  AssetValueUpdateInput,
} from '../features/assets/types'

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: () => apiClient.get<Asset[]>('/assets'),
  })
}

function useInvalidateAssets() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['assets'] })
}

export function useCreateAsset() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: (input: AssetCreateInput) => apiClient.post<Asset>('/assets', input),
    onSuccess: invalidate,
  })
}

export function useUpdateAssetName() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.patch<Asset>(`/assets/${id}`, { name }),
    onSuccess: invalidate,
  })
}

export function useDeleteAsset() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/assets/${id}`),
    onSuccess: invalidate,
  })
}

export function useAssetTransactions(assetId: string) {
  return useQuery({
    queryKey: ['assets', assetId, 'transactions'],
    queryFn: () => apiClient.get<AssetTransaction[]>(`/assets/${assetId}/transactions`),
    enabled: assetId.length > 0,
  })
}

export function useCreateAssetTransaction(assetId: string) {
  const invalidate = useInvalidateAssets()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssetTransactionInput) =>
      apiClient.post<AssetTransaction>(`/assets/${assetId}/transactions`, input),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['assets', assetId, 'transactions'] })
    },
  })
}

export function useUpdateAssetValue(assetId: string) {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: (input: AssetValueUpdateInput) =>
      apiClient.post<Asset>(`/assets/${assetId}/value`, input),
    onSuccess: invalidate,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/client.test.ts src/api/assets.test.tsx`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/api/assets.ts frontend/src/api/assets.test.tsx frontend/src/features/assets/types.ts
git commit -m "feat(assets): add asset types and API hooks"
```

---

### Task 12: Frontend — AssetRow and AssetsPage

**Files:**
- Create: `frontend/src/features/assets/AssetRow.tsx`
- Create: `frontend/src/features/assets/AssetsPage.tsx`
- Test: `frontend/src/features/assets/AssetsPage.test.tsx`

**Interfaces:**
- Consumes: `formatBRL` (Task 9), `useAssets` and `Asset` type (Task 11), `Fab`/`SkeletonRow` (existing components).
- Produces: `AssetRow({ asset })`, `AssetsPage()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/features/assets/AssetsPage.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { AssetsPage } from './AssetsPage'

vi.mock('../../api/assets')

const ASSETS = [
  {
    id: '1', name: 'PETR4', category: 'stock' as const, code: 'PETR4', currency: 'BRL' as const,
    quantity: '10', average_cost: '30.00', average_cost_brl: '30.00',
    current_value_brl: '350.00', unrealized_gain_loss_brl: '50.00', created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '2', name: 'Bitcoin', category: 'bitcoin' as const, code: null, currency: null,
    quantity: '0.01', average_cost: '250000.00', average_cost_brl: '250000.00',
    current_value_brl: '2500.00', unrealized_gain_loss_brl: '0.00', created_at: '2026-01-01T00:00:00Z',
  },
]

describe('AssetsPage', () => {
  it('shows the summed BRL total and each asset row', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({ data: ASSETS, isLoading: false, error: null } as never)

    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('assets-total')).toHaveTextContent('2.850,00')
    expect(screen.getByTestId('asset-row-1')).toHaveTextContent('PETR4')
    expect(screen.getByTestId('asset-row-2')).toHaveTextContent('Bitcoin')
  })

  it('shows a loading state', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({ data: undefined, isLoading: true, error: null } as never)
    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('assets-total')).not.toBeInTheDocument()
  })

  it('shows an error state', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({
      data: undefined, isLoading: false, error: new Error('x'),
    } as never)
    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Failed to load assets.')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({ data: [], isLoading: false, error: null } as never)
    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('No assets yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/assets/AssetsPage.test.tsx`
Expected: FAIL — cannot find module `./AssetsPage`

- [ ] **Step 3: Write the components**

```tsx
// frontend/src/features/assets/AssetRow.tsx
import { useNavigate } from 'react-router-dom'
import { formatBRL } from '../../lib/currency'
import type { Asset } from './types'

const CATEGORY_LABELS: Record<Asset['category'], string> = {
  reit: 'REIT',
  stock: 'Stock',
  bond: 'Bond',
  bitcoin: 'Bitcoin',
}

interface AssetRowProps {
  asset: Asset
}

export function AssetRow({ asset }: AssetRowProps) {
  const navigate = useNavigate()
  const gain = Number(asset.unrealized_gain_loss_brl)

  return (
    <button
      type="button"
      onClick={() => navigate(`/assets/${asset.id}`)}
      data-testid={`asset-row-${asset.id}`}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface p-4 text-left shadow-elevation-1"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{asset.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {CATEGORY_LABELS[asset.category]}
          </span>
          <p className="text-sm text-gray-500">{asset.quantity}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-medium text-gray-900">{formatBRL(asset.current_value_brl)}</p>
        <p className={gain >= 0 ? 'text-sm text-success-600' : 'text-sm text-danger-600'}>
          {gain >= 0 ? '+' : ''}
          {formatBRL(asset.unrealized_gain_loss_brl)}
        </p>
      </div>
    </button>
  )
}
```

```tsx
// frontend/src/features/assets/AssetsPage.tsx
import { useMemo } from 'react'
import { useAssets } from '../../api/assets'
import { Fab } from '../../components/Fab'
import { SkeletonRow } from '../../components/SkeletonRow'
import { formatBRL } from '../../lib/currency'
import { AssetRow } from './AssetRow'

export function AssetsPage() {
  const { data, isLoading, error } = useAssets()

  const total = useMemo(
    () => (data ?? []).reduce((sum, asset) => sum + Number(asset.current_value_brl), 0),
    [data],
  )

  return (
    <div className="min-h-screen bg-surface-variant">
      <header className="sticky top-0 z-20 bg-surface shadow-elevation-1">
        <div className="mx-auto max-w-2xl px-4">
          <h1 className="py-4 text-xl font-medium text-gray-900">Assets</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        {isLoading && (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}
        {error && <p className="p-6 text-center text-danger-600">Failed to load assets.</p>}
        {!isLoading && !error && data && (
          <>
            <div className="mb-4 rounded-xl bg-surface p-4 shadow-elevation-1" data-testid="assets-total">
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-medium text-gray-900">{formatBRL(total)}</p>
            </div>
            {data.length === 0 ? (
              <p className="p-10 text-center text-gray-500">No assets yet.</p>
            ) : (
              <div className="space-y-3">
                {data.map((asset) => (
                  <AssetRow key={asset.id} asset={asset} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Fab to="/assets/new" label="New asset" />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/assets/AssetsPage.test.tsx`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/assets/AssetRow.tsx frontend/src/features/assets/AssetsPage.tsx frontend/src/features/assets/AssetsPage.test.tsx
git commit -m "feat(assets): add AssetsPage list with BRL total"
```

---

### Task 13: Frontend — AssetForm (create)

**Files:**
- Create: `frontend/src/features/assets/AssetForm.tsx`
- Test: `frontend/src/features/assets/AssetForm.test.tsx`

**Interfaces:**
- Consumes: `CurrencyInput` (Task 10), `useCreateAsset` (Task 11), `AssetCategory`/`Currency` types (Task 11).
- Produces: `AssetForm()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/features/assets/AssetForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { AssetForm } from './AssetForm'

vi.mock('../../api/assets')

function renderForm() {
  vi.mocked(assetsApi.useCreateAsset).mockReturnValue({ mutate: vi.fn() } as never)
  return render(
    <MemoryRouter>
      <AssetForm />
    </MemoryRouter>,
  )
}

describe('AssetForm', () => {
  it('shows Code and Currency fields for a stock', () => {
    renderForm()
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toBeInTheDocument()
  })

  it('hides Code but shows Currency for a bond', async () => {
    renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'bond')
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toBeInTheDocument()
  })

  it('hides both Code and Currency for bitcoin', async () => {
    renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'bitcoin')
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Currency')).not.toBeInTheDocument()
  })

  it('disables save until name, quantity, unit price, and date are filled', async () => {
    renderForm()
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Name'), 'PETR4')
    await userEvent.type(screen.getByLabelText('Code'), 'PETR4')
    await userEvent.type(screen.getByLabelText('Quantity'), '10')
    await userEvent.type(screen.getByLabelText(/Unit price/), '30')
    const dateInput = screen.getByLabelText('Date')
    await userEvent.type(dateInput, '2026-01-01')

    expect(saveButton).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/assets/AssetForm.test.tsx`
Expected: FAIL — cannot find module `./AssetForm`

- [ ] **Step 3: Write the component**

```tsx
// frontend/src/features/assets/AssetForm.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateAsset } from '../../api/assets'
import { CurrencyInput } from '../../components/CurrencyInput'
import type { AssetCategory, Currency } from './types'

const FIELD_CLASSES =
  'w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100'

const CATEGORIES: AssetCategory[] = ['reit', 'stock', 'bond', 'bitcoin']
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

export function AssetForm() {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AssetCategory>('stock')
  const [code, setCode] = useState('')
  const [currency, setCurrency] = useState<Currency>('BRL')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('0.00')
  const [date, setDate] = useState('')
  const [fxRate, setFxRate] = useState('')

  const createAsset = useCreateAsset()
  const navigate = useNavigate()

  const needsCode = category === 'reit' || category === 'stock'
  const needsCurrency = category !== 'bitcoin'
  const isBrlPrice = category === 'bitcoin' || currency === 'BRL'
  const needsFxRate = needsCurrency && currency !== 'BRL'

  const isValid =
    name.trim().length > 0 &&
    (!needsCode || code.trim().length > 0) &&
    Number(quantity) > 0 &&
    Number(unitPrice) > 0 &&
    date.length > 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    createAsset.mutate(
      {
        name,
        category,
        code: needsCode ? code : null,
        currency: needsCurrency ? currency : null,
        quantity,
        unit_price: unitPrice,
        date,
        fx_rate_to_brl: needsFxRate && fxRate ? fxRate : null,
      },
      { onSuccess: () => navigate('/assets') },
    )
  }

  return (
    <div className="min-h-screen bg-surface-variant">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
          <h1 className="mb-6 text-xl font-medium text-gray-900">New asset</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASSES} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AssetCategory)}
                className={FIELD_CLASSES}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {needsCode && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Code</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} className={FIELD_CLASSES} />
              </label>
            )}
            {needsCurrency && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Currency</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className={FIELD_CLASSES}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Quantity</span>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASSES} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Unit price{isBrlPrice ? '' : ` (${currency})`}
              </span>
              {isBrlPrice ? (
                <CurrencyInput value={unitPrice} onChange={setUnitPrice} className={FIELD_CLASSES} />
              ) : (
                <input
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className={FIELD_CLASSES}
                />
              )}
            </label>
            {needsFxRate && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  {currency} → BRL rate (only if today's rate isn't known yet)
                </span>
                <input value={fxRate} onChange={(e) => setFxRate(e.target.value)} className={FIELD_CLASSES} />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASSES} />
            </label>
            <button
              type="submit"
              disabled={!isValid}
              className="mt-2 w-full rounded-lg bg-primary-600 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50"
            >
              Save
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/assets/AssetForm.test.tsx`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/assets/AssetForm.tsx frontend/src/features/assets/AssetForm.test.tsx
git commit -m "feat(assets): add AssetForm create flow"
```

---

### Task 14: Frontend — BuySellForm

**Files:**
- Create: `frontend/src/features/assets/BuySellForm.tsx`
- Test: `frontend/src/features/assets/BuySellForm.test.tsx`

**Interfaces:**
- Consumes: `CurrencyInput` (Task 10), `useCreateAssetTransaction` (Task 11), `Asset` type (Task 11).
- Produces: `BuySellForm({ asset, onDone })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/features/assets/BuySellForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { BuySellForm } from './BuySellForm'
import type { Asset } from './types'

vi.mock('../../api/assets')

const STOCK_BRL: Asset = {
  id: '1', name: 'PETR4', category: 'stock', code: 'PETR4', currency: 'BRL',
  quantity: '10', average_cost: '30.00', average_cost_brl: '30.00',
  current_value_brl: '300.00', unrealized_gain_loss_brl: '0.00', created_at: '2026-01-01T00:00:00Z',
}

const STOCK_USD: Asset = { ...STOCK_BRL, id: '2', currency: 'USD' }

describe('BuySellForm', () => {
  it('shows an FX rate field for a non-BRL asset but not a BRL one', () => {
    const mutate = vi.fn()
    vi.mocked(assetsApi.useCreateAssetTransaction).mockReturnValue({ mutate } as never)

    const { rerender } = render(<BuySellForm asset={STOCK_BRL} onDone={vi.fn()} />)
    expect(screen.queryByLabelText(/BRL rate/)).not.toBeInTheDocument()

    rerender(<BuySellForm asset={STOCK_USD} onDone={vi.fn()} />)
    expect(screen.getByLabelText(/BRL rate/)).toBeInTheDocument()
  })

  it('submits a sell transaction with the entered fields', async () => {
    const mutate = vi.fn((_input, options) => options?.onSuccess?.())
    vi.mocked(assetsApi.useCreateAssetTransaction).mockReturnValue({ mutate } as never)
    const onDone = vi.fn()

    render(<BuySellForm asset={STOCK_BRL} onDone={onDone} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sell' }))
    await userEvent.type(screen.getByLabelText('Quantity'), '4')
    await userEvent.type(screen.getByLabelText(/Unit price/), '40')
    await userEvent.type(screen.getByLabelText('Date'), '2026-02-01')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sell', quantity: '4', date: '2026-02-01' }),
      expect.anything(),
    )
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/assets/BuySellForm.test.tsx`
Expected: FAIL — cannot find module `./BuySellForm`

- [ ] **Step 3: Write the component**

```tsx
// frontend/src/features/assets/BuySellForm.tsx
import { useState, type FormEvent } from 'react'
import { useCreateAssetTransaction } from '../../api/assets'
import { CurrencyInput } from '../../components/CurrencyInput'
import type { Asset, TransactionType } from './types'

const FIELD_CLASSES = 'w-full rounded-lg border border-gray-300 bg-surface px-3 py-2'

interface BuySellFormProps {
  asset: Asset
  onDone: () => void
}

export function BuySellForm({ asset, onDone }: BuySellFormProps) {
  const [type, setType] = useState<TransactionType>('buy')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('0.00')
  const [date, setDate] = useState('')
  const [fxRate, setFxRate] = useState('')

  const createTransaction = useCreateAssetTransaction(asset.id)

  const isBrlPrice = asset.category === 'bitcoin' || asset.currency === 'BRL'
  const needsFxRate = asset.category !== 'bitcoin' && asset.currency !== 'BRL'

  const isValid = Number(quantity) > 0 && Number(unitPrice) > 0 && date.length > 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    createTransaction.mutate(
      {
        type,
        quantity,
        unit_price: unitPrice,
        date,
        fx_rate_to_brl: needsFxRate && fxRate ? fxRate : null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-surface-variant p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType('buy')}
          className={`flex-1 rounded-lg py-2 font-medium ${type === 'buy' ? 'bg-primary-600 text-white' : 'bg-surface text-gray-700'}`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setType('sell')}
          className={`flex-1 rounded-lg py-2 font-medium ${type === 'sell' ? 'bg-primary-600 text-white' : 'bg-surface text-gray-700'}`}
        >
          Sell
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Quantity</span>
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASSES} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Unit price{isBrlPrice ? '' : ` (${asset.currency})`}
        </span>
        {isBrlPrice ? (
          <CurrencyInput value={unitPrice} onChange={setUnitPrice} className={FIELD_CLASSES} />
        ) : (
          <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={FIELD_CLASSES} />
        )}
      </label>
      {needsFxRate && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            {asset.currency} → BRL rate (only if today's rate isn't known yet)
          </span>
          <input value={fxRate} onChange={(e) => setFxRate(e.target.value)} className={FIELD_CLASSES} />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASSES} />
      </label>
      <button
        type="submit"
        disabled={!isValid}
        className="w-full rounded-lg bg-primary-600 py-3 font-medium text-white disabled:pointer-events-none disabled:opacity-50"
      >
        Save
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/assets/BuySellForm.test.tsx`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/assets/BuySellForm.tsx frontend/src/features/assets/BuySellForm.test.tsx
git commit -m "feat(assets): add BuySellForm"
```

---

### Task 15: Frontend — AssetDetailPage

**Files:**
- Create: `frontend/src/features/assets/AssetDetailPage.tsx`
- Test: `frontend/src/features/assets/AssetDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useAssets`, `useAssetTransactions`, `useUpdateAssetValue` (Task 11), `BuySellForm` (Task 14), `CurrencyInput` (Task 10), `formatBRL` (Task 9).
- Produces: `AssetDetailPage()`, rendered at route `/assets/:id`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/features/assets/AssetDetailPage.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { AssetDetailPage } from './AssetDetailPage'
import type { Asset } from './types'

vi.mock('../../api/assets')

const STOCK: Asset = {
  id: '1', name: 'PETR4', category: 'stock', code: 'PETR4', currency: 'BRL',
  quantity: '10', average_cost: '30.00', average_cost_brl: '30.00',
  current_value_brl: '350.00', unrealized_gain_loss_brl: '50.00', created_at: '2026-01-01T00:00:00Z',
}

const BOND: Asset = { ...STOCK, id: '2', category: 'bond', code: null }

function renderDetail(id: string, asset: Asset) {
  vi.mocked(assetsApi.useAssets).mockReturnValue({ data: [asset], isLoading: false, error: null } as never)
  vi.mocked(assetsApi.useAssetTransactions).mockReturnValue({
    data: [
      {
        id: 't1', asset_id: id, type: 'buy', quantity: '10', unit_price: '30.00',
        total_amount: '300.00', realized_gain_loss_brl: null, date: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(assetsApi.useCreateAssetTransaction).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(assetsApi.useUpdateAssetValue).mockReturnValue({ mutate: vi.fn() } as never)

  return render(
    <MemoryRouter initialEntries={[`/assets/${id}`]}>
      <Routes>
        <Route path="/assets/:id" element={<AssetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AssetDetailPage', () => {
  it('shows the asset stats and transaction history', () => {
    renderDetail('1', STOCK)
    expect(screen.getByText('PETR4')).toBeInTheDocument()
    expect(screen.getByTestId('unrealized-gain-loss')).toHaveTextContent('50,00')
    expect(screen.getByTestId('transaction-t1')).toBeInTheDocument()
  })

  it('toggles the Buy/Sell form', async () => {
    renderDetail('1', STOCK)
    expect(screen.queryByRole('button', { name: 'Buy' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Buy / Sell' }))
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument()
  })

  it('shows an Update value action only for bonds', () => {
    renderDetail('2', BOND)
    expect(screen.getByRole('button', { name: 'Update value' })).toBeInTheDocument()
  })

  it('hides the Update value action for non-bonds', () => {
    renderDetail('1', STOCK)
    expect(screen.queryByRole('button', { name: 'Update value' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/assets/AssetDetailPage.test.tsx`
Expected: FAIL — cannot find module `./AssetDetailPage`

- [ ] **Step 3: Write the component**

```tsx
// frontend/src/features/assets/AssetDetailPage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAssets, useAssetTransactions, useUpdateAssetValue } from '../../api/assets'
import { CurrencyInput } from '../../components/CurrencyInput'
import { SkeletonRow } from '../../components/SkeletonRow'
import { formatBRL } from '../../lib/currency'
import { BuySellForm } from './BuySellForm'

export function AssetDetailPage() {
  const { id } = useParams()
  const { data: assets } = useAssets()
  const asset = assets?.find((a) => a.id === id)
  const { data: transactions, isLoading, error } = useAssetTransactions(id ?? '')
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showValueForm, setShowValueForm] = useState(false)
  const [valuePrice, setValuePrice] = useState('0.00')
  const [valueDate, setValueDate] = useState('')
  const updateValue = useUpdateAssetValue(id ?? '')

  if (!asset) {
    return (
      <div className="min-h-screen bg-surface-variant p-4">
        <div className="mx-auto max-w-2xl space-y-3">
          <SkeletonRow />
        </div>
      </div>
    )
  }

  const unitCurrencyLabel = asset.category === 'bitcoin' ? 'BRL' : asset.currency

  return (
    <div className="min-h-screen bg-surface-variant">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
          <h1 className="text-xl font-medium text-gray-900">{asset.name}</h1>
          <p className="mt-2 text-sm text-gray-500">Quantity: {asset.quantity}</p>
          <p className="text-sm text-gray-500">Average cost: {formatBRL(asset.average_cost_brl)}</p>
          <p className="text-2xl font-medium text-gray-900">{formatBRL(asset.current_value_brl)}</p>
          <p
            data-testid="unrealized-gain-loss"
            className={Number(asset.unrealized_gain_loss_brl) >= 0 ? 'text-success-600' : 'text-danger-600'}
          >
            {formatBRL(asset.unrealized_gain_loss_brl)}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setShowTransactionForm((v) => !v)}
              className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white"
            >
              Buy / Sell
            </button>
            {asset.category === 'bond' && (
              <button
                type="button"
                onClick={() => setShowValueForm((v) => !v)}
                className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700"
              >
                Update value
              </button>
            )}
          </div>
        </div>

        {showTransactionForm && (
          <BuySellForm asset={asset} onDone={() => setShowTransactionForm(false)} />
        )}

        {showValueForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateValue.mutate(
                { price: valuePrice, date: valueDate },
                { onSuccess: () => setShowValueForm(false) },
              )
            }}
            className="space-y-4 rounded-lg bg-surface-variant p-4"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">New value</span>
              <CurrencyInput
                value={valuePrice}
                onChange={setValuePrice}
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
              <input
                type="date"
                value={valueDate}
                onChange={(e) => setValueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={Number(valuePrice) <= 0 || valueDate.length === 0}
              className="w-full rounded-lg bg-primary-600 py-3 font-medium text-white disabled:pointer-events-none disabled:opacity-50"
            >
              Save
            </button>
          </form>
        )}

        <div className="rounded-xl bg-surface p-4 shadow-elevation-1">
          <h2 className="mb-2 font-medium text-gray-900">Transaction history</h2>
          {isLoading && <SkeletonRow />}
          {error && <p className="text-danger-600">Failed to load transactions.</p>}
          {transactions && transactions.length === 0 && (
            <p className="text-gray-500">No transactions yet.</p>
          )}
          {transactions && transactions.length > 0 && (
            <ul className="space-y-2">
              {transactions.map((t) => (
                <li key={t.id} data-testid={`transaction-${t.id}`} className="flex justify-between text-sm">
                  <span>
                    {t.type} {t.quantity} @ {t.unit_price} {unitCurrencyLabel} · {t.date}
                  </span>
                  {t.realized_gain_loss_brl !== null && (
                    <span
                      className={
                        Number(t.realized_gain_loss_brl) >= 0 ? 'text-success-600' : 'text-danger-600'
                      }
                    >
                      {formatBRL(t.realized_gain_loss_brl)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/assets/AssetDetailPage.test.tsx`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/assets/AssetDetailPage.tsx frontend/src/features/assets/AssetDetailPage.test.tsx
git commit -m "feat(assets): add AssetDetailPage with buy/sell and bond value update"
```

---

### Task 16: Routing, cross-navigation, and manual verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/expenses/ExpensesPage.tsx`

**Interfaces:**
- Consumes: `AssetsPage` (Task 12), `AssetForm` (Task 13), `AssetDetailPage` (Task 15).

- [ ] **Step 1: Add routes**

```tsx
// frontend/src/App.tsx
import { Route, Routes, useParams } from 'react-router-dom'
import { usePaidExpenses, useUnpaidExpenses } from './api/expenses'
import { SkeletonRow } from './components/SkeletonRow'
import { AssetDetailPage } from './features/assets/AssetDetailPage'
import { AssetForm } from './features/assets/AssetForm'
import { AssetsPage } from './features/assets/AssetsPage'
import { ExpenseForm } from './features/expenses/ExpenseForm/ExpenseForm'
import { ExpensesPage } from './features/expenses/ExpensesPage'

function EditExpenseRoute() {
  const { id } = useParams()
  const unpaid = useUnpaidExpenses()
  const paid = usePaidExpenses()

  const expense =
    unpaid.data?.find((e) => e.id === id) ?? paid.data?.pages.flat().find((e) => e.id === id)

  if (!expense) {
    return (
      <div className="min-h-screen bg-surface-variant p-4">
        <div className="mx-auto max-w-2xl space-y-3">
          <SkeletonRow />
        </div>
      </div>
    )
  }

  return <ExpenseForm mode="edit" initialExpense={expense} />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<ExpensesPage />} />
      <Route path="/expenses/new" element={<ExpenseForm mode="create" />} />
      <Route path="/expenses/:id/edit" element={<EditExpenseRoute />} />
      <Route path="/assets" element={<AssetsPage />} />
      <Route path="/assets/new" element={<AssetForm />} />
      <Route path="/assets/:id" element={<AssetDetailPage />} />
    </Routes>
  )
}

export default App
```

- [ ] **Step 2: Add a way back and forth between Expenses and Assets**

There's no nav shell yet (that lands with the separate, not-yet-implemented Dashboard spec), so add a minimal link on each page's header for reachability:

```tsx
// frontend/src/features/expenses/ExpensesPage.tsx — inside the <header>, next to the h1
import { Link } from 'react-router-dom'
// ...
<header className="sticky top-0 z-20 bg-surface shadow-elevation-1">
  <div className="mx-auto flex max-w-2xl items-center justify-between px-4">
    <h1 className="py-4 text-xl font-medium text-gray-900">Financial Control</h1>
    <Link to="/assets" className="text-sm font-medium text-primary-600">
      Assets
    </Link>
  </div>
</header>
```

```tsx
// frontend/src/features/assets/AssetsPage.tsx — same treatment in its <header>
import { Link } from 'react-router-dom'
// ...
<header className="sticky top-0 z-20 bg-surface shadow-elevation-1">
  <div className="mx-auto flex max-w-2xl items-center justify-between px-4">
    <h1 className="py-4 text-xl font-medium text-gray-900">Assets</h1>
    <Link to="/" className="text-sm font-medium text-primary-600">
      Expenses
    </Link>
  </div>
</header>
```

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all passed

- [ ] **Step 4: Manual verification**

Run: `docker-compose up`
Then in the browser:
1. Go to `http://localhost:5173/`, click "Assets" — the (empty) Assets list loads.
2. Click the FAB, create a BRL stock (e.g. name "PETR4", category stock, code "PETR4", currency BRL, quantity 10, unit price R$30,00, today's date). Confirm it appears in the list with a R$300,00 value and the total banner matches.
3. Open the asset, click "Buy / Sell", record a sell of 4 @ R$40,00 — confirm quantity drops to 6 and a realized gain shows in the transaction history.
4. Create a Bond and confirm "Update value" works and changes its current value.
5. Create a Bitcoin asset (quantity + BRL unit price only, no code/currency fields shown) and confirm it lists correctly.
6. Create a USD stock without an FX rate — confirm the create is rejected; retry with an FX rate filled in and confirm it succeeds and `average_cost_brl` reflects the conversion.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/features/expenses/ExpensesPage.tsx frontend/src/features/assets/AssetsPage.tsx
git commit -m "feat(assets): wire up routing and cross-navigation with Expenses"
```
