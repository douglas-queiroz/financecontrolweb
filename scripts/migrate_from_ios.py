"""One-off migration of expenses from the iOS app's Core Data SQLite store.

Usage:
    python scripts/migrate_from_ios.py path/to/CoreData.sqlite --confirm
"""

import argparse
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.core.database import SessionLocal  # noqa: E402
from app.expenses.models import Expense  # noqa: E402

CORE_DATA_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)

EXPECTED_COLUMNS = {
    "ZEXPENSEDESCRIPTION": "description",
    "ZAMOUNT": "amount",
    "ZDUEDATE": "due_date",
    "ZPAIDAT": "paid_at",
    "ZCREATEDAT": "created_at",
    "ZUPDATEDAT": "updated_at",
    "ZISRECURRING": "is_recurring",
    "ZRECURRENCEFREQUENCY": "recurrence_frequency",
    "ZRECURRENCEINTERVAL": "recurrence_interval",
    "ZRECURRENCEENDDATE": "recurrence_end_date",
}


def core_data_timestamp_to_datetime(value: float | None) -> datetime | None:
    if value is None:
        return None
    return CORE_DATA_EPOCH + timedelta(seconds=value)


def find_expense_table(conn: sqlite3.Connection) -> str:
    tables = [
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%EXPENSE%'"
        )
    ]
    if not tables:
        raise SystemExit("No table matching '%EXPENSE%' found in the Core Data store.")
    return tables[0]


def describe_mapping(conn: sqlite3.Connection, table: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    print(f"Found table: {table}")
    for source, target in EXPECTED_COLUMNS.items():
        status = "OK" if source in columns else "MISSING"
        print(f"  {source} -> {target}  [{status}]")
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"Rows to import: {count}")


def import_rows(conn: sqlite3.Connection, table: str) -> int:
    columns = ", ".join(EXPECTED_COLUMNS.keys())
    rows = conn.execute(f"SELECT {columns} FROM {table}").fetchall()

    session = SessionLocal()
    imported = 0
    try:
        for row in rows:
            values = dict(zip(EXPECTED_COLUMNS.values(), row))
            due_date = core_data_timestamp_to_datetime(values["due_date"])
            end_date = core_data_timestamp_to_datetime(values["recurrence_end_date"])
            expense = Expense(
                id=uuid.uuid4(),
                description=values["description"],
                amount=Decimal(str(values["amount"])),
                due_date=due_date.date(),
                paid_at=core_data_timestamp_to_datetime(values["paid_at"]),
                created_at=core_data_timestamp_to_datetime(values["created_at"]),
                updated_at=core_data_timestamp_to_datetime(values["updated_at"]),
                is_recurring=bool(values["is_recurring"]),
                recurrence_frequency=values["recurrence_frequency"],
                recurrence_interval=values["recurrence_interval"] or 1,
                recurrence_end_date=end_date.date() if end_date is not None else None,
            )
            session.add(expense)
            imported += 1
        session.commit()
    finally:
        session.close()
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite_path", type=Path, help="Path to the Core Data .sqlite file")
    parser.add_argument("--confirm", action="store_true", help="Actually perform the import")
    args = parser.parse_args()

    conn = sqlite3.connect(f"file:{args.sqlite_path}?mode=ro", uri=True)
    try:
        table = find_expense_table(conn)
        describe_mapping(conn, table)

        if not args.confirm:
            print("\nDry run only. Re-run with --confirm to import these rows.")
            return

        imported = import_rows(conn, table)
        print(f"\nImported {imported} expenses.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()