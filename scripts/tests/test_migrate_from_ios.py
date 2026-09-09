import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import Base  # noqa: E402
from app.expenses.models import Expense  # noqa: E402

import migrate_from_ios as migrate  # noqa: E402


def test_core_data_timestamp_to_datetime():
    result = migrate.core_data_timestamp_to_datetime(0)
    assert result == datetime(2001, 1, 1, tzinfo=timezone.utc)


def test_core_data_timestamp_to_datetime_none():
    assert migrate.core_data_timestamp_to_datetime(None) is None


@pytest.fixture()
def core_data_fixture(tmp_path):
    db_path = tmp_path / "CoreData.sqlite"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE ZEXPENSE (
            ZEXPENSEDESCRIPTION TEXT,
            ZAMOUNT REAL,
            ZDUEDATE REAL,
            ZPAIDAT REAL,
            ZCREATEDAT REAL,
            ZUPDATEDAT REAL,
            ZISRECURRING INTEGER,
            ZRECURRENCEFREQUENCY TEXT,
            ZRECURRENCEINTERVAL INTEGER,
            ZRECURRENCEENDDATE REAL
        )
        """
    )
    conn.execute(
        "INSERT INTO ZEXPENSE VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("Rent", 1200.0, 0.0, None, 0.0, 0.0, 0, None, 1, None),
    )
    conn.commit()
    conn.close()
    return db_path


def test_find_expense_table(core_data_fixture):
    conn = sqlite3.connect(core_data_fixture)
    try:
        assert migrate.find_expense_table(conn) == "ZEXPENSE"
    finally:
        conn.close()


def test_import_rows_creates_expense(core_data_fixture, monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(bind=engine)
    monkeypatch.setattr(migrate, "SessionLocal", TestSessionLocal)

    conn = sqlite3.connect(core_data_fixture)
    try:
        imported = migrate.import_rows(conn, "ZEXPENSE")
    finally:
        conn.close()

    assert imported == 1

    session = TestSessionLocal()
    try:
        expenses = session.query(Expense).all()
        assert len(expenses) == 1
        assert expenses[0].description == "Rent"
        assert expenses[0].due_date == datetime(2001, 1, 1, tzinfo=timezone.utc).date()
    finally:
        session.close()