import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.expenses.models import Expense
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