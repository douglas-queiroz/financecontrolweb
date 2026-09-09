# Expenses Web Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FastAPI backend and React frontend that ports the iOS "Financial Control" app's Expenses feature (CRUD, paid/unpaid tabs, recurring expenses) to the web, plus a one-off migration script from the iOS Core Data store.

**Architecture:** Monorepo with `backend/` (FastAPI + SQLAlchemy + Alembic + SQLite) and `frontend/` (React + TypeScript + Vite + TanStack Query + Tailwind), run together locally via `docker-compose`. Backend exposes a REST API under `/api/expenses`; frontend consumes it via a small typed API client and TanStack Query hooks.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, pytest; Node 20, React 18, TypeScript, Vite, React Router, @tanstack/react-query, Tailwind CSS, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-expenses-web-port-design.md`

## Global Constraints

- No authentication — single-user, local-only deployment (spec §2).
- Feature scope is Expenses only: no categories, budgets, tags, multi-currency, or reporting (spec §2).
- SQLite for local dev; no cloud deployment target for this plan (spec §2, §10).
- Domain logic (recurrence calculator, repository), API endpoints, and all frontend components/hooks are built TDD — test written and run red before implementation (spec §8).
- Backend and frontend communicate only through the REST API under `/api/expenses` — no shared code between them (spec §3).
- Migration script requires an explicit `--confirm` flag before writing any data (spec §7).

---

### Task 1: Backend project scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/Dockerfile`
- Create: `backend/.gitignore`

**Interfaces:**
- Produces: `app.main.app` (a `FastAPI` instance), importable as `from app.main import app`. Later tasks add routers/middleware to this instance.

- [ ] **Step 1: Create dependency and project files**

`backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.35
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
python-dateutil==2.9.0.post0
pytest==8.3.3
httpx==0.27.2
```

`backend/pyproject.toml`:
```toml
[tool.pytest.ini_options]
pythonpath = ["."]
```

`backend/.gitignore`:
```
venv/
__pycache__/
*.pyc
*.db
.env
```

Create empty `backend/app/__init__.py` and empty `backend/tests/__init__.py`.

- [ ] **Step 2: Create a venv and install dependencies**

Run:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 3: Write the failing test**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_check():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `backend/`, with `venv` active): `pytest tests/test_health.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 5: Write the minimal implementation**

`backend/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="Financial Control Web API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 7: Create the backend Dockerfile**

`backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 8: Commit**

```bash
cd /Users/douglas.queiroz/Developer/financecontrolweb
git add backend/requirements.txt backend/pyproject.toml backend/app/__init__.py backend/app/main.py backend/tests/__init__.py backend/tests/test_health.py backend/Dockerfile backend/.gitignore
git commit -m "Scaffold FastAPI backend with health check endpoint"
```

---

### Task 2: Database and settings configuration

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/.env.example`
- Test: `backend/tests/test_config.py`
- Create (via CLI): `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/`

**Interfaces:**
- Consumes: nothing new.
- Produces: `app.core.config.settings` (a `Settings` instance with `.database_url: str` and `.cors_origins: list[str]`); `app.core.database.Base` (SQLAlchemy declarative base), `app.core.database.get_db` (FastAPI dependency yielding a `Session`), `app.core.database.engine`, `app.core.database.SessionLocal`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_config.py`:
```python
from app.core.config import Settings


def test_default_database_url():
    settings = Settings(_env_file=None)
    assert settings.database_url == "sqlite:///./financecontrol.db"


def test_default_cors_origins():
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["http://localhost:5173"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.core'`

- [ ] **Step 3: Write the minimal implementation**

Create empty `backend/app/core/__init__.py`.

`backend/app/core/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./financecontrol.db"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
```

`backend/app/core/database.py`:
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`backend/.env.example`:
```
DATABASE_URL=sqlite:///./financecontrol.db
CORS_ORIGINS=["http://localhost:5173"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Initialize Alembic**

Run (from `backend/`, venv active): `alembic init alembic`

- [ ] **Step 6: Wire Alembic to the app's Base and settings**

Edit `backend/alembic/env.py`: near the top, after the existing imports, add:
```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.core.database import Base
from app.expenses import models  # noqa: F401  (registers Expense with Base.metadata)
```

Then replace the line `target_metadata = None` with:
```python
target_metadata = Base.metadata
```

And inside `run_migrations_offline()` and `run_migrations_online()`, replace
`config.get_main_option("sqlalchemy.url")` with `settings.database_url` (pass it directly as the `url`
argument to `context.configure(...)` in offline mode, and set
`configuration["sqlalchemy.url"] = settings.database_url` before
`engine_from_config(...)` in online mode).

Note: `app.expenses.models` doesn't exist yet — this import will start working once Task 3 creates it. Leave it in place now since Alembic isn't run again until Task 3.

- [ ] **Step 7: Commit**

```bash
git add backend/app/core backend/.env.example backend/tests/test_config.py backend/alembic.ini backend/alembic
git commit -m "Add settings, database session, and Alembic scaffolding"
```

---

### Task 3: Expense model, migration, and shared test fixture

**Files:**
- Create: `backend/app/expenses/__init__.py`
- Create: `backend/app/expenses/models.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_models.py`
- Create (via CLI): `backend/alembic/versions/<hash>_create_expenses_table.py`

**Interfaces:**
- Consumes: `app.core.database.Base` (Task 2).
- Produces: `app.expenses.models.Expense` — SQLAlchemy model with columns `id, description, amount, due_date, paid_at, created_at, updated_at, is_recurring, recurrence_frequency, recurrence_interval, recurrence_end_date` (see spec §4 for types). `db_session` pytest fixture (in-memory SQLite session) usable by all later backend tests.

- [ ] **Step 1: Write the failing test**

`backend/tests/conftest.py`:
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
```

`backend/tests/test_models.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.expenses'`

- [ ] **Step 3: Write the minimal implementation**

Create empty `backend/app/expenses/__init__.py`.

`backend/app/expenses/models.py`:
```python
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    description: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utcnow, onupdate=_utcnow
    )
    is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recurrence_frequency: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    recurrence_interval: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    recurrence_end_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Generate and apply the Alembic migration**

Run (from `backend/`, venv active):
```bash
alembic revision --autogenerate -m "create expenses table"
alembic upgrade head
```
Verify: a new file appears under `backend/alembic/versions/`, and `backend/financecontrol.db` is created with an `expenses` table (`sqlite3 financecontrol.db ".tables"` should list `expenses`). Delete `backend/financecontrol.db` afterward — it's a local artifact, not something to commit (already covered by `.gitignore`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/expenses/__init__.py backend/app/expenses/models.py backend/tests/conftest.py backend/tests/test_models.py backend/alembic/versions
git commit -m "Add Expense model and initial database migration"
```

---

### Task 4: Recurrence calculator

**Files:**
- Create: `backend/app/expenses/recurrence.py`
- Test: `backend/tests/test_recurrence.py`

**Interfaces:**
- Produces: `app.expenses.recurrence.RecurrenceFrequency` (str enum: `daily`, `weekly`, `monthly`, `yearly`); `app.expenses.recurrence.next_due_date(current_due_date: date, frequency: RecurrenceFrequency, interval: int, end_date: date | None) -> date | None`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_recurrence.py`:
```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_recurrence.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.expenses.recurrence'`

- [ ] **Step 3: Write the minimal implementation**

`backend/app/expenses/recurrence.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_recurrence.py -v`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/recurrence.py backend/tests/test_recurrence.py
git commit -m "Add recurrence calculator ported from iOS RecurrenceCalculator"
```

---

### Task 5: Pydantic schemas

**Files:**
- Create: `backend/app/expenses/schemas.py`
- Test: `backend/tests/test_schemas.py`

**Interfaces:**
- Consumes: `app.expenses.recurrence.RecurrenceFrequency` (Task 4).
- Produces: `app.expenses.schemas.ExpenseCreate`, `app.expenses.schemas.ExpenseUpdate` (both: `description: str, amount: Decimal, due_date: date, is_recurring: bool = False, recurrence_frequency: RecurrenceFrequency | None = None, recurrence_interval: int = 1, recurrence_end_date: date | None = None`); `app.expenses.schemas.ExpenseRead` (adds `id: UUID, paid_at: datetime | None, created_at: datetime, updated_at: datetime`, built with `from_attributes=True`, serializes `amount` as a string).

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_schemas.py`:
```python
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.expenses.recurrence import RecurrenceFrequency
from app.expenses.schemas import ExpenseCreate


def test_valid_expense_create():
    expense = ExpenseCreate(description="Rent", amount=Decimal("100.00"), due_date=date(2026, 1, 1))
    assert expense.description == "Rent"


def test_rejects_empty_description():
    with pytest.raises(ValidationError):
        ExpenseCreate(description="  ", amount=Decimal("10"), due_date=date(2026, 1, 1))


def test_rejects_non_positive_amount():
    with pytest.raises(ValidationError):
        ExpenseCreate(description="Rent", amount=Decimal("0"), due_date=date(2026, 1, 1))


def test_requires_frequency_when_recurring():
    with pytest.raises(ValidationError):
        ExpenseCreate(
            description="Rent",
            amount=Decimal("100"),
            due_date=date(2026, 1, 1),
            is_recurring=True,
        )


def test_allows_recurring_with_frequency():
    expense = ExpenseCreate(
        description="Rent",
        amount=Decimal("100"),
        due_date=date(2026, 1, 1),
        is_recurring=True,
        recurrence_frequency=RecurrenceFrequency.monthly,
    )
    assert expense.recurrence_frequency == RecurrenceFrequency.monthly
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.expenses.schemas'`

- [ ] **Step 3: Write the minimal implementation**

`backend/app/expenses/schemas.py`:
```python
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_serializer, field_validator, model_validator

from app.expenses.recurrence import RecurrenceFrequency


class ExpenseBase(BaseModel):
    description: str
    amount: Decimal
    due_date: date
    is_recurring: bool = False
    recurrence_frequency: RecurrenceFrequency | None = None
    recurrence_interval: int = 1
    recurrence_end_date: date | None = None

    @field_validator("description")
    @classmethod
    def description_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("description must not be empty")
        return value

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("amount must be greater than 0")
        return value

    @model_validator(mode="after")
    def frequency_required_if_recurring(self) -> "ExpenseBase":
        if self.is_recurring and self.recurrence_frequency is None:
            raise ValueError("recurrence_frequency is required when is_recurring is true")
        return self


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(ExpenseBase):
    pass


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    description: str
    amount: Decimal
    due_date: date
    paid_at: datetime | None
    created_at: datetime
    updated_at: datetime
    is_recurring: bool
    recurrence_frequency: RecurrenceFrequency | None
    recurrence_interval: int
    recurrence_end_date: date | None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_schemas.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/schemas.py backend/tests/test_schemas.py
git commit -m "Add Expense Pydantic schemas with validation"
```

---

### Task 6: Expense repository — CRUD and reads

**Files:**
- Create: `backend/app/expenses/repository.py`
- Test: `backend/tests/test_repository.py`

**Interfaces:**
- Consumes: `app.expenses.models.Expense` (Task 3), `app.expenses.schemas.ExpenseCreate`, `ExpenseUpdate` (Task 5).
- Produces: `app.expenses.repository.ExpenseNotFoundError(Exception)`; `app.expenses.repository.ExpenseRepository(db: Session)` with methods `fetch_unpaid(limit: int = 20) -> list[Expense]`, `fetch_paid(offset: int = 0, limit: int = 20) -> list[Expense]`, `create(data: ExpenseCreate) -> Expense`, `update(expense_id: UUID, data: ExpenseUpdate) -> Expense`, `delete(expense_id: UUID) -> None`. Task 7 adds `mark_as_paid` and `reverse_payment` to this same class.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_repository.py`:
```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_repository.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.expenses.repository'`

- [ ] **Step 3: Write the minimal implementation**

`backend/app/expenses/repository.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_repository.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/repository.py backend/tests/test_repository.py
git commit -m "Add ExpenseRepository CRUD and read methods"
```

---

### Task 7: Expense repository — mark-as-paid and reverse-payment

**Files:**
- Modify: `backend/app/expenses/repository.py`
- Modify: `backend/tests/test_repository.py`

**Interfaces:**
- Consumes: `app.expenses.recurrence.next_due_date`, `RecurrenceFrequency` (Task 4).
- Produces: adds `mark_as_paid(expense_id: UUID, paid_at: datetime) -> Expense` and `reverse_payment(expense_id: UUID) -> Expense` to `ExpenseRepository`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_repository.py`:
```python
from datetime import datetime, timezone

from app.expenses.recurrence import RecurrenceFrequency


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_repository.py -v`
Expected: FAIL with `AttributeError: 'ExpenseRepository' object has no attribute 'mark_as_paid'`

- [ ] **Step 3: Write the minimal implementation**

Add to the top of `backend/app/expenses/repository.py`, alongside the existing imports:
```python
from datetime import datetime

from app.expenses.recurrence import RecurrenceFrequency, next_due_date
```

Add these two methods to `ExpenseRepository`, after `delete`:
```python
    def mark_as_paid(self, expense_id: uuid.UUID, paid_at: datetime) -> Expense:
        expense = self._get(expense_id)
        expense.paid_at = paid_at
        self.db.commit()
        self.db.refresh(expense)

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_repository.py -v`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/repository.py backend/tests/test_repository.py
git commit -m "Add mark-as-paid recurring spawn and reverse-payment to ExpenseRepository"
```

---

### Task 8: API router and app wiring

**Files:**
- Create: `backend/app/expenses/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_router.py`

**Interfaces:**
- Consumes: `ExpenseRepository`, `ExpenseNotFoundError` (Task 6/7), `ExpenseCreate`, `ExpenseUpdate`, `ExpenseRead` (Task 5), `app.core.database.get_db` (Task 2), `app.core.config.settings` (Task 2).
- Produces: `app.expenses.router.router` (a `fastapi.APIRouter`, prefix `/api/expenses`), mounted on `app.main.app`. Endpoints: `GET /unpaid`, `GET /paid`, `POST ""`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/mark-paid`, `POST /{id}/reverse-payment`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_router.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    engine.dispose()


def test_create_expense(client):
    response = client.post(
        "/api/expenses",
        json={"description": "Rent", "amount": "1200.00", "due_date": "2026-01-01"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["description"] == "Rent"
    assert body["amount"] == "1200.00"
    assert body["paid_at"] is None


def test_create_expense_rejects_invalid_amount(client):
    response = client.post(
        "/api/expenses",
        json={"description": "Rent", "amount": "0", "due_date": "2026-01-01"},
    )
    assert response.status_code == 422


def test_list_unpaid_sorted_by_due_date(client):
    client.post("/api/expenses", json={"description": "B", "amount": "10", "due_date": "2026-02-01"})
    client.post("/api/expenses", json={"description": "A", "amount": "10", "due_date": "2026-01-01"})

    response = client.get("/api/expenses/unpaid")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["A", "B"]


def test_mark_as_paid_moves_expense_to_paid_list(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.post(f"/api/expenses/{created['id']}/mark-paid")
    assert response.status_code == 200
    assert response.json()["paid_at"] is not None

    unpaid = client.get("/api/expenses/unpaid").json()
    assert all(item["id"] != created["id"] for item in unpaid)

    paid = client.get("/api/expenses/paid").json()
    assert any(item["id"] == created["id"] for item in paid)


def test_mark_as_paid_recurring_spawns_next_occurrence(client):
    created = client.post(
        "/api/expenses",
        json={
            "description": "Subscription",
            "amount": "10",
            "due_date": "2026-01-01",
            "is_recurring": True,
            "recurrence_frequency": "monthly",
        },
    ).json()

    client.post(f"/api/expenses/{created['id']}/mark-paid")

    unpaid = client.get("/api/expenses/unpaid").json()
    assert any(item["due_date"] == "2026-02-01" for item in unpaid)


def test_reverse_payment_returns_expense_to_unpaid(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()
    client.post(f"/api/expenses/{created['id']}/mark-paid")

    response = client.post(f"/api/expenses/{created['id']}/reverse-payment")
    assert response.status_code == 200
    assert response.json()["paid_at"] is None


def test_delete_expense(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.delete(f"/api/expenses/{created['id']}")
    assert response.status_code == 204

    unpaid = client.get("/api/expenses/unpaid").json()
    assert all(item["id"] != created["id"] for item in unpaid)


def test_update_missing_expense_returns_404(client):
    response = client.put(
        "/api/expenses/00000000-0000-0000-0000-000000000000",
        json={"description": "X", "amount": "10", "due_date": "2026-01-01"},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_router.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.expenses.router'`

- [ ] **Step 3: Write the minimal implementation**

`backend/app/expenses/router.py`:
```python
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.expenses.repository import ExpenseNotFoundError, ExpenseRepository
from app.expenses.schemas import ExpenseCreate, ExpenseRead, ExpenseUpdate

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def get_repository(db: Session = Depends(get_db)) -> ExpenseRepository:
    return ExpenseRepository(db)


@router.get("/unpaid", response_model=list[ExpenseRead])
def list_unpaid(limit: int = Query(20, ge=1, le=100), repo: ExpenseRepository = Depends(get_repository)):
    return repo.fetch_unpaid(limit=limit)


@router.get("/paid", response_model=list[ExpenseRead])
def list_paid(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    repo: ExpenseRepository = Depends(get_repository),
):
    return repo.fetch_paid(offset=offset, limit=limit)


@router.post("", response_model=ExpenseRead, status_code=201)
def create_expense(data: ExpenseCreate, repo: ExpenseRepository = Depends(get_repository)):
    return repo.create(data)


@router.put("/{expense_id}", response_model=ExpenseRead)
def update_expense(expense_id: UUID, data: ExpenseUpdate, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.update(expense_id, data)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        repo.delete(expense_id)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{expense_id}/mark-paid", response_model=ExpenseRead)
def mark_as_paid(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.mark_as_paid(expense_id, datetime.now(timezone.utc))
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{expense_id}/reverse-payment", response_model=ExpenseRead)
def reverse_payment(expense_id: UUID, repo: ExpenseRepository = Depends(get_repository)):
    try:
        return repo.reverse_payment(expense_id)
    except ExpenseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
```

Replace `backend/app/main.py` with:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.expenses.router import router as expenses_router

app = FastAPI(title="Financial Control Web API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/ -v`
Expected: PASS (all backend tests, including Tasks 1-7's)

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/router.py backend/app/main.py backend/tests/test_router.py
git commit -m "Add Expenses REST API router and wire it into the FastAPI app"
```

---

### Task 9: Frontend scaffolding

**Files:**
- Create (via CLI): `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/index.css`
- Create: `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/setupTests.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: a runnable Vite React/TS app with Tailwind and Vitest configured; `App` component (default export from `frontend/src/App.tsx`) as the root later tasks build on.

- [ ] **Step 1: Scaffold the Vite project**

Run:
```bash
cd /Users/douglas.queiroz/Developer/financecontrolweb/frontend
npm create vite@latest . -- --template react-ts
```
(Accept any prompts with their defaults — the directory is already named `frontend` and is empty.)

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
npm install react-router-dom @tanstack/react-query
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Configure Tailwind**

Run: `npx tailwindcss init -p`

`frontend/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

At the top of `frontend/src/index.css`, add:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Configure Vitest and the dev proxy**

Replace `frontend/vite.config.ts` with:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

`frontend/src/setupTests.ts`:
```ts
import '@testing-library/jest-dom'
```

Add a `test` script to `frontend/package.json`'s `"scripts"` block: `"test": "vitest run"`.

- [ ] **Step 5: Write the failing test**

`frontend/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByText('Financial Control')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — the default Vite template's `App.tsx` doesn't render "Financial Control"

- [ ] **Step 7: Write the minimal implementation**

Replace `frontend/src/App.tsx` with:
```tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <h1 className="p-4 text-2xl font-bold">Financial Control</h1>
    </div>
  )
}

export default App
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/douglas.queiroz/Developer/financecontrolweb
git add frontend
git commit -m "Scaffold React/TypeScript frontend with Tailwind and Vitest"
```

---

### Task 10: API client, expense types, and TanStack Query provider

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/features/expenses/types.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `apiClient` object (`get`, `post`, `put`, `delete` methods, each `<T>(path: string, body?) => Promise<T>`) and `ApiError` class (`.status: number`) from `frontend/src/api/client.ts`; `Expense` and `ExpenseInput` types, `RecurrenceFrequency` type, from `frontend/src/features/expenses/types.ts`. `main.tsx` wraps `<App />` in `QueryClientProvider` and `BrowserRouter`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/api/client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiError } from './client'

describe('apiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: '1' }),
      }),
    )

    const result = await apiClient.get<{ id: string }>('/expenses/unpaid')
    expect(result).toEqual({ id: '1' })
  })

  it('throws ApiError with the server detail message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Expense not found' }),
      }),
    )

    await expect(apiClient.get('/expenses/missing')).rejects.toThrow(ApiError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `frontend/src/api/client.ts` doesn't exist yet

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/api/client.ts`:
```ts
const BASE_URL = '/api'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new ApiError(response.status, body.detail ?? 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
```

`frontend/src/features/expenses/types.ts`:
```ts
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Expense {
  id: string
  description: string
  amount: string
  due_date: string
  paid_at: string | null
  created_at: string
  updated_at: string
  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_interval: number
  recurrence_end_date: string | null
}

export interface ExpenseInput {
  description: string
  amount: string
  due_date: string
  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_interval: number
  recurrence_end_date: string | null
}
```

Replace `frontend/src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/features/expenses/types.ts frontend/src/main.tsx
git commit -m "Add typed API client, expense types, and TanStack Query provider"
```

---

### Task 11: Expense query and mutation hooks

**Files:**
- Create: `frontend/src/api/expenses.ts`
- Test: `frontend/src/api/expenses.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Task 10), `Expense`, `ExpenseInput` (Task 10).
- Produces: `useUnpaidExpenses()`, `usePaidExpenses()` (TanStack `useInfiniteQuery`, pages of `Expense[]`), `useCreateExpense()`, `useUpdateExpense()` (mutate with `{ id, input }`), `useDeleteExpense()`, `useMarkAsPaid()`, `useReversePayment()` (each mutate with an expense `id: string`) — all from `frontend/src/api/expenses.ts`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/api/expenses.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { useCreateExpense, useUnpaidExpenses } from './expenses'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useUnpaidExpenses', () => {
  it('fetches the unpaid list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: '1', description: 'Rent' }])

    const { result } = renderHook(() => useUnpaidExpenses(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.get).toHaveBeenCalledWith('/expenses/unpaid?limit=20')
    expect(result.current.data).toEqual([{ id: '1', description: 'Rent' }])
  })
})

describe('useCreateExpense', () => {
  it('posts the new expense', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: '1' })

    const { result } = renderHook(() => useCreateExpense(), { wrapper: createWrapper() })

    result.current.mutate({
      description: 'Rent',
      amount: '10',
      due_date: '2026-01-01',
      is_recurring: false,
      recurrence_frequency: null,
      recurrence_interval: 1,
      recurrence_end_date: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/expenses', expect.objectContaining({ description: 'Rent' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `frontend/src/api/expenses.ts` doesn't exist yet

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/api/expenses.ts`:
```ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Expense, ExpenseInput } from '../features/expenses/types'

const PAGE_SIZE = 20

export function useUnpaidExpenses() {
  return useQuery({
    queryKey: ['expenses', 'unpaid'],
    queryFn: () => apiClient.get<Expense[]>('/expenses/unpaid?limit=20'),
  })
}

export function usePaidExpenses() {
  return useInfiniteQuery({
    queryKey: ['expenses', 'paid'],
    queryFn: ({ pageParam }) =>
      apiClient.get<Expense[]>(`/expenses/paid?offset=${pageParam}&limit=${PAGE_SIZE}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  })
}

function useInvalidateExpenses() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['expenses'] })
}

export function useCreateExpense() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (input: ExpenseInput) => apiClient.post<Expense>('/expenses', input),
    onSuccess: invalidate,
  })
}

export function useUpdateExpense() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExpenseInput }) =>
      apiClient.put<Expense>(`/expenses/${id}`, input),
    onSuccess: invalidate,
  })
}

export function useDeleteExpense() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/expenses/${id}`),
    onSuccess: invalidate,
  })
}

export function useMarkAsPaid() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Expense>(`/expenses/${id}/mark-paid`),
    onSuccess: invalidate,
  })
}

export function useReversePayment() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Expense>(`/expenses/${id}/reverse-payment`),
    onSuccess: invalidate,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/expenses.ts frontend/src/api/expenses.test.tsx
git commit -m "Add TanStack Query hooks for expenses"
```

---

### Task 12: ExpenseRow and UnpaidExpensesList

**Files:**
- Create: `frontend/src/features/expenses/shared/ExpenseRow.tsx`
- Create: `frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.tsx`
- Test: `frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.test.tsx`

**Interfaces:**
- Consumes: `useUnpaidExpenses`, `useMarkAsPaid`, `useDeleteExpense` (Task 11); `Expense` (Task 10).
- Produces: `ExpenseRow` component (props: `expense: Expense, highlighted?: boolean, primaryActionLabel: string, onPrimaryAction: () => void, onEdit: () => void, onDelete: () => void`; renders a root element with `data-testid={"expense-row-" + expense.id}`); `UnpaidExpensesList` component (no props, must be rendered inside a Router context).

- [ ] **Step 1: Write the failing test**

`frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { UnpaidExpensesList } from './UnpaidExpensesList'

vi.mock('../../../api/expenses')

describe('UnpaidExpensesList', () => {
  it('highlights expenses that are due today or overdue', () => {
    vi.mocked(expensesApi.useUnpaidExpenses).mockReturnValue({
      data: [
        { id: '1', description: 'Overdue rent', amount: '10', due_date: '2020-01-01' },
        { id: '2', description: 'Future bill', amount: '20', due_date: '2999-01-01' },
      ],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <UnpaidExpensesList />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('expense-row-1')).toHaveClass('bg-amber-50')
    expect(screen.getByTestId('expense-row-2')).not.toHaveClass('bg-amber-50')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.tsx` doesn't exist yet

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/features/expenses/shared/ExpenseRow.tsx`:
```tsx
import type { Expense } from '../types'

interface ExpenseRowProps {
  expense: Expense
  highlighted?: boolean
  primaryActionLabel: string
  onPrimaryAction: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ExpenseRow({
  expense,
  highlighted = false,
  primaryActionLabel,
  onPrimaryAction,
  onEdit,
  onDelete,
}: ExpenseRowProps) {
  return (
    <div
      data-testid={`expense-row-${expense.id}`}
      className={`flex items-center justify-between border-b p-3 ${
        highlighted ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
      }`}
    >
      <div>
        <p className="font-medium">{expense.description}</p>
        <p className="text-sm text-gray-500">
          {expense.amount} · due {expense.due_date}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onPrimaryAction} className="text-blue-600">
          {primaryActionLabel}
        </button>
        <button onClick={onEdit} className="text-gray-600">
          Edit
        </button>
        <button onClick={onDelete} className="text-red-600">
          Delete
        </button>
      </div>
    </div>
  )
}
```

`frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.tsx`:
```tsx
import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, useMarkAsPaid, useUnpaidExpenses } from '../../../api/expenses'
import { ExpenseRow } from '../shared/ExpenseRow'

function isDue(dueDate: string, today: Date): boolean {
  return new Date(dueDate) <= today
}

export function UnpaidExpensesList() {
  const { data, isLoading, error } = useUnpaidExpenses()
  const markAsPaid = useMarkAsPaid()
  const deleteExpense = useDeleteExpense()
  const navigate = useNavigate()
  const today = new Date()

  if (isLoading) return <p className="p-4">Loading…</p>
  if (error) return <p className="p-4 text-red-600">Failed to load expenses.</p>

  return (
    <div>
      {data?.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          highlighted={isDue(expense.due_date, today)}
          primaryActionLabel="Mark as Paid"
          onPrimaryAction={() => markAsPaid.mutate(expense.id)}
          onEdit={() => navigate(`/expenses/${expense.id}/edit`)}
          onDelete={() => {
            if (window.confirm('Delete this expense?')) {
              deleteExpense.mutate(expense.id)
            }
          }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/expenses/shared/ExpenseRow.tsx frontend/src/features/expenses/UnpaidList
git commit -m "Add ExpenseRow and UnpaidExpensesList with due-date highlighting"
```

---

### Task 13: PaidExpensesList with infinite scroll

**Files:**
- Create: `frontend/src/features/expenses/PaidList/PaidExpensesList.tsx`
- Test: `frontend/src/features/expenses/PaidList/PaidExpensesList.test.tsx`

**Interfaces:**
- Consumes: `usePaidExpenses`, `useReversePayment`, `useDeleteExpense` (Task 11); `ExpenseRow` (Task 12).
- Produces: `PaidExpensesList` component (no props, must be rendered inside a Router context).

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/expenses/PaidList/PaidExpensesList.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { PaidExpensesList } from './PaidExpensesList'

vi.mock('../../../api/expenses')

class MockIntersectionObserver {
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe() {}
  disconnect() {}
}

describe('PaidExpensesList', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  it('renders paid expenses from all loaded pages', () => {
    vi.mocked(expensesApi.usePaidExpenses).mockReturnValue({
      data: { pages: [[{ id: '1', description: 'Rent', amount: '10', due_date: '2026-01-01' }]] },
      isLoading: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never)
    vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <PaidExpensesList />
      </MemoryRouter>,
    )

    expect(screen.getByText('Rent')).toBeInTheDocument()
  })

  it('fetches the next page when the sentinel intersects', () => {
    const fetchNextPage = vi.fn()
    let capturedCallback: IntersectionObserverCallback | undefined

    class CapturingObserver extends MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        super(callback)
        capturedCallback = callback
      }
    }
    vi.stubGlobal('IntersectionObserver', CapturingObserver)

    vi.mocked(expensesApi.usePaidExpenses).mockReturnValue({
      data: { pages: [[]] },
      isLoading: false,
      error: null,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    } as never)
    vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <PaidExpensesList />
      </MemoryRouter>,
    )

    capturedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(fetchNextPage).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `frontend/src/features/expenses/PaidList/PaidExpensesList.tsx` doesn't exist yet

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/features/expenses/PaidList/PaidExpensesList.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, usePaidExpenses, useReversePayment } from '../../../api/expenses'
import { ExpenseRow } from '../shared/ExpenseRow'

export function PaidExpensesList() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePaidExpenses()
  const reversePayment = useReversePayment()
  const deleteExpense = useDeleteExpense()
  const navigate = useNavigate()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        fetchNextPage()
      }
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  if (isLoading) return <p className="p-4">Loading…</p>
  if (error) return <p className="p-4 text-red-600">Failed to load expenses.</p>

  const expenses = data?.pages.flat() ?? []

  return (
    <div>
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          primaryActionLabel="Reverse Payment"
          onPrimaryAction={() => reversePayment.mutate(expense.id)}
          onEdit={() => navigate(`/expenses/${expense.id}/edit`)}
          onDelete={() => {
            if (window.confirm('Delete this expense?')) {
              deleteExpense.mutate(expense.id)
            }
          }}
        />
      ))}
      <div ref={sentinelRef} />
      {isFetchingNextPage && <p className="p-3 text-gray-500">Loading more…</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/expenses/PaidList
git commit -m "Add PaidExpensesList with intersection-observer infinite scroll"
```

---

### Task 14: ExpenseForm (create + edit)

**Files:**
- Create: `frontend/src/features/expenses/ExpenseForm/ExpenseForm.tsx`
- Test: `frontend/src/features/expenses/ExpenseForm/ExpenseForm.test.tsx`

**Interfaces:**
- Consumes: `useCreateExpense`, `useUpdateExpense` (Task 11); `Expense`, `ExpenseInput`, `RecurrenceFrequency` (Task 10).
- Produces: `ExpenseForm` component (props: `mode: 'create' | 'edit', initialExpense?: Expense`; must be rendered inside a Router context, and inside a route with an `:id` param when `mode === 'edit'`).

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/expenses/ExpenseForm/ExpenseForm.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { ExpenseForm } from './ExpenseForm'

vi.mock('../../../api/expenses')

describe('ExpenseForm', () => {
  it('disables save until description, amount, and due date are filled', async () => {
    vi.mocked(expensesApi.useCreateExpense).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useUpdateExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <ExpenseForm mode="create" />
      </MemoryRouter>,
    )

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Description'), 'Rent')
    await userEvent.type(screen.getByLabelText('Amount'), '100')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-01-01' } })

    expect(saveButton).toBeEnabled()
  })

  it('requires a frequency once recurring is toggled on', async () => {
    vi.mocked(expensesApi.useCreateExpense).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useUpdateExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <ExpenseForm mode="create" />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText('Description'), 'Subscription')
    await userEvent.type(screen.getByLabelText('Amount'), '10')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByLabelText('Recurring'))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Frequency'), 'monthly')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('calls createExpense.mutate with the entered values on submit', async () => {
    const mutate = vi.fn()
    vi.mocked(expensesApi.useCreateExpense).mockReturnValue({ mutate } as never)
    vi.mocked(expensesApi.useUpdateExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <ExpenseForm mode="create" />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText('Description'), 'Rent')
    await userEvent.type(screen.getByLabelText('Amount'), '100')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Rent', amount: '100', due_date: '2026-01-01' }),
      expect.anything(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `frontend/src/features/expenses/ExpenseForm/ExpenseForm.tsx` doesn't exist yet

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/features/expenses/ExpenseForm/ExpenseForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCreateExpense, useUpdateExpense } from '../../../api/expenses'
import type { Expense, ExpenseInput, RecurrenceFrequency } from '../types'

interface ExpenseFormProps {
  mode: 'create' | 'edit'
  initialExpense?: Expense
}

const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

export function ExpenseForm({ mode, initialExpense }: ExpenseFormProps) {
  const [description, setDescription] = useState(initialExpense?.description ?? '')
  const [amount, setAmount] = useState(initialExpense?.amount ?? '')
  const [dueDate, setDueDate] = useState(initialExpense?.due_date ?? '')
  const [isRecurring, setIsRecurring] = useState(initialExpense?.is_recurring ?? false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(
    initialExpense?.recurrence_frequency ?? null,
  )
  const [interval, setInterval] = useState(initialExpense?.recurrence_interval ?? 1)
  const [endDate, setEndDate] = useState(initialExpense?.recurrence_end_date ?? '')

  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const navigate = useNavigate()
  const { id } = useParams()

  const isValid =
    description.trim().length > 0 &&
    Number(amount) > 0 &&
    dueDate.length > 0 &&
    (!isRecurring || frequency !== null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    const input: ExpenseInput = {
      description,
      amount,
      due_date: dueDate,
      is_recurring: isRecurring,
      recurrence_frequency: isRecurring ? frequency : null,
      recurrence_interval: interval,
      recurrence_end_date: isRecurring && endDate ? endDate : null,
    }

    const onSuccess = () => navigate('/')

    if (mode === 'create') {
      createExpense.mutate(input, { onSuccess })
    } else if (id) {
      updateExpense.mutate({ id, input }, { onSuccess })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <label>
        Description
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="block border p-1"
        />
      </label>
      <label>
        Amount
        <input value={amount} onChange={(e) => setAmount(e.target.value)} className="block border p-1" />
      </label>
      <label>
        Due date
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="block border p-1"
        />
      </label>
      <label>
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
        Recurring
      </label>
      {isRecurring && (
        <>
          <label>
            Frequency
            <select
              value={frequency ?? ''}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              className="block border p-1"
            >
              <option value="">Select…</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            Every
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="block border p-1"
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block border p-1"
            />
          </label>
        </>
      )}
      <button type="submit" disabled={!isValid} className="mt-2 bg-blue-600 text-white p-2 disabled:opacity-50">
        Save
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/expenses/ExpenseForm
git commit -m "Add ExpenseForm for create and edit with validation"
```

---

### Task 15: ExpensesPage and routing

**Files:**
- Create: `frontend/src/features/expenses/ExpensesPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `UnpaidExpensesList` (Task 12), `PaidExpensesList` (Task 13), `ExpenseForm` (Task 14), `useUnpaidExpenses`, `usePaidExpenses` (Task 11).
- Produces: `ExpensesPage` component; final `App` component wiring routes `/`, `/expenses/new`, `/expenses/:id/edit`.

- [ ] **Step 1: Write the failing test**

Replace `frontend/src/App.test.tsx` with:
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from './api/expenses'
import App from './App'

vi.mock('./api/expenses')

describe('App', () => {
  it('renders the expenses page at the root route', () => {
    vi.mocked(expensesApi.useUnpaidExpenses).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(expensesApi.usePaidExpenses).mockReturnValue({
      data: { pages: [[]] },
      isLoading: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never)
    vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Financial Control')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — current `App.tsx` (Task 9's placeholder) doesn't use the mocked hooks, and `ExpensesPage` doesn't exist yet, so imports fail

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/features/expenses/ExpensesPage.tsx`:
```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PaidExpensesList } from './PaidList/PaidExpensesList'
import { UnpaidExpensesList } from './UnpaidList/UnpaidExpensesList'

type Tab = 'unpaid' | 'paid'

export function ExpensesPage() {
  const [tab, setTab] = useState<Tab>('unpaid')

  return (
    <div>
      <header className="flex items-center justify-between p-4">
        <h1 className="text-2xl font-bold">Financial Control</h1>
        <Link to="/expenses/new" className="bg-blue-600 text-white px-3 py-1 rounded">
          + New
        </Link>
      </header>
      <div className="flex gap-2 px-4">
        <button
          onClick={() => setTab('unpaid')}
          className={tab === 'unpaid' ? 'font-bold underline' : ''}
        >
          Unpaid
        </button>
        <button onClick={() => setTab('paid')} className={tab === 'paid' ? 'font-bold underline' : ''}>
          Paid
        </button>
      </div>
      {tab === 'unpaid' ? <UnpaidExpensesList /> : <PaidExpensesList />}
    </div>
  )
}
```

Replace `frontend/src/App.tsx` with:
```tsx
import { Route, Routes, useParams } from 'react-router-dom'
import { usePaidExpenses, useUnpaidExpenses } from './api/expenses'
import { ExpenseForm } from './features/expenses/ExpenseForm/ExpenseForm'
import { ExpensesPage } from './features/expenses/ExpensesPage'

function EditExpenseRoute() {
  const { id } = useParams()
  const unpaid = useUnpaidExpenses()
  const paid = usePaidExpenses()

  const expense =
    unpaid.data?.find((e) => e.id === id) ?? paid.data?.pages.flat().find((e) => e.id === id)

  if (!expense) return <p className="p-4">Loading…</p>

  return <ExpenseForm mode="edit" initialExpense={expense} />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<ExpensesPage />} />
      <Route path="/expenses/new" element={<ExpenseForm mode="create" />} />
      <Route path="/expenses/:id/edit" element={<EditExpenseRoute />} />
    </Routes>
  )
}

export default App
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all frontend tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/expenses/ExpensesPage.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Wire ExpensesPage, tabs, and routing into App"
```

---

### Task 16: Docker Compose and local run docs

**Files:**
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `backend/Dockerfile` (Task 1), `app.core.config.Settings` env vars `DATABASE_URL`/`CORS_ORIGINS` (Task 2).
- Produces: `docker-compose up` runs both services locally.

- [ ] **Step 1: Create the frontend Dockerfile**

`frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

- [ ] **Step 2: Create docker-compose.yml**

`docker-compose.yml`:
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - backend-db:/app/data
    environment:
      DATABASE_URL: sqlite:////app/data/financecontrol.db
      CORS_ORIGINS: '["http://localhost:5173"]'

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend

volumes:
  backend-db:
```

- [ ] **Step 3: Create the README**

`README.md`:
```markdown
# Financial Control Web

Web port of the "Financial Control" iOS app's Expenses feature: track
expenses with due dates, mark them paid/unpaid, and manage recurring
expenses.

## Local development

```bash
docker-compose up
```

- Backend: http://localhost:8000 (interactive API docs at `/docs`)
- Frontend: http://localhost:5173

## Running tests

Backend:
```bash
cd backend
source venv/bin/activate
pytest
```

Frontend:
```bash
cd frontend
npm test
```

## Migrating data from the iOS app

See `scripts/migrate_from_ios.py --help`.
```

- [ ] **Step 4: Verify the full stack runs**

Run:
```bash
docker-compose up --build -d
curl http://localhost:8000/health
curl -I http://localhost:5173
docker-compose down
```
Expected: the health check returns `{"status":"ok"}` and the frontend responds `200 OK`.

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile docker-compose.yml README.md
git commit -m "Add Docker Compose setup and local dev README"
```

---

### Task 17: iOS Core Data migration script

**Files:**
- Create: `scripts/migrate_from_ios.py`
- Create: `scripts/tests/__init__.py`
- Test: `scripts/tests/test_migrate_from_ios.py`

**Interfaces:**
- Consumes: `app.core.database.SessionLocal`, `app.core.database.Base` (Task 2), `app.expenses.models.Expense` (Task 3).
- Produces: `migrate_from_ios.core_data_timestamp_to_datetime(value: float | None) -> datetime | None`, `migrate_from_ios.find_expense_table(conn: sqlite3.Connection) -> str`, `migrate_from_ios.describe_mapping(conn, table: str) -> None`, `migrate_from_ios.import_rows(conn, table: str) -> int`. CLI entry point: `python scripts/migrate_from_ios.py <path> [--confirm]`.

- [ ] **Step 1: Write the failing tests**

`scripts/tests/test_migrate_from_ios.py`:
```python
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
```

Create empty `scripts/tests/__init__.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run (from repo root, with the backend venv active): `pytest scripts/tests/test_migrate_from_ios.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'migrate_from_ios'`

- [ ] **Step 3: Write the minimal implementation**

`scripts/migrate_from_ios.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest scripts/tests/test_migrate_from_ios.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate_from_ios.py scripts/tests
git commit -m "Add one-off Core Data migration script"
```
