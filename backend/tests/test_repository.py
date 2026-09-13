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


def test_fetch_by_month_sorted_by_due_date(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(description="B", due_date=date(2026, 1, 20)))
    repo.create(make_input(description="A", due_date=date(2026, 1, 5)))

    result = repo.fetch_by_month(year=2026, month=1)
    assert [e.description for e in result] == ["A", "B"]


def test_fetch_by_month_excludes_other_months(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(description="December", due_date=date(2025, 12, 31)))
    repo.create(make_input(description="January", due_date=date(2026, 1, 1)))
    repo.create(make_input(description="February", due_date=date(2026, 2, 1)))

    result = repo.fetch_by_month(year=2026, month=1)
    assert [e.description for e in result] == ["January"]


def test_fetch_by_month_handles_december_year_wraparound(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(description="December", due_date=date(2025, 12, 15)))
    repo.create(make_input(description="Next January", due_date=date(2026, 1, 1)))

    result = repo.fetch_by_month(year=2025, month=12)
    assert [e.description for e in result] == ["December"]


def test_fetch_by_month_orders_unpaid_before_paid_then_by_due_date(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(description="Early unpaid", due_date=date(2026, 1, 10)))
    repo.create(make_input(description="Late unpaid", due_date=date(2026, 1, 20)))
    paid = repo.create(make_input(description="Paid early", due_date=date(2026, 1, 5)))
    repo.mark_as_paid(paid.id, datetime(2026, 1, 5, tzinfo=timezone.utc))

    result = repo.fetch_by_month(year=2026, month=1)
    assert [e.description for e in result] == ["Early unpaid", "Late unpaid", "Paid early"]


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

    result = repo.fetch_by_month(year=2026, month=1)
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

    next_month = repo.fetch_by_month(year=2026, month=2)
    assert any(e.due_date == date(2026, 2, 1) for e in next_month)


def test_mark_as_paid_non_recurring_creates_nothing_extra(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    repo.mark_as_paid(expense.id, datetime(2026, 1, 1, tzinfo=timezone.utc))

    result = repo.fetch_by_month(year=2026, month=1)
    assert len(result) == 1
    assert result[0].paid_at is not None


def test_reverse_payment_clears_paid_at(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())
    repo.mark_as_paid(expense.id, datetime(2026, 1, 1, tzinfo=timezone.utc))

    result = repo.reverse_payment(expense.id)

    assert result.paid_at is None


def test_fetch_monthly_totals_sums_across_months(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(description="Rent", amount=Decimal("100.00"), due_date=date(2025, 11, 5)))
    repo.create(make_input(description="Water", amount=Decimal("23.45"), due_date=date(2025, 11, 20)))
    repo.create(make_input(description="Internet", amount=Decimal("88.00"), due_date=date(2026, 9, 10)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert len(totals) == 12
    assert totals[0].month == "2025-10"
    assert totals[1].month == "2025-11"
    assert totals[-1].month == "2026-09"


def test_fetch_monthly_totals_zero_fills_empty_months(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(amount=Decimal("50.00"), due_date=date(2026, 9, 1)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert [t.total for t in totals] == [
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("0"),
        Decimal("50.00"),
    ]


def test_fetch_monthly_totals_buckets_boundary_dates(db_session):
    repo = ExpenseRepository(db_session)
    repo.create(make_input(amount=Decimal("10"), due_date=date(2025, 10, 1)))
    repo.create(make_input(amount=Decimal("20"), due_date=date(2025, 10, 31)))
    repo.create(make_input(amount=Decimal("30"), due_date=date(2025, 11, 1)))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert totals[0].month == "2025-10"
    assert totals[0].total == Decimal("30")
    assert totals[1].month == "2025-11"
    assert totals[1].total == Decimal("30")


def test_fetch_monthly_totals_includes_paid_expenses(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input(amount=Decimal("77.00"), due_date=date(2026, 9, 1)))
    repo.mark_as_paid(expense.id, datetime(2026, 9, 1, tzinfo=timezone.utc))

    totals = repo.fetch_monthly_totals(date(2026, 9, 15))

    assert totals[-1].month == "2026-09"
    assert totals[-1].total == Decimal("77.00")