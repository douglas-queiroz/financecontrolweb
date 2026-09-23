from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_serializer, field_validator, model_validator

from app.expenses.recurrence import RecurrenceFrequency


class ExpenseBase(BaseModel):
    description: str
    amount: Decimal
    due_date: date
    is_recurring: bool = False
    recurrence_frequency: RecurrenceFrequency | None = None
    recurrence_interval: int = 1
    recurrence_end_date: date | None = None

    @field_validator("description")
    @classmethod
    def description_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("description must not be empty")
        return value

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("amount must be greater than 0")
        return value

    @model_validator(mode="after")
    def frequency_required_if_recurring(self) -> "ExpenseBase":
        if self.is_recurring and self.recurrence_frequency is None:
            raise ValueError("recurrence_frequency is required when is_recurring is true")
        return self


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(ExpenseBase):
    pass


class MonthlyTotal(BaseModel):
    month: str
    total: Decimal
    all_paid: bool | None = None
    next_month_total: Decimal | None = None

    @field_serializer("total")
    def serialize_total(self, value: Decimal) -> str:
        return f"{value:.2f}"

    @field_serializer("next_month_total")
    def serialize_next_month_total(self, value: Decimal | None) -> str | None:
        return f"{value:.2f}" if value is not None else None


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    description: str
    amount: Decimal
    due_date: date
    paid_at: datetime | None
    created_at: datetime
    updated_at: datetime
    is_recurring: bool
    recurrence_frequency: RecurrenceFrequency | None
    recurrence_interval: int
    recurrence_end_date: date | None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)