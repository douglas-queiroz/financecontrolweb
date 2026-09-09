from datetime import date
from decimal import Decimal

from app.expenses.repository import ExpenseRepository
from app.expenses.schemas import ExpenseCreate, ExpenseUpdate


def make_input(**overrides):
    defaults = dict(description="Rent", amount=Decimal("100.00"), due_date=date(2026, 1, 1))
    defaults.update(overrides)
    return ExpenseCreate(**defaults)


def test_create_expense(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())
    assert expense.id is not None
    assert expense.description == "Rent"


def test_fetch_unpaid_sorted_by_due_date(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(description="B", due_date=date(2026, 2, 1)))
    repo.create(make_input(description="A", due_date=date(2026, 1, 1)))

    result = repo.fetch_unpaid(limit=20)
    assert [e.description for e in result] == ["A", "B"]


def test_fetch_unpaid_respects_limit(db_session):
    repo = ExpenseRepository(db_session)
    for i in range(5):
        repo.create(make_input(description=f"E{i}", due_date=date(2026, 1, i + 1)))

    result = repo.fetch_unpaid(limit=3)
    assert len(result) == 3


def test_update_expense(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    updated = repo.update(
        expense.id,
        ExpenseUpdate(description="Rent (updated)", amount=Decimal("150.00"), due_date=date(2026, 1, 5)),
    )
    assert updated.description == "Rent (updated)"
    assert updated.amount == Decimal("150.00")


def test_delete_expense(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    repo.delete(expense.id)

    result = repo.fetch_unpaid(limit=20)
    assert result == []