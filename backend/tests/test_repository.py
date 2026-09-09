from datetime import date, datetime, timezone
from decimal import Decimal

from app.expenses.recurrence import RecurrenceFrequency
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


def test_mark_as_paid_sets_paid_at(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    paid_at = datetime(2026, 1, 2, tzinfo=timezone.utc)
    result = repo.mark_as_paid(expense.id, paid_at)

    assert result.paid_at == paid_at


def test_mark_as_paid_recurring_creates_next_occurrence(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(
        make_input(
            is_recurring=True,
            recurrence_frequency=RecurrenceFrequency.monthly,
            due_date=date(2026, 1, 1),
        )
    )

    repo.mark_as_paid(expense.id, datetime(2026, 1, 1, tzinfo=timezone.utc))

    unpaid = repo.fetch_unpaid(limit=20)
    assert any(e.due_date == date(2026, 2, 1) for e in unpaid)


def test_mark_as_paid_non_recurring_creates_nothing_extra(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    repo.mark_as_paid(expense.id, datetime(2026, 1, 1, tzinfo=timezone.utc))

    paid = repo.fetch_paid(offset=0, limit=20)
    unpaid = repo.fetch_unpaid(limit=20)
    assert len(paid) == 1
    assert len(unpaid) == 0


def test_reverse_payment_clears_paid_at(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())
    repo.mark_as_paid(expense.id, datetime(2026, 1, 1, tzinfo=timezone.utc))

    result = repo.reverse_payment(expense.id)

    assert result.paid_at is None