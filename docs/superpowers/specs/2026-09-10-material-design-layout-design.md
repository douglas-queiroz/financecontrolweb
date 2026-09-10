# Material-inspired layout redesign

## Context

The current frontend (`ExpensesPage`, `ExpenseForm`, `UnpaidExpensesList`,
`PaidExpensesList`, `ExpenseRow`) is built with raw Tailwind utility classes
and no shared design tokens: default browser form controls, a bold+underline
text tab switcher, flat list rows separated by a bottom border, and bare
`<p>` loading/empty states. This document describes a purely presentational
redesign to give the app a Material Design-inspired look, without adding a
component library.

## Approach

Tailwind-only, Material-inspired styling. No new runtime dependencies
(no MUI/emotion). Add a small design token set to `tailwind.config.js` and
restyle existing components by hand: cards, elevation, spacing, and a
consistent color/typography scale.

Non-goals: dark mode, routing changes, API/data-logic changes. Light theme
only for now.

## Design tokens (`tailwind.config.js`)

Extend `theme.extend` with:

- `colors.primary` — indigo 50–900 shades (Material primary palette)
- `colors.surface` / `colors.surface-variant` — near-white / light gray
  backgrounds for cards and page background
- Semantic colors: `success` (paid), `warning` (due soon), `danger`
  (overdue / destructive actions)
- `boxShadow.elevation-1/2/3` — soft, low-contrast shadows matching
  Material's elevation scale
- Consistent border radius (`rounded-lg` / `rounded-xl`) used for cards,
  buttons, and text fields

Every component should pull colors from these tokens instead of raw
Tailwind colors like `blue-600` / `gray-500`.

## Layout shell

Replace the plain `<header>` with a Material-style top app bar: white
surface, subtle bottom elevation (`shadow-elevation-1`), app title
left-aligned. Page content sits in a centered, max-width container
(`max-w-2xl mx-auto`) with consistent horizontal padding so it doesn't
stretch edge-to-edge on wide screens.

## Add-expense action: FAB

The "+ New" action becomes a circular **floating action button (FAB)**
fixed to the bottom-right of the viewport, per Material Design convention,
instead of an app-bar button. Lists need extra bottom padding so the FAB
doesn't overlap the last row, and the FAB needs a sensible `z-index` above
scrolling content.

## Tabs (Unpaid / Paid)

Replace the bold+underline text buttons with Material-style tabs: a
full-width flex row, each tab a button with a 2px primary-colored bottom
border indicator on the active tab, primary-colored text when active and
gray when inactive, sitting on the surface with a subtle divider below.

## Expense rows → cards

Each `ExpenseRow` becomes a Material-style list item on its own card
surface: white background, `shadow-elevation-1`, rounded corners,
comfortable padding. Description is primary text; amount/due-date is
secondary (muted) text.

Status coloring changes from a full highlighted background + left border
to a small colored dot/chip next to the due date (amber = due soon, red =
overdue) — more Material, less "alert banner."

Actions (Mark Paid / Edit / Delete) move to compact icon buttons (reuse
`public/icons.svg` if it has suitable icons, otherwise simple SVG icon
buttons), aligned right: the primary action as a filled/tonal button, and
destructive delete as a subdued icon that only turns red on hover/focus —
reduces visual noise compared to three colored text links per row.

## Form (`ExpenseForm`)

Restyle as a card container with Material-style text fields: top-aligned
labels, full-width inputs with a bottom border that thickens/colors
primary on focus (outlined Material text-field look), consistent spacing
between fields. The recurring-fields sub-section is visually grouped
(indented or nested card) when the "Recurring" checkbox is on. The submit
button becomes a filled primary Material button; the disabled state uses
reduced opacity and no pointer events.

## Empty & loading states

- Empty state: centered message per list ("No unpaid expenses 🎉" / "No
  paid expenses yet") instead of an empty `<div>`.
- Loading state: a lightweight skeleton-row placeholder (a few
  pulse-animated gray bars) instead of a bare `Loading…` paragraph.

## New shared components

Small new presentational components, likely under
`frontend/src/features/expenses/shared/` (or a new `frontend/src/components/`
if useful beyond this feature): `Tabs`, `Fab`, `Chip`, `SkeletonRow`.
JSX structure/behavior stays the same; only markup/classes and small
wrapper components change.

## Testing

- No new automated visual tests.
- Existing frontend test suite (`npm test`) should keep passing, since
  tests target behavior and `data-testid` attributes rather than classes —
  verify `data-testid` selectors survive the markup changes.
- Manually check the redesign via `npm run dev` (or `docker-compose up`)
  in a browser: golden path (view unpaid/paid tabs, mark paid, reverse
  payment, create/edit/delete an expense) and edge cases (empty lists,
  overdue highlighting, recurring form fields, loading/pagination state
  on the paid list).

## Decisions made during brainstorming

- Tailwind-only, no MUI — avoids ~300kb+ dependency and a second styling
  paradigm.
- Light theme only for now — dark mode can be a follow-up.
- Standard Material palette (indigo/blue primary) — no brand color given.
- FAB (not app-bar button) for the primary add-expense action.
