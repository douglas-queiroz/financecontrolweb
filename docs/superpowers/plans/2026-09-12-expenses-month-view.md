# Expenses Month View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Expenses page's separate "Unpaid"/"Paid" tabs with a single per-month list (unpaid expenses first, paid expenses sunk to the bottom) and add previous/next month navigation.

**Architecture:** The backend gains one repository method (`fetch_by_month`) and one endpoint (`GET /api/expenses?year=&month=`) that returns all expenses due in a given month, unpaid ones first then paid ones, both groups ordered by `due_date` ascending — replacing `fetch_unpaid`/`fetch_paid` and their `/unpaid`/`/paid` endpoints entirely (no pagination, since a month's expenses are a small, bounded set). The frontend replaces the two list components and the tab switch with one `ExpensesList` (fed by a new `useExpensesByMonth` hook) and a new `MonthNavigator` component that holds `{year, month}` state in `ExpensesPage`.

**Tech Stack:** Backend: FastAPI + SQLAlchemy 2.0 + SQLite, pytest. Frontend: React 19 + TypeScript + TanStack Query + Vitest + Testing Library.

**Spec:** No separate spec document — this plan implements the design agreed in chat during brainstorming (bounded-scope change to the existing `backend/app/expenses/` and `frontend/src/features/expenses/` modules). Key decisions from that discussion:
- An expense belongs to the month of its `due_date` only (not `paid_at`) — a paid expense stays in the month it was originally due.
- Overdue unpaid expenses do NOT carry forward into later months — they only ever appear in their original due month.
- Within the paid group, ordering is by `due_date` ascending (same as the unpaid group above it), not by paid date.
- The Unpaid/Paid tabs are removed in favor of one unified list per month.

## Global Constraints

- No pagination on the new month-list endpoint or hook — a month's expense count is small enough to fetch in one request.
- `fetch_unpaid`, `fetch_paid`, the `/unpaid` and `/paid` endpoints, `useUnpaidExpenses`, `usePaidExpenses`, `UnpaidExpensesList`, `PaidExpensesList`, and `Tabs` are all removed as part of this change (not deprecated in place) — nothing else in the codebase references them (confirmed by search).
- `paid_at` (not a separate boolean) remains the sole paid/unpaid signal, per the existing `Expense` model — no schema/migration changes are needed for this feature.

---

## Task 1: Backend — `fetch_by_month` repository method

**Files:**
- Modify: `backend/app/expenses/repository.py:23-40` (replace `fetch_unpaid`/`fetch_paid` with `fetch_by_month`)
- Modify: `backend/tests/test_repository.py` (replace/add tests below)

**Interfaces:**
- Produces: `ExpenseRepository.fetch_by_month(self, year: int, month: int) -> list[Expense]` — expenses whose `due_date` falls within `[year-month-01, next-month-01)`, ordered unpaid-first then `due_date` ascending within each group.
- Consumes: existing `Expense` model (`backend/app/expenses/models.py`), existing `ExpenseRepository.create`/`mark_as_paid` (unchanged, used by tests).

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/test_repository.py`. Delete `test_fetch_unpaid_sorted_by_due_date` and `test_fetch_unpaid_respects_limit` (lines 22-37), replacing them with:

```python
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
```

Now update the tests further down that used `fetch_unpaid`/`fetch_paid` as verification helpers:

Replace `test_delete_expense` (lines 52-59) with:

```python
def test_delete_expense(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    repo.delete(expense.id)

    result = repo.fetch_by_month(year=2026, month=1)
    assert result == []
```

Replace `test_mark_as_paid_recurring_creates_next_occurrence` (lines 72-85) with:

```python
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
```

Replace `test_mark_as_paid_non_recurring_creates_nothing_extra` (lines 88-97) with:

```python
def test_mark_as_paid_non_recurring_creates_nothing_extra(db_session):
    repo = ExpenseRepository(db_session)
    expense = repo.create(make_input())

    repo.mark_as_paid(expense.id, datetime(2026, 1, 1, tzinfo=timezone.utc))

    result = repo.fetch_by_month(year=2026, month=1)
    assert len(result) == 1
    assert result[0].paid_at is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_repository.py -v`
Expected: FAIL — `AttributeError: 'ExpenseRepository' object has no attribute 'fetch_by_month'` (and `fetch_unpaid`/`fetch_paid` no longer exist for the tests still calling them, until Step 3 finishes updating the file).

- [ ] **Step 3: Implement `fetch_by_month`, remove `fetch_unpaid`/`fetch_paid`**

In `backend/app/expenses/repository.py`, replace lines 23-40 (the `fetch_unpaid` and `fetch_paid` methods) with:

```python
    def fetch_by_month(self, year: int, month: int) -> list[Expense]:
        start_of_month = date(year, month, 1)
        if month == 12:
            end_of_month_exclusive = date(year + 1, 1, 1)
        else:
            end_of_month_exclusive = date(year, month + 1, 1)

        stmt = (
            select(Expense)
            .where(
                Expense.due_date >= start_of_month,
                Expense.due_date < end_of_month_exclusive,
            )
            .order_by(Expense.paid_at.is_(None).desc(), Expense.due_date.asc())
        )
        return list(self.db.scalars(stmt))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_repository.py -v`
Expected: PASS (all tests in the file, including the unrelated `fetch_monthly_totals` tests which are untouched).

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/repository.py backend/tests/test_repository.py
git commit -m "Replace fetch_unpaid/fetch_paid with fetch_by_month"
```

---

## Task 2: Backend — `GET /api/expenses?year=&month=` endpoint

**Files:**
- Modify: `backend/app/expenses/router.py:23-34` (replace `/unpaid` and `/paid` routes)
- Modify: `backend/tests/test_router.py`

**Interfaces:**
- Consumes: `ExpenseRepository.fetch_by_month(year: int, month: int) -> list[Expense]` (Task 1).
- Produces: `GET /api/expenses?year={int}&month={int}` returning `list[ExpenseRead]` in the same order as `fetch_by_month`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_router.py`, replace `test_list_unpaid_sorted_by_due_date` (lines 60-67) with:

```python
def test_list_by_month_sorted_by_due_date(client):
    client.post("/api/expenses", json={"description": "B", "amount": "10", "due_date": "2026-01-20"})
    client.post("/api/expenses", json={"description": "A", "amount": "10", "due_date": "2026-01-05"})

    response = client.get("/api/expenses?year=2026&month=1")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["A", "B"]


def test_list_by_month_excludes_other_months(client):
    client.post("/api/expenses", json={"description": "January", "amount": "10", "due_date": "2026-01-15"})
    client.post("/api/expenses", json={"description": "February", "amount": "10", "due_date": "2026-02-15"})

    response = client.get("/api/expenses?year=2026&month=1")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["January"]


def test_list_by_month_places_paid_after_unpaid(client):
    client.post("/api/expenses", json={"description": "Unpaid", "amount": "10", "due_date": "2026-01-20"})
    paid = client.post(
        "/api/expenses", json={"description": "Paid", "amount": "10", "due_date": "2026-01-05"}
    ).json()
    client.post(f"/api/expenses/{paid['id']}/mark-paid")

    response = client.get("/api/expenses?year=2026&month=1")
    assert response.status_code == 200
    descriptions = [item["description"] for item in response.json()]
    assert descriptions == ["Unpaid", "Paid"]
```

Replace `test_mark_as_paid_moves_expense_to_paid_list` (lines 70-83) with:

```python
def test_mark_as_paid_sets_paid_at_and_keeps_expense_in_month_list(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.post(f"/api/expenses/{created['id']}/mark-paid")
    assert response.status_code == 200
    assert response.json()["paid_at"] is not None

    month_list = client.get("/api/expenses?year=2026&month=1").json()
    matching = [item for item in month_list if item["id"] == created["id"]]
    assert len(matching) == 1
    assert matching[0]["paid_at"] is not None
```

Replace `test_mark_as_paid_recurring_spawns_next_occurrence` (lines 86-101) — only the assertion needs to change:

```python
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

    next_month = client.get("/api/expenses?year=2026&month=2").json()
    assert any(item["due_date"] == "2026-02-01" for item in next_month)
```

Replace `test_delete_expense` (lines 115-124) with:

```python
def test_delete_expense(client):
    created = client.post(
        "/api/expenses", json={"description": "Rent", "amount": "10", "due_date": "2026-01-01"}
    ).json()

    response = client.delete(f"/api/expenses/{created['id']}")
    assert response.status_code == 204

    month_list = client.get("/api/expenses?year=2026&month=1").json()
    assert all(item["id"] != created["id"] for item in month_list)
```

`test_reverse_payment_returns_expense_to_unpaid` (lines 104-112) needs no change — leave it as-is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_router.py -v`
Expected: FAIL — `404 Not Found` for `GET /api/expenses?...` (route doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

In `backend/app/expenses/router.py`, replace lines 23-34 (`list_unpaid` and `list_paid`) with:

```python
@router.get("", response_model=list[ExpenseRead])
def list_by_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    repo: ExpenseRepository = Depends(get_repository),
):
    return repo.fetch_by_month(year=year, month=month)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/ -v`
Expected: PASS (full backend suite, since this endpoint change also affects behavior exercised by other router tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/expenses/router.py backend/tests/test_router.py
git commit -m "Replace /expenses/unpaid and /expenses/paid with /expenses?year=&month="
```

---

## Task 3: Frontend — `useExpensesByMonth` hook

**Files:**
- Modify: `frontend/src/api/expenses.ts:1-31` (replace `useUnpaidExpenses`/`usePaidExpenses` with `useExpensesByMonth`)
- Modify: `frontend/src/api/expenses.test.tsx:1-34`

**Interfaces:**
- Consumes: `GET /api/expenses?year=&month=` (Task 2), existing `apiClient.get<T>(path: string): Promise<T>` (`frontend/src/api/client.ts:31`), existing `Expense` type (`frontend/src/features/expenses/types.ts`).
- Produces: `useExpensesByMonth(year: number, month: number)` — a TanStack Query `useQuery` result with `data: Expense[] | undefined`, `isLoading: boolean`, `error: unknown`.

- [ ] **Step 1: Write the failing test**

In `frontend/src/api/expenses.test.tsx`, replace the import on line 6 and the `useUnpaidExpenses` describe block (lines 24-34):

```tsx
import { useCreateExpense, useExpensesByMonth } from './expenses'
```

```tsx
describe('useExpensesByMonth', () => {
  it('fetches the list for the given year and month', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: '1', description: 'Rent' }])

    const { result } = renderHook(() => useExpensesByMonth(2026, 1), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.get).toHaveBeenCalledWith('/expenses?year=2026&month=1')
    expect(result.current.data).toEqual([{ id: '1', description: 'Rent' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/api/expenses.test.tsx`
Expected: FAIL — `useExpensesByMonth` is not exported from `./expenses`.

- [ ] **Step 3: Implement the hook, remove the old ones**

In `frontend/src/api/expenses.ts`:

Change the import on line 1 (drop `useInfiniteQuery`, no longer used):

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
```

Delete the `PAGE_SIZE` constant (line 6) and the `useUnpaidExpenses`/`usePaidExpenses` functions (lines 15-31), replacing them with:

```ts
export function useExpensesByMonth(year: number, month: number) {
  return useQuery({
    queryKey: ['expenses', 'by-month', year, month],
    queryFn: () => apiClient.get<Expense[]>(`/expenses?year=${year}&month=${month}`),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/api/expenses.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/expenses.ts frontend/src/api/expenses.test.tsx
git commit -m "Replace useUnpaidExpenses/usePaidExpenses with useExpensesByMonth"
```

---

## Task 4: Frontend — paid-aware `ExpenseRow` + shared `expenseStatus` helper

**Files:**
- Create: `frontend/src/features/expenses/shared/expenseStatus.ts`
- Create: `frontend/src/features/expenses/shared/expenseStatus.test.ts`
- Modify: `frontend/src/features/expenses/shared/ExpenseRow.tsx`
- Create: `frontend/src/features/expenses/shared/ExpenseRow.test.tsx`

**Interfaces:**
- Produces: `expenseStatus(dueDate: string, today: Date): ExpenseStatus` (moved out of `UnpaidExpensesList.tsx`, unchanged behavior). `ExpenseRow` now derives paid state from `expense.paid_at` and renders a "Paid" chip + muted styling instead of the overdue/due-soon chip when paid.
- Consumes: existing `ExpenseStatus` type and `Expense` type, existing `Chip` component (`tone: 'success' | 'warning' | 'danger'`, `frontend/src/components/Chip.tsx:9-13`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/expenses/shared/expenseStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expenseStatus } from './expenseStatus'

describe('expenseStatus', () => {
  const today = new Date('2026-01-10T00:00:00')

  it('returns overdue for dates before today', () => {
    expect(expenseStatus('2026-01-09', today)).toBe('overdue')
  })

  it('returns due-soon for dates within 3 days', () => {
    expect(expenseStatus('2026-01-13', today)).toBe('due-soon')
  })

  it('returns normal for dates further than 3 days away', () => {
    expect(expenseStatus('2026-01-20', today)).toBe('normal')
  })
})
```

Create `frontend/src/features/expenses/shared/ExpenseRow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Expense } from '../types'
import { ExpenseRow } from './ExpenseRow'

const baseExpense: Expense = {
  id: '1',
  description: 'Rent',
  amount: '100.00',
  due_date: '2026-01-01',
  paid_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_recurring: false,
  recurrence_frequency: null,
  recurrence_interval: 1,
  recurrence_end_date: null,
}

describe('ExpenseRow', () => {
  it('shows an overdue chip for an unpaid overdue expense', () => {
    render(
      <ExpenseRow
        expense={baseExpense}
        status="overdue"
        primaryActionLabel="Mark as Paid"
        onPrimaryAction={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTestId('status-chip-1')).toHaveTextContent('Overdue')
  })

  it('shows a Paid chip instead of a status chip for a paid expense', () => {
    render(
      <ExpenseRow
        expense={{ ...baseExpense, paid_at: '2026-01-01T00:00:00Z' }}
        status="overdue"
        primaryActionLabel="Reverse Payment"
        onPrimaryAction={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTestId('status-chip-1')).toHaveTextContent('Paid')
  })

  it('calls onPrimaryAction when the primary action button is clicked', () => {
    const onPrimaryAction = vi.fn()
    render(
      <ExpenseRow
        expense={baseExpense}
        primaryActionLabel="Mark as Paid"
        onPrimaryAction={onPrimaryAction}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    screen.getByTestId('primary-action-1').click()
    expect(onPrimaryAction).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/expenses/shared/expenseStatus.test.ts src/features/expenses/shared/ExpenseRow.test.tsx`
Expected: FAIL — `expenseStatus.ts` doesn't exist yet; the "Paid chip" test fails because `ExpenseRow` doesn't render one yet.

- [ ] **Step 3: Implement `expenseStatus.ts`**

Create `frontend/src/features/expenses/shared/expenseStatus.ts`:

```ts
import type { ExpenseStatus } from './ExpenseRow'

const DUE_SOON_DAYS = 3

export function expenseStatus(dueDate: string, today: Date): ExpenseStatus {
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000)
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= DUE_SOON_DAYS) return 'due-soon'
  return 'normal'
}
```

- [ ] **Step 4: Update `ExpenseRow.tsx` for paid-aware rendering**

In `frontend/src/features/expenses/shared/ExpenseRow.tsx`, replace the function body (lines 18-70) with:

```tsx
export function ExpenseRow({
  expense,
  status = 'normal',
  primaryActionLabel,
  primaryActionIcon = 'check-icon',
  onPrimaryAction,
  onEdit,
  onDelete,
}: ExpenseRowProps) {
  const isPaid = expense.paid_at != null

  return (
    <div
      data-testid={`expense-row-${expense.id}`}
      className={`flex items-start justify-between gap-3 rounded-xl bg-surface p-4 shadow-elevation-1 ${
        isPaid ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{expense.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-500">
            {formatBRL(expense.amount)} · due {expense.due_date}
            {expense.paid_at ? ` · paid ${expense.paid_at}` : ''}
          </p>
          {isPaid ? (
            <Chip label="Paid" tone="success" testId={`status-chip-${expense.id}`} />
          ) : (
            <>
              {status === 'overdue' && <Chip label="Overdue" tone="danger" testId={`status-chip-${expense.id}`} />}
              {status === 'due-soon' && <Chip label="Due soon" tone="warning" testId={`status-chip-${expense.id}`} />}
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onPrimaryAction}
          aria-label={primaryActionLabel}
          data-testid={`primary-action-${expense.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 transition-colors hover:bg-primary-200"
        >
          <Icon name={primaryActionIcon} />
        </button>
        <button
          onClick={onEdit}
          aria-label="Edit"
          data-testid={`edit-${expense.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <Icon name="edit-icon" />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete"
          data-testid={`delete-${expense.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-danger-50 hover:text-danger-600"
        >
          <Icon name="delete-icon" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/expenses/shared/expenseStatus.test.ts src/features/expenses/shared/ExpenseRow.test.tsx`
Expected: PASS

Also run the pre-existing list tests to confirm nothing broke:

Run: `cd frontend && npx vitest run src/features/expenses/UnpaidList/UnpaidExpensesList.test.tsx src/features/expenses/PaidList/PaidExpensesList.test.tsx`
Expected: PASS (these still use the local `expenseStatus` copy in `UnpaidExpensesList.tsx`, untouched by this task; they're deleted wholesale in Task 6).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/expenses/shared/expenseStatus.ts frontend/src/features/expenses/shared/expenseStatus.test.ts frontend/src/features/expenses/shared/ExpenseRow.tsx frontend/src/features/expenses/shared/ExpenseRow.test.tsx
git commit -m "Add paid-aware styling to ExpenseRow and extract expenseStatus helper"
```

---

## Task 5: Frontend — `MonthNavigator` component

**Files:**
- Create: `frontend/src/features/expenses/MonthNavigator/MonthNavigator.tsx`
- Create: `frontend/src/features/expenses/MonthNavigator/MonthNavigator.test.tsx`

**Interfaces:**
- Produces: `MonthNavigator({ year: number, month: number, onPrevious: () => void, onNext: () => void })` — renders a "‹" button (`data-testid="month-nav-previous"`), a formatted month/year label (`data-testid="month-nav-label"`), and a "›" button (`data-testid="month-nav-next"`).
- Consumes: nothing beyond React/Intl built-ins.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/expenses/MonthNavigator/MonthNavigator.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MonthNavigator } from './MonthNavigator'

describe('MonthNavigator', () => {
  it('shows the formatted month and year label', () => {
    render(<MonthNavigator year={2026} month={9} onPrevious={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByTestId('month-nav-label')).toHaveTextContent('Setembro de 2026')
  })

  it('calls onPrevious when the previous button is clicked', () => {
    const onPrevious = vi.fn()
    render(<MonthNavigator year={2026} month={9} onPrevious={onPrevious} onNext={vi.fn()} />)
    screen.getByTestId('month-nav-previous').click()
    expect(onPrevious).toHaveBeenCalled()
  })

  it('calls onNext when the next button is clicked', () => {
    const onNext = vi.fn()
    render(<MonthNavigator year={2026} month={9} onPrevious={vi.fn()} onNext={onNext} />)
    screen.getByTestId('month-nav-next').click()
    expect(onNext).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/expenses/MonthNavigator/MonthNavigator.test.tsx`
Expected: FAIL — module `./MonthNavigator` doesn't exist.

- [ ] **Step 3: Implement `MonthNavigator`**

Create `frontend/src/features/expenses/MonthNavigator/MonthNavigator.tsx`:

```tsx
interface MonthNavigatorProps {
  year: number
  month: number
  onPrevious: () => void
  onNext: () => void
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

function formatMonthLabel(year: number, month: number): string {
  const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthNavigator({ year, month, onPrevious, onNext }: MonthNavigatorProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <button
        onClick={onPrevious}
        aria-label="Previous month"
        data-testid="month-nav-previous"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        ‹
      </button>
      <p data-testid="month-nav-label" className="text-sm font-medium text-gray-900">
        {formatMonthLabel(year, month)}
      </p>
      <button
        onClick={onNext}
        aria-label="Next month"
        data-testid="month-nav-next"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        ›
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/expenses/MonthNavigator/MonthNavigator.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/expenses/MonthNavigator/MonthNavigator.tsx frontend/src/features/expenses/MonthNavigator/MonthNavigator.test.tsx
git commit -m "Add MonthNavigator component"
```

---

## Task 6: Frontend — merged `ExpensesList` component

**Files:**
- Create: `frontend/src/features/expenses/ExpensesList/ExpensesList.tsx`
- Create: `frontend/src/features/expenses/ExpensesList/ExpensesList.test.tsx`

**Interfaces:**
- Consumes: `useExpensesByMonth(year, month)` (Task 3), `useMarkAsPaid()`, `useReversePayment()`, `useDeleteExpense()` (`frontend/src/api/expenses.ts`, unchanged), `expenseStatus` (Task 4), `ExpenseRow` (Task 4).
- Produces: `ExpensesList({ year: number, month: number })` — renders one `ExpenseRow` per expense in the order the API returns (unpaid first, then paid, both by `due_date` ascending), wiring "Mark as Paid" for unpaid rows and "Reverse Payment" for paid rows.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/expenses/ExpensesList/ExpensesList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { ExpensesList } from './ExpensesList'

vi.mock('../../../api/expenses')

function mockExpenses(data: unknown) {
  vi.mocked(expensesApi.useExpensesByMonth).mockReturnValue({ data, isLoading: false, error: null } as never)
  vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)
}

describe('ExpensesList', () => {
  it('renders rows in the order the API returns them', () => {
    mockExpenses([
      { id: '1', description: 'Unpaid bill', amount: '10', due_date: '2999-01-01', paid_at: null },
      { id: '2', description: 'Paid bill', amount: '20', due_date: '2026-01-01', paid_at: '2026-01-02T00:00:00Z' },
    ])

    render(
      <MemoryRouter>
        <ExpensesList year={2026} month={1} />
      </MemoryRouter>,
    )

    const rows = screen.getAllByText(/bill/i)
    expect(rows[0]).toHaveTextContent('Unpaid bill')
    expect(rows[1]).toHaveTextContent('Paid bill')
  })

  it('shows Mark as Paid for unpaid rows and Reverse Payment for paid rows', () => {
    mockExpenses([
      { id: '1', description: 'Unpaid bill', amount: '10', due_date: '2999-01-01', paid_at: null },
      { id: '2', description: 'Paid bill', amount: '20', due_date: '2026-01-01', paid_at: '2026-01-02T00:00:00Z' },
    ])

    render(
      <MemoryRouter>
        <ExpensesList year={2026} month={1} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('primary-action-1')).toHaveAttribute('aria-label', 'Mark as Paid')
    expect(screen.getByTestId('primary-action-2')).toHaveAttribute('aria-label', 'Reverse Payment')
  })

  it('shows an empty state when there are no expenses this month', () => {
    mockExpenses([])

    render(
      <MemoryRouter>
        <ExpensesList year={2026} month={1} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no expenses this month/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/expenses/ExpensesList/ExpensesList.test.tsx`
Expected: FAIL — module `./ExpensesList` doesn't exist.

- [ ] **Step 3: Implement `ExpensesList`**

Create `frontend/src/features/expenses/ExpensesList/ExpensesList.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, useExpensesByMonth, useMarkAsPaid, useReversePayment } from '../../../api/expenses'
import { SkeletonRow } from '../../../components/SkeletonRow'
import { expenseStatus } from '../shared/expenseStatus'
import { ExpenseRow } from '../shared/ExpenseRow'

interface ExpensesListProps {
  year: number
  month: number
}

export function ExpensesList({ year, month }: ExpensesListProps) {
  const { data, isLoading, error } = useExpensesByMonth(year, month)
  const markAsPaid = useMarkAsPaid()
  const reversePayment = useReversePayment()
  const deleteExpense = useDeleteExpense()
  const navigate = useNavigate()
  const today = new Date()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }
  if (error) return <p className="p-6 text-center text-danger-600">Failed to load expenses.</p>
  if (!data || data.length === 0) return <p className="p-10 text-center text-gray-500">No expenses this month 🎉</p>

  return (
    <div className="space-y-3">
      {data.map((expense) => {
        const onDelete = () => {
          if (window.confirm('Delete this expense?')) {
            deleteExpense.mutate(expense.id)
          }
        }
        const onEdit = () => navigate(`/expenses/${expense.id}/edit`)

        return expense.paid_at ? (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            primaryActionLabel="Reverse Payment"
            primaryActionIcon="restore-icon"
            onPrimaryAction={() => reversePayment.mutate(expense.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            status={expenseStatus(expense.due_date, today)}
            primaryActionLabel="Mark as Paid"
            onPrimaryAction={() => markAsPaid.mutate(expense.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/expenses/ExpensesList/ExpensesList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/expenses/ExpensesList/ExpensesList.tsx frontend/src/features/expenses/ExpensesList/ExpensesList.test.tsx
git commit -m "Add merged ExpensesList component"
```

---

## Task 7: Frontend — wire `ExpensesPage`, remove tabs and old list components

**Files:**
- Modify: `frontend/src/features/expenses/ExpensesPage.tsx`
- Create: `frontend/src/features/expenses/ExpensesPage.test.tsx`
- Delete: `frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.tsx`
- Delete: `frontend/src/features/expenses/UnpaidList/UnpaidExpensesList.test.tsx`
- Delete: `frontend/src/features/expenses/PaidList/PaidExpensesList.tsx`
- Delete: `frontend/src/features/expenses/PaidList/PaidExpensesList.test.tsx`
- Delete: `frontend/src/components/Tabs.tsx`

**Interfaces:**
- Consumes: `MonthNavigator` (Task 5), `ExpensesList` (Task 6), existing `Fab` component.
- Produces: `ExpensesPage` — holds `{year, month}` state defaulting to the current calendar month, renders `MonthNavigator` above `ExpensesList`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/expenses/ExpensesPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../api/expenses'
import { ExpensesPage } from './ExpensesPage'

vi.mock('../../api/expenses')

function mockEmptyExpenses() {
  vi.mocked(expensesApi.useExpensesByMonth).mockReturnValue({ data: [], isLoading: false, error: null } as never)
  vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)
}

describe('ExpensesPage', () => {
  it('moves to the next month when the next button is clicked', () => {
    mockEmptyExpenses()

    render(
      <MemoryRouter>
        <ExpensesPage />
      </MemoryRouter>,
    )

    const [initialYear, initialMonth] = vi.mocked(expensesApi.useExpensesByMonth).mock.calls[0]

    screen.getByTestId('month-nav-next').click()

    const nextCall = vi.mocked(expensesApi.useExpensesByMonth).mock.calls.at(-1)
    const expected = initialMonth === 12 ? [initialYear + 1, 1] : [initialYear, initialMonth + 1]
    expect(nextCall).toEqual(expected)
  })

  it('moves to the previous month when the previous button is clicked', () => {
    mockEmptyExpenses()

    render(
      <MemoryRouter>
        <ExpensesPage />
      </MemoryRouter>,
    )

    const [initialYear, initialMonth] = vi.mocked(expensesApi.useExpensesByMonth).mock.calls[0]

    screen.getByTestId('month-nav-previous').click()

    const prevCall = vi.mocked(expensesApi.useExpensesByMonth).mock.calls.at(-1)
    const expected = initialMonth === 1 ? [initialYear - 1, 12] : [initialYear, initialMonth - 1]
    expect(prevCall).toEqual(expected)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/expenses/ExpensesPage.test.tsx`
Expected: FAIL — `month-nav-next`/`month-nav-previous` test ids don't exist yet (`ExpensesPage` still renders `Tabs`).

- [ ] **Step 3: Rewrite `ExpensesPage.tsx`**

Replace the full content of `frontend/src/features/expenses/ExpensesPage.tsx` with:

```tsx
import { useState } from 'react'
import { Fab } from '../../components/Fab'
import { ExpensesList } from './ExpensesList/ExpensesList'
import { MonthNavigator } from './MonthNavigator/MonthNavigator'

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return { year: nextYear, month: nextMonth }
}

export function ExpensesPage() {
  const today = new Date()
  const [{ year, month }, setYearMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })

  return (
    <div>
      <MonthNavigator
        year={year}
        month={month}
        onPrevious={() => setYearMonth(shiftMonth(year, month, -1))}
        onNext={() => setYearMonth(shiftMonth(year, month, 1))}
      />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        <ExpensesList year={year} month={month} />
      </main>
      <Fab to="/expenses/new" label="New expense" />
    </div>
  )
}
```

- [ ] **Step 4: Delete the old tab-based components and `Tabs`**

```bash
rm -rf frontend/src/features/expenses/UnpaidList
rm -rf frontend/src/features/expenses/PaidList
rm frontend/src/components/Tabs.tsx
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: PASS — full frontend suite passes with no references to the deleted files remaining.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src/features/expenses frontend/src/components/Tabs.tsx
git commit -m "Wire ExpensesPage to MonthNavigator + ExpensesList, remove tab-based lists"
```

---

## Final Verification

- [ ] Run the full backend suite: `cd backend && pytest -v` — expect all tests to pass.
- [ ] Run the full frontend suite: `cd frontend && npx vitest run` — expect all tests to pass.
- [ ] Manually smoke-test in the browser: open the Expenses page, confirm it shows the current month's expenses with paid ones at the bottom, and that the ‹/› buttons move between months and refetch correctly (including across a December→January boundary).
