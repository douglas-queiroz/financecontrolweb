import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.expenses.models import Expense
from app.expenses.recurrence import RecurrenceFrequency, next_due_date
from app.expenses.schemas import ExpenseCreate, ExpenseUpdate, MonthlyTotal


class ExpenseNotFoundError(Exception):
    def __init__(self, expense_id: uuid.UUID):
        self.expense_id = expense_id
        super().__init__(f"Expense {expense_id} not found")


class ExpenseRepository:
    def __init__(self, db: Session):
        self.db = db

    def fetch_by_month(self, year: int, month: int) -> list[Expense]:
        start_of_month = date(year, month, 1)
        if month == 12:
            end_of_month_exclusive = date(year + 1, 1, 1)
        else:
            end_of_month_exclusive = date(year, month + 1, 1)

        stmt = (
            select(Expense)
            .where(
                Expense.due_date >= start_of_month,
                Expense.due_date < end_of_month_exclusive,
            )
            .order_by(Expense.paid_at.is_(None).desc(), Expense.due_date.asc())
        )
        return list(self.db.scalars(stmt))

    def _get(self, expense_id: uuid.UUID) -> Expense:
        expense = self.db.get(Expense, expense_id)
        if expense is None:
            raise ExpenseNotFoundError(expense_id)
        return expense

    def get(self, expense_id: uuid.UUID) -> Expense:
        return self._get(expense_id)

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

    def fetch_monthly_totals(self, today: date) -> list[MonthlyTotal]:
        start_index = today.year * 12 + (today.month - 1) - 11
        start_year, start_month = divmod(start_index, 12)
        start_of_range = date(start_year, start_month + 1, 1)

        last_index = today.year * 12 + (today.month - 1)
        end_year, end_month = divmod(last_index + 1, 12)
        end_of_range_exclusive = date(end_year, end_month + 1, 1)

        stmt = select(Expense).where(
            Expense.due_date >= start_of_range,
            Expense.due_date < end_of_range_exclusive,
        )
        rows = list(self.db.scalars(stmt))

        buckets: dict[tuple[int, int], Decimal] = {}
        for expense in rows:
            key = (expense.due_date.year, expense.due_date.month)
            buckets[key] = buckets.get(key, Decimal("0")) + expense.amount

        totals: list[MonthlyTotal] = []
        for offset in range(12):
            index = start_index + offset
            year, month = divmod(index, 12)
            month_number = month + 1
            totals.append(
                MonthlyTotal(
                    month=f"{year}-{month_number:02d}",
                    total=buckets.get((year, month_number), Decimal("0")),
                )
            )
        return totals