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


class MonthlyTotal(BaseModel):
    month: str
    total: Decimal

    @field_serializer("total")
    def serialize_total(self, value: Decimal) -> str:
        return f"{value:.2f}"


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
        return f"{value:.2f}"


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
        return f"{value:.2f}"

    @field_serializer("realized_gain_loss_brl")
    def serialize_realized(self, value: Decimal | None) -> str | None:
        return f"{value:.2f}" if value is not None else None