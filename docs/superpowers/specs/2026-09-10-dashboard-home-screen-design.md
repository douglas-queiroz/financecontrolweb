# Dashboard home screen

## Context

The app currently has a single screen (`ExpensesPage` at `/`) with no
navigation shell. This document specs a new Dashboard screen that becomes
the app's home, showing a bar chart of monthly expense totals for the
trailing 12 months (11 past months + the current month), plus a nav menu
to reach the existing Expenses screen.

Related: [[2026-09-10-material-design-layout-design]] — the Dashboard and
nav shell should use the same Material-inspired tokens (surface, elevation,
primary color, card styling) defined there.

## Decisions made during brainstorming

- Chart metric: total **due** per month (sum of `amount` where `due_date`
  falls in that month), not total paid — matches the app's existing
  due-date-centric model and shows spending obligations rather than only
  realized payments.
- Charting approach: add **Recharts** as a dependency, rather than
  hand-rolling SVG — accepted trade-off of one new frontend dependency for
  built-in responsive container, tooltips, and less custom chart code.
- Navigation: a persistent **top app bar with nav links** (Dashboard /
  Expenses), not a hamburger/drawer — simplest option, no overlay state,
  works at all widths, and the app only has two top-level screens today.

## Routing & navigation shell

Add a shared `AppShell` layout component: a top app bar (app title +
`NavLink`s for "Dashboard" and "Expenses", active link highlighted) that
wraps all screens via a React Router layout route.

Routing changes in `App.tsx`:

```
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/expenses" element={<ExpensesPage />} />
    <Route path="/expenses/new" element={<ExpenseForm mode="create" />} />
    <Route path="/expenses/:id/edit" element={<EditExpenseRoute />} />
  </Route>
</Routes>
```

`/` becomes the Dashboard (home); the expenses list moves from `/` to
`/expenses`. The nav bar and (per the layout spec) the expenses-screen FAB
remain reachable from every screen since they all render inside `AppShell`.

New file: `frontend/src/components/AppShell.tsx` (renders `<Outlet />`
from `react-router-dom`).

## Backend: monthly totals endpoint

New endpoint on the existing expenses router:

```
GET /api/expenses/monthly-totals
```

- Computes the last 12 calendar months, oldest to newest, ending with the
  current month (11 past months + current).
- For each month, sums `amount` for all expenses whose `due_date` falls in
  that month, regardless of paid status.
- **Months with no expenses are included with a total of `0`** — the
  response always has exactly 12 entries.
- Response shape (list, chronological order):

```json
[
  { "month": "2025-10", "total": "0.00" },
  { "month": "2025-11", "total": "123.45" },
  ...
  { "month": "2026-09", "total": "88.00" }
]
```

`month` is `YYYY-MM`. `total` is serialized as a string, matching how
`ExpenseRead.amount` is already serialized (via `field_serializer`).

### Implementation notes

- New schema `MonthlyTotal` in `backend/app/expenses/schemas.py`: `month:
  str`, `total: Decimal` with a `field_serializer` for `total` (same
  pattern as `ExpenseRead.amount`).
- New repository method `ExpenseRepository.fetch_monthly_totals(today:
  date) -> list[MonthlyTotal]` in `backend/app/expenses/repository.py`,
  constructing and returning `MonthlyTotal` schema instances directly
  (unlike the other repository methods, which return `Expense` ORM models
  for the router to serialize via `response_model` — there's no ORM model
  for a computed monthly aggregate, so the repository builds the response
  schema itself):
  1. Compute `start_of_range` = first day of the month 11 months before
     `today`, and `end_of_range` = last day of `today`'s month.
  2. Query all expenses with `due_date` between `start_of_range` and
     `end_of_range` (one query, no per-month queries).
  3. Bucket results in Python by `(due_date.year, due_date.month)`,
     summing `amount` as `Decimal`.
  4. Build the 12-entry list by iterating the 12 target months in order,
     defaulting to `Decimal("0")` for months with no matching bucket.
- Bucketing happens in Python rather than SQL `date_trunc`/`strftime`
  because tests run against SQLite (`backend/tests/conftest.py`) while the
  app targets Postgres in `docker-compose.yml` — avoiding
  dialect-specific date functions keeps the logic portable and easily
  unit-testable.
- New route in `backend/app/expenses/router.py`:
  `@router.get("/monthly-totals", response_model=list[MonthlyTotal])`.
  No path-parameter conflicts with existing routes (no existing
  `GET /{expense_id}`).

## Frontend: dashboard page & chart

New feature folder `frontend/src/features/dashboard/`:

- `DashboardPage.tsx` — page component rendered at `/`. Renders a card
  (Material surface + elevation, per the layout spec) containing the
  chart, with loading/empty/error states.
- `MonthlyTotalsChart.tsx` — wraps Recharts: `ResponsiveContainer` >
  `BarChart` > `CartesianGrid` + `XAxis` + `YAxis` + `Tooltip` + `Bar`.
  - X-axis labels: short month format, e.g. `Oct '25`.
  - The current month's bar is rendered in the primary color; the 11 past
    months use a lighter/secondary shade of the same palette, so the
    current month visually stands out.
  - Tooltip shows the full month name/year and the formatted total.

New hook in `frontend/src/api/expenses.ts`:

```ts
export function useMonthlyTotals() {
  return useQuery({
    queryKey: ['expenses', 'monthly-totals'],
    queryFn: () => apiClient.get<MonthlyTotal[]>('/expenses/monthly-totals'),
  })
}
```

New type `MonthlyTotal` in `frontend/src/features/expenses/types.ts` (or a
new `features/dashboard/types.ts`): `{ month: string; total: string }`.

Loading state: skeleton chart placeholder (reuse/extend the
`SkeletonRow`-style pattern from the layout spec). Error state: inline
message consistent with the existing `Failed to load expenses.` pattern.
No explicit "empty" state distinct from loading/error is needed, since the
endpoint always returns 12 entries (zero-filled) rather than an empty
array.

## New dependency

`recharts` (frontend). Verify the installed version's React 19
compatibility during implementation (use the latest stable release).

## Non-goals

- No date-range picker or ability to change which 12 months are shown.
- No click-through from a bar to a filtered expense list.
- No additional dashboard widgets (e.g. a "total unpaid" summary card) —
  just the one chart, per the request. Can be a follow-up.
- No dark mode (consistent with [[2026-09-10-material-design-layout-design]]).

## Testing

Backend (`backend/tests/`, following existing `test_repository.py` /
`test_router.py` patterns):

- Repository: expenses spread across multiple months sum correctly per
  month; months with no expenses return `0`; boundary dates (first/last
  day of a month) bucket into the correct month; exactly 12 entries are
  returned in chronological order.
- Router: `GET /api/expenses/monthly-totals` returns 12 entries with the
  expected shape (`month`, `total` as string).

Frontend (`frontend/src/features/dashboard/`, following existing list
component test patterns):

- `DashboardPage` test mocking `useMonthlyTotals` to assert loading,
  error, and rendered-with-data states (e.g. 12 bars/data points reach the
  chart).
- No attempt to test Recharts' internal SVG rendering — assert on data
  passed to/rendered by the chart, not pixel output.

Manual check via `npm run dev` / `docker-compose up`: verify the Dashboard
loads at `/`, the chart shows 12 months with the current month
highlighted, and nav links correctly move between Dashboard and Expenses.
