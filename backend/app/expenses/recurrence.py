from datetime import date
from enum import Enum

from dateutil.relativedelta import relativedelta


class RecurrenceFrequency(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


_DELTA_BY_FREQUENCY = {
    RecurrenceFrequency.daily: lambda n: relativedelta(days=n),
    RecurrenceFrequency.weekly: lambda n: relativedelta(weeks=n),
    RecurrenceFrequency.monthly: lambda n: relativedelta(months=n),
    RecurrenceFrequency.yearly: lambda n: relativedelta(years=n),
}


def next_due_date(
    current_due_date: date,
    frequency: RecurrenceFrequency,
    interval: int,
    end_date: date | None,
) -> date | None:
    delta = _DELTA_BY_FREQUENCY[frequency](interval)
    candidate = current_due_date + delta
    if end_date is not None and candidate > end_date:
        return None
    return candidate