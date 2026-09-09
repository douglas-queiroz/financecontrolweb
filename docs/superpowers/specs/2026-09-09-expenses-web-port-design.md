# Financial Control Web — Expenses Port Design Spec

Date: 2026-09-09
Status: Approved for implementation planning

## 1. Purpose

Build a web version of the "Financial Control" iOS app's Expenses feature:
track expenses with due dates, mark them paid/unpaid, support recurring
expenses, and manage them through a two-tab list plus a create/edit form —
served by a Python (FastAPI) backend and a React (TypeScript) frontend.

## 2. Scope

In scope (matches the iOS app 1:1 — see the iOS design spec at
`Financial Control/docs/superpowers/specs/2026-08-14-expenses-feature-design.md`):

- Expense CRUD (create, edit, delete) with confirmation on delete.
- Two-tab UI: unpaid (next 20, due-highlighted, mark-as-paid) and paid
  (offset-paginated via infinite scroll, reverse-payment).
- Recurring expenses: marking a recurring expense paid auto-generates the
  next occurrence as a new, independent expense.
- One-off migration of existing data from the iOS app's Core Data store.
- No authentication — single-user, local-only deployment for now.

Out of scope (same exclusions as iOS, plus web-specific deferrals):
- Multi-currency support, budgets, categories, tags, reporting/analytics.
- Linking an auto-generated occurrence back to the expense that spawned it.
- Multi-user accounts, login/auth, or any access control.
- Cloud/production deployment (Railway/Render/VPS) — local Docker Compose
  only; deployment target can be revisited later without changing the
  application architecture.

## 3. Repository

New repo: `financecontrolweb`, local path
`/Users/douglas.queiroz/Developer/financecontrolweb`, remote
`git@github.com:douglas-queiroz/financecontrolweb.git`.

```
financecontrolweb/
  backend/                 FastAPI app
  frontend/                React app
  scripts/
    migrate_from_ios.py    one-off Core Data -> new DB importer
  docker-compose.yml        backend + frontend for local dev
  docs/superpowers/specs/   design docs
  docs/superpowers/plans/   implementation plans
  README.md
```

Monorepo, not a workspace/package-manager monorepo tool (no Nx/Turborepo) —
just two independently-runnable projects sharing a Compose file. YAGNI: no
shared package needed since backend (Python) and frontend (TS) don't share
code.

## 4. Data model

New table `expenses`, SQLAlchemy model, mirroring the iOS `Expense` Core
Data entity field-for-field:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | primary key |
| `description` | String | required |
| `amount` | Numeric | monetary value |
| `due_date` | Date | required |
| `paid_at` | DateTime, nullable | null = unpaid |
| `created_at` | DateTime | set once, at creation |
| `updated_at` | DateTime | set on every save |
| `is_recurring` | Boolean | default false |
| `recurrence_frequency` | String, nullable | `daily`/`weekly`/`monthly`/`yearly`; nil when not recurring |
| `recurrence_interval` | Integer | every N units of frequency; default 1 |
| `recurrence_end_date` | Date, nullable | recurrence stops generating occurrences after this date |

No relationship between an expense and the occurrence it spawns — same
"independent row" design as iOS, for the same reason: reversing a payment
only unmarks that expense.

Managed via Alembic migrations from the start (`alembic init`, one initial
migration creating this table).

## 5. Backend (`backend/app/`)

Framework: FastAPI + SQLAlchemy (sync engine, SQLite for local dev) +
Pydantic v2 for request/response schemas + Alembic for migrations.

```
backend/
  app/
    main.py            FastAPI app instance, CORS, router mounting
    core/
      config.py         settings (DB URL, CORS origins) via pydantic-settings
      database.py        SQLAlchemy engine/session, get_db dependency
    expenses/
      models.py          SQLAlchemy ORM model
      schemas.py          Pydantic schemas: ExpenseCreate, ExpenseUpdate, ExpenseRead
      recurrence.py        RecurrenceCalculator — ported from iOS RecurrenceCalculator
      repository.py         ExpenseRepository — port of iOS ExpenseRepositoryProtocol
      router.py           APIRouter with the endpoints below
  tests/
    test_recurrence.py
    test_repository.py
    test_router.py
  alembic/
  pyproject.toml
  Dockerfile
```

### 5.1 Domain layer

- **`recurrence.py`** — pure function
  `next_due_date(current_due_date: date, frequency: RecurrenceFrequency, interval: int, calendar_rules) -> date | None`,
  ported logic-for-logic from the iOS `RecurrenceCalculator`, including
  leap-year/month-end edge case handling. Returns `None` once the computed
  next date would fall after `recurrence_end_date`.
- **`repository.py`** — `ExpenseRepository`, method-for-method port of the
  iOS `ExpenseRepositoryProtocol`:
  - `fetch_unpaid(limit: int) -> list[Expense]` — sorted by `due_date` ascending.
  - `fetch_paid(offset: int, limit: int) -> list[Expense]` — sorted by `paid_at` descending.
  - `create(input: ExpenseCreate) -> Expense`
  - `update(id: UUID, input: ExpenseUpdate) -> Expense`
  - `delete(id: UUID) -> None`
  - `mark_as_paid(id: UUID, paid_at: datetime) -> Expense` — sets `paid_at`;
    if recurring, also creates the next occurrence via `recurrence.py`.
  - `reverse_payment(id: UUID) -> Expense` — clears `paid_at` back to null.

### 5.2 API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/expenses/unpaid?limit=20` | unpaid list |
| GET | `/api/expenses/paid?offset=0&limit=20` | paid list, paginated |
| POST | `/api/expenses` | create |
| PUT | `/api/expenses/{id}` | update |
| DELETE | `/api/expenses/{id}` | delete |
| POST | `/api/expenses/{id}/mark-paid` | mark paid (+ spawn next occurrence if recurring) |
| POST | `/api/expenses/{id}/reverse-payment` | clear paid_at |

Validation (via Pydantic): description non-empty, amount > 0, due date
required, recurrence frequency required when `is_recurring` is true — same
rules as the iOS form validation.

## 6. Frontend (`frontend/src/`)

Stack: React + TypeScript + Vite, TanStack Query for server state, React
Router for navigation, Tailwind for styling.

```
frontend/
  src/
    api/
      client.ts            fetch wrapper (base URL, JSON, error normalization)
      expenses.ts            TanStack Query hooks (useUnpaidExpenses, usePaidExpenses,
                             useCreateExpense, useUpdateExpense, useDeleteExpense,
                             useMarkAsPaid, useReversePayment)
    features/expenses/
      ExpensesPage.tsx        tab container (Unpaid / Paid), same shape as iOS ExpensesScreen
      UnpaidList/
        UnpaidExpensesList.tsx   due-date highlighting, mark-paid/edit/delete actions
      PaidList/
        PaidExpensesList.tsx     infinite-scroll pagination, reverse-payment/edit/delete
      ExpenseForm/
        ExpenseForm.tsx          shared create/edit form, mode from route
      shared/
        ExpenseRow.tsx
      types.ts
    App.tsx                  routes: / -> ExpensesPage, /expenses/new, /expenses/:id/edit
    main.tsx
  tests/                     Vitest + React Testing Library
```

Delete uses a confirmation dialog (browser-native `confirm()` or a small
modal component) before calling the delete mutation — same UX intent as
the iOS confirmation dialog.

## 7. Migration from iOS (`scripts/migrate_from_ios.py`)

One-off Python script, run manually once after the backend is set up:

1. Takes a path to the Core Data `.sqlite` file (pulled from a real device
   via Xcode's Devices window or a local backup) as a CLI argument.
2. Opens it read-only with `sqlite3`, inspects the schema to find the
   expense table (Core Data auto-generates names like `ZEXPENSE` with
   columns like `ZEXPENSEDESCRIPTION`, `ZAMOUNT`, `ZDUEDATE`, `ZPAIDAT`,
   `ZCREATEDAT`, `ZUPDATEDAT`, `ZISRECURRING`, `ZRECURRENCEFREQUENCY`,
   `ZRECURRENCEINTERVAL`, `ZRECURRENCEENDDATE` — exact names confirmed
   against the real file since Core Data's naming can shift based on the
   compiled model version).
3. Prints the proposed table/column mapping and row count, and requires an
   explicit `--confirm` flag to proceed with the import (no accidental
   double-imports).
4. Converts Core Data's reference-date-based timestamps (seconds since
   2001-01-01) to standard `datetime`/`date` values.
5. Inserts rows into the new backend's database via the same
   `ExpenseRepository.create` path used by the API (guarantees identical
   validation/defaults), skipping repository-level `created_at`/`updated_at`
   overwrite so original timestamps are preserved.
6. Idempotency: not required for v1 — this is a single manual one-time run
   against a fresh database.

## 8. Testing strategy

- **Backend**: pytest.
  - `test_recurrence.py` — next-date math per frequency at interval 1 and
    >1, returns `None` past `recurrence_end_date`, leap-year/month-end edge
    cases — same cases as the iOS `RecurrenceCalculatorTests`.
  - `test_repository.py` — against an in-memory SQLite DB: create/update/
    delete round-trip, `fetch_unpaid` sorting+limit, `fetch_paid` sorting+
    pagination, `mark_as_paid` on a recurring expense creates exactly one
    new unpaid occurrence with the correct advanced due date, `mark_as_paid`
    on non-recurring creates nothing extra, `reverse_payment` clears
    `paid_at` and leaves any spawned occurrence untouched.
  - `test_router.py` — FastAPI `TestClient` against the same in-memory DB,
    covering each endpoint's happy path and validation errors (422).
- **Frontend**: Vitest + React Testing Library.
  - Component tests for `UnpaidExpensesList`, `PaidExpensesList`,
    `ExpenseForm` (validation rejects empty description, non-positive
    amount, missing frequency when recurring is on).
  - Query hook tests mocking the API client.
- **Migration script**: a small pytest covering the Core Data timestamp
  conversion and the dry-run/confirm gating logic, run against a tiny
  fixture SQLite file shaped like a Core Data store.

## 9. Error handling

- Backend: FastAPI exception handlers return a consistent
  `{"detail": string}` JSON body — 404 for not-found, 422 for validation
  (automatic via Pydantic), 500 falls back to a generic message (no stack
  traces leaked).
- Frontend: TanStack Query mutation/query errors surfaced via an inline
  alert banner per screen — same intent as the iOS `errorMessage` `.alert`
  pattern. No retry/offline-queue logic — out of scope.

## 10. Local development

`docker-compose.yml` at the repo root runs:
- `backend` — FastAPI via `uvicorn`, port `8000`, SQLite file mounted as a
  volume so data persists across container restarts.
- `frontend` — Vite dev server, port `5173`, proxying `/api` to `backend`.

`docker-compose up` is the only command needed to run the full app locally.
