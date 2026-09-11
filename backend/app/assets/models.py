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