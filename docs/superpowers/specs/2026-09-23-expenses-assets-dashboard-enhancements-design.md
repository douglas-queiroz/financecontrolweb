# Expenses total, asset edit/delete, and dashboard "next month" chart

## Context

Three small, independent enhancements to existing screens:

1. Show a month total (paid vs. remaining) on the Expenses screen.
2. Add edit (rename) and delete actions on the Asset Details screen.
3. On the Dashboard's expenses chart, once every expense due in the
   current month is paid, show next month's total instead of the
   current month's.

Each change works with code and endpoints that already exist — no new
subsystems. Related prior specs: [[2026-09-09-expenses-web-port-design]],
[[2026-09-11-assets-feature-design]], [[2026-09-10-dashboard-home-screen-design]].

## Decisions made during brainstorming

- **Asset edit scope:** rename only. The backend's `PATCH /api/assets/{id}`
  already supports only `name` (`AssetUpdate` schema has no other
  fields); category/code/currency are immutable by design (see the
  assets spec's "Categories, currency, and pricing rules" section) and
  quantity/cost already change via the existing Buy/Sell and Update
  Value flows. No backend changes for this part.
- **Expenses total shape:** a paid/remaining breakdown, not a single
  sum, since the list is already sorted unpaid-first and shows
  overdue/due-soon status — a bare total would be less useful than
  seeing what's left to pay.
- **"Next month total" basis:** literal expense rows that already have
  a `due_date` in next month (manually created ahead of time, or
  recurring rows already materialized). **Not** a simulated projection
  of not-yet-materialized recurring expenses — that would require new
  forward-simulation logic around `recurrence.next_due_date` and is out
  of scope.
- **Chart display:** when the current month is fully paid, the
  highlighted "current month" bar is **replaced** by next month
  (label and value), rather than appending a 13th bar. Keeps the chart
  at a constant 12 bars and keeps its focus on "what's paid / what's
  coming up."
- **No new modal component.** The codebase has no modal/dialog anywhere
  (confirmed by grep) — the only existing confirmation pattern is
  `window.confirm(...)` in `ExpensesList.tsx:36`. Asset delete reuses
  that same convention rather than introducing a new component.

## Feature 1: Expenses screen month total

Frontend-only; no backend or API change. `ExpensesList.tsx` already
fetches the full month's expenses via `useExpensesByMonth(year, month)`
(`frontend/src/features/expenses/ExpensesList/ExpensesList.tsx:13`).

Add a `useMemo` in `ExpensesList.tsx` that reduces `data` into:

```ts
{ total: number; paid: number; remaining: number }
```

`paid` sums `Number(expense.amount)` where `expense.paid_at` is
non-null; `total` sums all amounts; `remaining = total - paid`. This
mirrors the existing `reduce`-based total idiom in
`AssetsPage.tsx:11-14`.

Render a summary card above the list (only when `data` is loaded and
non-empty — keep the existing empty-state message
`"No expenses this month 🎉"` unchanged when there's nothing to
summarize), using the existing `formatBRL` helper for all three
figures, e.g.:

```
Total: R$ 1.200,00
Paid:  R$ 800,00
Remaining: R$ 400,00
```

Give the card `data-testid="expenses-summary"`, following the
`data-testid="assets-total"` convention on `AssetsPage.tsx:28`. It
recomputes automatically on month navigation since `ExpensesList`
re-renders with new `data` whenever `year`/`month` props change.

## Feature 2: Edit and delete asset on Asset Details

Frontend-only. Both mutations already exist and work end-to-end on the
backend but have zero UI entry point today:

- `useUpdateAssetName()` — `frontend/src/api/assets.ts:39-46` →
  `PATCH /api/assets/{id}` with `{ name }` (backend:
  `backend/app/assets/router.py:50-55` →
  `repository.update_asset_name`).
- `useDeleteAsset()` — `frontend/src/api/assets.ts:48-54` →
  `DELETE /api/assets/{id}` (backend:
  `backend/app/assets/router.py:58-63` → `repository.delete_asset`,
  which already cascades transactions/value history and cleans up any
  manual FX bridge rows).

Both are wired into `AssetDetailPage.tsx`.

### Edit (rename)

- Add an "Edit" button next to the existing "Buy / Sell" button in the
  top card (`AssetDetailPage.tsx:44-61`).
- Add `showEditForm` boolean state, toggled by the button — same
  show/hide pattern already used for `showTransactionForm` and
  `showValueForm` in that file. No modal.
- The inline form: one text input pre-filled with `asset.name`, a
  "Save" button calling
  `updateName.mutate({ id: asset.id, name }, { onSuccess: () => setShowEditForm(false) })`.
  Submit is disabled when the trimmed name is empty.

### Delete

- Add a "Delete" button in the same button row, styled as a
  destructive action (reuse the `text-danger-600` tone already used
  for negative gain/loss, e.g. `AssetDetailPage.tsx:40`).
- On click: `window.confirm('Delete this asset?')`, matching the
  existing confirmation wording style in
  `ExpensesList.tsx:36` (`'Delete this expense?'`). On confirm, call
  `deleteAsset.mutate(asset.id, { onSuccess: () => navigate('/assets') })`
  (`useNavigate` from `react-router-dom`, same as `AssetRow.tsx`'s
  existing navigation).

No backend changes. No new tests needed for the already-tested
mutations/endpoints — new frontend tests cover only the new UI wiring
(button renders, click triggers the mutation with the right
arguments, success navigates/hides the form).

## Feature 3: Dashboard chart shows next month once current month is fully paid

Backend + frontend change to the existing expenses monthly-totals
endpoint and chart. The assets dashboard chart
(`AssetMonthlyTotalsChart.tsx`) is untouched — this feature is specific
to expenses, where a "paid" concept exists.

### Backend

Extend `MonthlyTotal` (`backend/app/expenses/schemas.py:48-54`) with
two new optional fields, populated only for the bucket that represents
the current month (left `None` for the other 11):

```python
class MonthlyTotal(BaseModel):
    month: str
    total: Decimal
    all_paid: bool | None = None
    next_month_total: Decimal | None = None

    @field_serializer("total")
    def serialize_total(self, value: Decimal) -> str:
        return f"{value:.2f}"

    @field_serializer("next_month_total")
    def serialize_next_month_total(self, value: Decimal | None) -> str | None:
        return f"{value:.2f}" if value is not None else None
```

The response stays a `list[MonthlyTotal]` of exactly 12 entries (no
shape change) — old and new frontend code both keep working; the two
new fields are simply absent/`None` on 11 of the 12 items.

In `ExpenseRepository.fetch_monthly_totals`
(`backend/app/expenses/repository.py:118-149`), after building `totals`
as today, compute for the current-month bucket only (the last one,
`offset == 11`):

- **`all_paid`**: query expenses with `due_date` in the current month's
  range (same start/end-exclusive computation already used in
  `fetch_by_month`, lines 24-28) and check `all(e.paid_at is not None
  for e in rows)`. **If there are zero expenses due this month, treat
  it as fully paid** (vacuous truth) — this is expected behavior, not
  a bug: an empty current month means nothing is left to pay, so the
  chart should look ahead.
- **`next_month_total`**: only computed when `all_paid` is `True`.
  Sum `amount` for expenses whose `due_date` falls in the calendar
  month immediately after the current one (same "literal rows that
  already exist" rule as the rest of this endpoint — no simulation of
  not-yet-materialized recurring expenses). Reuse the same
  start/end-exclusive date arithmetic pattern, shifted forward by one
  month.

Set these two fields directly on the `MonthlyTotal` object for that
bucket before returning `totals`.

### Frontend

- `frontend/src/features/dashboard/types.ts`: add
  `all_paid?: boolean` and `next_month_total?: string` to the
  `MonthlyTotal` interface.
- `MonthlyTotalsChart.tsx`: in `toChartPoints`
  (`MonthlyTotalsChart.tsx:57-69`), for the point where
  `isCurrentMonth` is true and `total.all_paid && total.next_month_total != null`:
  override that point's `label`/`fullMonth` to next month's (derive
  from `month`/`year` + 1, wrapping December → January/year+1, same
  arithmetic already used in `ExpensesPage.tsx`'s `shiftMonth`), and
  override `total` to `total.next_month_total` for display. Keep
  `isCurrentMonth: true` so it keeps the existing highlight color
  (`CURRENT_MONTH_COLOR`) — visually it's still "the bar you should pay
  attention to," just now pointing at next month. Add an
  `isShowingNextMonth: boolean` flag on `ChartPoint` so `ChartTooltip`
  can optionally reflect that it's an upcoming (not yet fully known)
  total, e.g. by appending "(upcoming)" to the tooltip's month line.
  Keep `point.month` (the underlying `YYYY-MM` key) unchanged for the
  `Cell key={point.month}` React key — only the *displayed* label/value
  swap.

## Non-goals

- No full asset edit (category, code, currency, quantity stay
  immutable — delete and recreate for those, per the existing assets
  spec).
- No projected/simulated next-month total for recurring expenses not
  yet materialized — only literal existing rows are summed.
- No new modal/dialog component — delete confirmation reuses
  `window.confirm`, consistent with the rest of the app.
- No change to `AssetMonthlyTotalsChart.tsx` or its backend aggregate.
- No de-duplication of `MonthlyTotalsChart.tsx` /
  `AssetMonthlyTotalsChart.tsx` (they're near-identical today) — noted
  as a possible future cleanup, out of scope here since only the
  expenses chart is changing.

## Testing

Backend (`backend/tests/`, following existing
`test_repository.py`/`test_router.py` patterns for `expenses`):

- `fetch_monthly_totals`: current month fully paid → `all_paid=True`
  and `next_month_total` reflects next month's existing rows; current
  month partially paid → `all_paid=False`, `next_month_total=None`;
  current month with zero expenses → `all_paid=True` (vacuous case);
  non-current-month buckets always have both fields `None`.

Frontend (co-located `*.test.tsx`, following existing conventions):

- `ExpensesList.test.tsx`: summary card shows correct total/paid/
  remaining for a mixed paid/unpaid fixture; card is absent (or shows
  zeros, matching whatever the empty-state decision above renders)
  when the month has no expenses.
- `AssetDetailPage.test.tsx`: Edit button reveals the rename form
  pre-filled with the current name and calls the mutation with the
  new name on submit; Delete button calls `window.confirm` and, on
  confirmation, calls the delete mutation and navigates to `/assets`;
  declining the confirm calls neither.
- `MonthlyTotalsChart.test.tsx`: given a 12-item fixture where the last
  item has `all_paid: true, next_month_total: "500.00"`, the rendered
  chart data's last point shows next month's label and `500.00`
  instead of the current month's own total; given `all_paid: false`,
  the chart renders unchanged from today's behavior.

Manual check via `docker-compose up`: mark every expense in the
current month as paid and confirm the Dashboard chart's last bar
switches to next month's label/total; reverse one payment and confirm
it switches back.
