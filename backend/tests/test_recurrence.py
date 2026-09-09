from datetime import date

from app.expenses.recurrence import RecurrenceFrequency, next_due_date


def test_daily_interval_1():
    assert next_due_date(date(2026, 1, 1), RecurrenceFrequency.daily, 1, None) == date(2026, 1, 2)


def test_daily_interval_3():
    assert next_due_date(date(2026, 1, 1), RecurrenceFrequency.daily, 3, None) == date(2026, 1, 4)


def test_weekly_interval_1():
    assert next_due_date(date(2026, 1, 1), RecurrenceFrequency.weekly, 1, None) == date(2026, 1, 8)


def test_weekly_interval_2():
    assert next_due_date(date(2026, 1, 1), RecurrenceFrequency.weekly, 2, None) == date(2026, 1, 15)


def test_monthly_interval_1():
    assert next_due_date(date(2026, 1, 15), RecurrenceFrequency.monthly, 1, None) == date(2026, 2, 15)


def test_monthly_month_end_non_leap_year():
    assert next_due_date(date(2026, 1, 31), RecurrenceFrequency.monthly, 1, None) == date(2026, 2, 28)


def test_monthly_month_end_leap_year():
    assert next_due_date(date(2024, 1, 31), RecurrenceFrequency.monthly, 1, None) == date(2024, 2, 29)


def test_yearly_leap_day():
    assert next_due_date(date(2024, 2, 29), RecurrenceFrequency.yearly, 1, None) == date(2025, 2, 28)


def test_returns_none_past_end_date():
    result = next_due_date(date(2026, 1, 25), RecurrenceFrequency.weekly, 1, date(2026, 1, 30))
    assert result is None


def test_returns_date_when_equal_to_end_date():
    result = next_due_date(date(2026, 1, 1), RecurrenceFrequency.weekly, 1, date(2026, 1, 8))
    assert result == date(2026, 1, 8)