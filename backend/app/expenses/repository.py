import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.expenses.models import Expense
from app.expenses.recurrence import RecurrenceFrequency, next_due_date
from app.expenses.schemas import ExpenseCreate, ExpenseUpdate


class ExpenseNotFoundError(Exception):
    def __init__(self, expense_id: uuid.UUID):
        self.expense_id = expense_id
        super().__init__(f"Expense {expense_id} not found")


class ExpenseRepository:
    def __init__(self, db: Session):
        self.db = db

    def fetch_unpaid(self, limit: int = 20) -> list[Expense]:
        stmt = (
            select(Expense)
            .where(Expense.paid_at.is_(None))
            .order_by(Expense.due_date.asc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt))

    def fetch_paid(self, offset: int = 0, limit: int = 20) -> list[Expense]:
        stmt = (
            select(Expense)
            .where(Expense.paid_at.is_not(None))
            .order_by(Expense.paid_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.scalars(stmt))

    def _get(self, expense_id: uuid.UUID) -> Expense:
        expense = self.db.get(Expense, expense_id)
        if expense is None:
            raise ExpenseNotFoundError(expense_id)
        return expense

    def create(self, data: ExpenseCreate) -> Expense:
        expense = Expense(
            id=uuid.uuid4(),
            description=data.description,
            amount=data.amount,
            due_date=data.due_date,
            is_recurring=data.is_recurring,
            recurrence_frequency=data.recurrence_frequency.value if data.recurrence_frequency else None,
            recurrence_interval=data.recurrence_interval,
            recurrence_end_date=data.recurrence_end_date,
        )
        self.db.add(expense)
        self.db.commit()
        self.db.refresh(expense)
        return expense

    def update(self, expense_id: uuid.UUID, data: ExpenseUpdate) -> Expense:
        expense = self._get(expense_id)
        expense.description = data.description
        expense.amount = data.amount
        expense.due_date = data.due_date
        expense.is_recurring = data.is_recurring
        expense.recurrence_frequency = data.recurrence_frequency.value if data.recurrence_frequency else None
        expense.recurrence_interval = data.recurrence_interval
        expense.recurrence_end_date = data.recurrence_end_date
        self.db.commit()
        self.db.refresh(expense)
        return expense

    def delete(self, expense_id: uuid.UUID) -> None:
        expense = self._get(expense_id)
        self.db.delete(expense)
        self.db.commit()

    def mark_as_paid(self, expense_id: uuid.UUID, paid_at: datetime) -> Expense:
        expense = self._get(expense_id)
        expense.paid_at = paid_at
        self.db.commit()

        if expense.is_recurring and expense.recurrence_frequency:
            next_date = next_due_date(
                expense.due_date,
                RecurrenceFrequency(expense.recurrence_frequency),
                expense.recurrence_interval,
                expense.recurrence_end_date,
            )
            if next_date is not None:
                occurrence = Expense(
                    id=uuid.uuid4(),
                    description=expense.description,
                    amount=expense.amount,
                    due_date=next_date,
                    is_recurring=expense.is_recurring,
                    recurrence_frequency=expense.recurrence_frequency,
                    recurrence_interval=expense.recurrence_interval,
                    recurrence_end_date=expense.recurrence_end_date,
                )
                self.db.add(occurrence)
                self.db.commit()

        return expense

    def reverse_payment(self, expense_id: uuid.UUID) -> Expense:
        expense = self._get(expense_id)
        expense.paid_at = None
        self.db.commit()
        self.db.refresh(expense)
        return expense