# Brazilian Real (BRL) currency formatting

## Context

`Expense.amount` is stored on the backend as a `Decimal` and serialized to
a plain numeric string (e.g. `"50.00"`, see
`backend/app/expenses/schemas.py`). The frontend currently displays and
edits this raw string with no locale formatting at all:

- `ExpenseRow` (`frontend/src/features/expenses/shared/ExpenseRow.tsx`)
  renders `{expense.amount}` directly in the row subtitle.
- `ExpenseForm` (`frontend/src/features/expenses/ExpenseForm/ExpenseForm.tsx`)
  edits `amount` through a plain `<input>` with no masking; validation is
  just `Number(amount) > 0`.

This app is single-currency and BRL-only — multi-currency support is
already out of scope per
[[2026-09-09-expenses-web-port-design]]. This spec adds Brazilian Real
display formatting (`R$ 1.234,56`) and a masked currency input, without
changing the backend's canonical decimal-string wire format.

## Decisions made during brainstorming

- **Scope:** cover all three of a shared formatting utility, read-only
  display (`ExpenseRow`), and the create/edit form's Amount field —
  not just one of them.
- **Input UX:** the Amount field uses a cents-first live mask (digits
  enter from the right, like a POS terminal — typing `1`, `5`, `0`, `0`,
  `0` produces `R$ 0,01` → `R$ 0,15` → `R$ 1,50` → `R$ 15,00` →
  `R$ 150,00`), not a format-on-blur field. This is the idiomatic pattern
  for BRL currency inputs.
- **Wire format unchanged:** the canonical `amount` value passed to/from
  the API stays a locale-agnostic decimal string (`"1234.56"`). All BRL
  formatting is presentation-only on the frontend; the backend and
  `ExpenseInput`/`Expense` types are untouched.
- **Dashboard out of scope:** the Dashboard home screen
  ([[2026-09-10-dashboard-home-screen-design]]) has no implementation yet
  (spec only, no `DashboardPage` code exists). This spec makes
  `formatBRL` available for it but does not wire it in.

## Design

### `frontend/src/lib/currency.ts` (new)

Pure functions, no React dependency:

- `formatBRL(value: string | number): string` — formats a canonical
  decimal value as Brazilian Real using
  `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`,
  e.g. `"1234.56"` → `"R$ 1.234,56"`.
- `centsToDecimalString(cents: number): string` — converts an integer
  cents count to the canonical decimal string used on the wire, e.g.
  `123456` → `"1234.56"`.
- `decimalStringToCents(value: string): number` — the inverse
  conversion, used to seed the masked input when editing an existing
  expense, e.g. `"1234.56"` → `123456`. Treats an empty/invalid string as
  `0`.

### `frontend/src/components/CurrencyInput.tsx` (new)

A controlled component alongside the existing generic components
(`Chip`, `Icon`, `Fab`, `Tabs`):

```ts
interface CurrencyInputProps {
  value: string // canonical decimal string, e.g. "50.00"
  onChange: (value: string) => void
  className?: string
}
```

- Internally tracks an integer **cents** state, initialized from `value`
  via `decimalStringToCents`.
- On every keystroke, non-digit characters are stripped; each typed digit
  shifts the existing cents left one decimal digit and appends the new
  digit (`cents = cents * 10 + digit`, clamped so it can't overflow a
  safe integer). Backspace removes the last digit
  (`cents = Math.floor(cents / 10)`).
- Renders the input's displayed value via `formatBRL(cents / 100)` on
  every change — no separate blur-triggered reformat step.
- When `cents === 0` (untouched or fully cleared), the displayed value is
  `""` rather than `"R$ 0,00"`, so the create form still starts blank as
  it does today.
- On every change where cents changes, calls
  `onChange(centsToDecimalString(cents))` so the parent's state remains
  the canonical wire-format string — no change to `ExpenseInput`'s shape.
- If the `value` prop changes from outside (e.g. form reset, loading a
  different `initialExpense`), the internal cents state resyncs via
  `decimalStringToCents(value)`.

### Wiring changes

- `ExpenseForm.tsx`: replace the plain `<input>` on the Amount field with
  `<CurrencyInput value={amount} onChange={setAmount} className={FIELD_CLASSES} />`.
  `amount` state and the `isValid` check (`Number(amount) > 0`) are
  unchanged since `amount` remains a canonical decimal string.
- `ExpenseRow.tsx`: replace `{expense.amount}` with
  `{formatBRL(expense.amount)}` in the row subtitle.

## Non-goals

- No backend changes. `Decimal` stays the canonical, locale-agnostic wire
  format between frontend and backend.
- No multi-currency support (already ruled out).
- No wiring into the Dashboard screen, which has no implementation yet.

## Testing

- Unit tests for `lib/currency.ts`: `formatBRL` for `0`, `1234.5`, and a
  value large enough to exercise the thousands separator
  (`1234567.89` → `"R$ 1.234.567,89"`); round-trip tests for
  `centsToDecimalString` / `decimalStringToCents`.
- Component tests for `CurrencyInput`: typing a digit sequence produces
  the expected cents-first display and emits the correct canonical
  value on `onChange`; backspace removes the last digit correctly; an
  externally-changed `value` prop resyncs the displayed amount.
- Update `ExpenseRow` tests to expect the formatted (`R$ ...`) amount
  string instead of the raw decimal string.
- Update `ExpenseForm` tests to type digits into the masked input rather
  than setting a plain text value directly.
