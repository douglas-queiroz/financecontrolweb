from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.expenses.recurrence import RecurrenceFrequency
from app.expenses.schemas import ExpenseCreate


def test_valid_expense_create():
    expense = ExpenseCreate(description="Rent", amount=Decimal("100.00"), due_date=date(2026, 1, 1))
    assert expense.description == "Rent"


def test_rejects_empty_description():
    with pytest.raises(ValidationError):
        ExpenseCreate(description="  ", amount=Decimal("10"), due_date=date(2026, 1, 1))


def test_rejects_non_positive_amount():
    with pytest.raises(ValidationError):
        ExpenseCreate(description="Rent", amount=Decimal("0"), due_date=date(2026, 1, 1))


def test_requires_frequency_when_recurring():
    with pytest.raises(ValidationError):
        ExpenseCreate(
            description="Rent",
            amount=Decimal("100"),
            due_date=date(2026, 1, 1),
            is_recurring=True,
        )


def test_allows_recurring_with_frequency():
    expense = ExpenseCreate(
        description="Rent",
        amount=Decimal("100"),
        due_date=date(2026, 1, 1),
        is_recurring=True,
        recurrence_frequency=RecurrenceFrequency.monthly,
    )
    assert expense.recurrence_frequency == RecurrenceFrequency.monthly