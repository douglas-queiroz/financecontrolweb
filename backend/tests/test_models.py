import uuid
from datetime import date

from app.expenses.models import Expense


def test_create_and_read_expense(db_session):
    expense = Expense(
        id=uuid.uuid4(),
        description="Rent",
        amount="1200.00",
        due_date=date(2026, 1, 1),
    )
    db_session.add(expense)
    db_session.commit()

    fetched = db_session.get(Expense, expense.id)
    assert fetched is not None
    assert fetched.description == "Rent"
    assert fetched.is_recurring is False
    assert fetched.recurrence_interval == 1