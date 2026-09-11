# Assets (investment tracking) feature

## Context

The app currently tracks only expenses. This document specs a new
**Assets** feature: a CRUD for investment holdings (REITs, Stocks, Bonds,
Bitcoin) denominated in USD, EUR, or BRL, with buy/sell transaction
history, cost-basis/gain-loss tracking, daily automated price and
FX-rate updates, and a new "total assets per month" chart on the
Dashboard.

Related:
- [[2026-09-11-brl-currency-formatting-design]] — the existing BRL
  `formatCurrency`/`CurrencyInput` utilities are reused wherever this
  feature displays or accepts BRL amounts.
- [[2026-09-10-dashboard-home-screen-design]] — this feature's monthly
  chart is a second chart on that same `DashboardPage`. **That spec has
  not been implemented yet** (no `AppShell`/`DashboardPage`/Recharts code
  exists in the repo as of this writing) — it's a prerequisite for the
  chart portion of this feature, not something this spec builds.

## Decisions made during brainstorming

- **Market coverage:** a mix of Brazilian (B3) and US/international
  assets must be supported, so two separate price providers are needed
  (chosen by an asset's `currency`, not a separate "market" field).
- **Bonds:** no external price lookup (unlike Stocks/REITs) — their value
  is updated manually by the user.
- **Cost basis:** full gain/loss tracking, using a running **average
  cost** per asset (not FIFO lots) — simpler to implement and read,
  standard for buy-and-hold personal portfolios.
- **Daily job scheduling:** an in-process APScheduler job on the existing
  FastAPI backend — no new container/infra.
- **Bitcoin is a currency, not a priced asset** (per the original
  request): adding Bitcoin means entering a quantity; its BRL value comes
  from a daily BTC→BRL rate, not a per-asset "price" lookup like
  Stocks/REITs.

## Data model

New backend module `backend/app/assets/` (`models.py`, `schemas.py`,
`repository.py`, `router.py`), following the same layering as
`app/expenses/`.

### `Asset`

| field | type | notes |
|---|---|---|
| `id` | UUID | primary key |
| `name` | str | user-facing label |
| `category` | enum: `reit`, `stock`, `bond`, `bitcoin` | immutable after creation |
| `code` | str, nullable | required for `reit`/`stock`; null for `bond`/`bitcoin`; immutable after creation |
| `currency` | enum: `USD`, `EUR`, `BRL`, nullable | required for `reit`/`stock`/`bond`; null for `bitcoin`; immutable after creation |
| `quantity` | `Numeric(20, 8)` | running total; 8 decimals to fit Bitcoin's typical precision |
| `average_cost` | `Numeric(12, 2)` | in `currency` for reit/stock/bond; in BRL for bitcoin |
| `average_cost_brl` | `Numeric(12, 2)` | running BRL-equivalent average cost, updated on each buy using that buy date's FX rate; equal to `average_cost` for bitcoin and for BRL-denominated reit/stock/bond |
| `created_at` / `updated_at` | datetime | matches `Expense`'s `_utcnow` pattern |

### `AssetTransaction` (buy/sell ledger)

| field | type | notes |
|---|---|---|
| `id` | UUID | primary key |
| `asset_id` | UUID | FK to `Asset`, cascade delete |
| `type` | enum: `buy`, `sell` | |
| `quantity` | `Numeric(20, 8)` | |
| `unit_price` | `Numeric(12, 2)` | in `currency` for reit/stock/bond; in BRL for bitcoin |
| `total_amount` | `Numeric(12, 2)` | `quantity * unit_price`, stored for audit/display, in `currency`/BRL matching `unit_price` |
| `realized_gain_loss_brl` | `Numeric(12, 2)`, nullable | set on `sell` rows only, **always in BRL** (everything else in the app — list totals, the Dashboard chart — is BRL, so a native-currency gain/loss would be inconsistent): `quantity * (unit_price_brl - average_cost_brl_at_time_of_sale)`, where `unit_price_brl` is `unit_price` converted via that sell date's `FxRateHistory` row for `USD`/`EUR` assets, or used directly for `BRL`-denominated/bitcoin assets. Captured at sell time so later buys don't retroactively change historical realized gains. |
| `date` | date | transaction date |
| `created_at` | datetime | |

### `AssetValueHistory`

| field | type | notes |
|---|---|---|
| `id` | UUID | primary key |
| `asset_id` | UUID | FK to `Asset`, cascade delete |
| `price` | `Numeric(12, 2)` | in the asset's `currency` |
| `date` | date | |
| `source` | enum: `market`, `manual` | `market` = written by the daily job (reit/stock); `manual` = written by a user-triggered bond value update |
| `created_at` | datetime | |

Only used for `reit`/`stock`/`bond`. Bitcoin's value comes entirely from
`FxRateHistory` (below), since it isn't priced per-asset.

### `FxRateHistory`

| field | type | notes |
|---|---|---|
| `id` | UUID | primary key |
| `currency` | enum: `USD`, `EUR`, `BTC` | the "from" side; "to" is always BRL |
| `rate_to_brl` | `Numeric(12, 6)` | extra precision for FX rates |
| `date` | date | |
| `source` | enum: `market`, `manual` | mirrors `AssetValueHistory.source` — see "bridging FX rates before the daily job exists" below |
| `created_at` | datetime | |

One shared table for every "convert to BRL" rate needed by the feature,
populated daily by the price/FX job (Phase 2). Until that job exists
(Phase 1), rows are written on-demand as a byproduct of buy/sell
transactions: a transaction for a non-BRL, non-bitcoin asset may supply
an optional `fx_rate_to_brl`, which is persisted here with
`source=manual` **only if no row already exists for that
`(currency, date)`** (so it never clobbers a real rate the Phase 2 job
already wrote for that day). A Bitcoin buy/sell always writes its
`unit_price` (already BRL) as a `currency=BTC` row the same way, since
that price *is* the BTC→BRL rate at that moment — no separate field
needed for bitcoin.

## Categories, currency, and pricing rules

| category | `code` | `currency` | price source |
|---|---|---|---|
| `stock` / `reit` | required | required (`USD`/`EUR`/`BRL`) | `currency == BRL` → brapi.dev (B3); `currency == USD`/`EUR` → Twelve Data |
| `bond` | none | required (`USD`/`EUR`/`BRL`) | manual only, via `POST /api/assets/{id}/value` |
| `bitcoin` | none | none | BTC→BRL rate via CoinGecko (daily job); no per-asset price |

`category`, `code`, and `currency` are immutable after an asset is
created — changing them would invalidate accumulated price history and
cost basis. If the user needs to fix a mistake, they delete and
recreate the asset.

## Price/FX providers and the daily job

Four independent, single-purpose clients (each swappable later without
touching the others), all called from one daily job:

- **B3-listed Stocks/REITs** (`currency == BRL`): [brapi.dev](https://brapi.dev)
  — Brazilian-market quotes by ticker (covers ações and FIIs). Requires a
  free registered API token (unauthenticated access is limited to a
  handful of demo tickers).
- **US/international Stocks/REITs** (`currency == USD`/`EUR`): Twelve
  Data — free tier (800 req/day, 8 req/min), comfortably covers one call
  per held ticker per day.
- **FX rates** (USD→BRL, EUR→BRL): [Frankfurter](https://frankfurter.dev)
  — free, no API key, ECB-based daily rates.
- **BTC→BRL**: CoinGecko `/simple/price` — free tier with a registered
  Demo API key, returns BTC priced directly in BRL.

### Daily job

New module `backend/app/pricing/` with one function per provider client
plus an orchestrator, registered as an APScheduler background job on
FastAPI startup (`app/main.py`), running once/day (target: 07:00 BRT).
Each run:

1. Collects distinct `(code, currency)` pairs across all `reit`/`stock`
   assets; calls brapi.dev for `BRL` ones, Twelve Data for `USD`/`EUR`
   ones; inserts one `AssetValueHistory(source=market)` row per asset per
   successful fetch.
2. Fetches USD→BRL and EUR→BRL from Frankfurter, BTC→BRL from CoinGecko;
   inserts `FxRateHistory` rows (skipped entirely if there are no
   `bitcoin` assets and no non-BRL reit/stock/bond assets, to avoid
   pointless calls).
3. Each fetch is wrapped in its own try/except and logged on failure —
   one failing ticker or a provider outage does not abort the rest of the
   run. A day with no new price/rate row for a given asset/currency just
   means reads fall back to the most recent known row.
4. Bonds are never touched by this job.

API keys/tokens (brapi.dev token, CoinGecko Demo key) are read from
`Settings` (`app/core/config.py`), following the existing
`pydantic-settings`/`.env` pattern — new fields `brapi_api_token` and
`coingecko_api_key`, no default (required in `.env` for the job to run;
missing keys log a startup warning rather than crashing the app).

## Buy/sell transactions & cost basis

- **Creating an asset creates its first buy transaction atomically** —
  there's no "empty" asset with zero quantity. The create form/endpoint
  takes `name`, `category`, `code` (if reit/stock), `currency` (if
  reit/stock/bond), plus `quantity`/`unit_price`/`date` for the initial
  buy; this produces one `Asset` row and one `AssetTransaction(type=buy)`
  row, with `average_cost = unit_price`.
- **Buy:** `new_avg_cost = (old_qty * old_avg_cost + qty * unit_price) /
  (old_qty + qty)`; `quantity += qty`. `average_cost_brl` updates the
  same way, converting `unit_price` to BRL using the FX rate for that
  buy's `currency` and `date` (or, for bitcoin, using `unit_price`
  directly since it's already in BRL; for BRL-denominated reit/stock/
  bond, no conversion is needed either). Both `AssetCreate` (the initial
  buy) and `AssetTransactionCreate` accept an optional
  `fx_rate_to_brl` — see "bridging FX rates before the daily job exists"
  under `FxRateHistory` above. If none is found on record and none is
  supplied for a non-BRL, non-bitcoin buy, the request is rejected
  (422).
- **Sell:** rejected (422) if `quantity` requested exceeds the asset's
  current `quantity`. `realized_gain_loss_brl` is computed and stored per
  the `AssetTransaction` table above, resolving the sell's FX rate the
  same way a buy does. `quantity -= qty`; `average_cost`/
  `average_cost_brl` are unchanged by a sell (only future buys move
  them).
- Selling to exactly zero leaves the `Asset` row in place (`quantity =
  0`) rather than deleting it, so the transaction history stays intact
  and the user can buy back into it later. No archiving/hiding of
  zero-quantity assets.
- **Unrealized gain/loss** (shown on the asset detail screen) is computed
  on read, not stored: `quantity * (current_value_brl_per_unit -
  average_cost_brl)`, where `current_value_brl_per_unit` comes from the
  latest `AssetValueHistory`/`FxRateHistory` row as described below.

## Computing current and historical BRL value

**Current value** of an asset (used by the list endpoint and the top
total banner):
- `bitcoin`: `quantity * latest FxRateHistory(currency=BTC).rate_to_brl`.
- `reit`/`stock`/`bond` with `currency == BRL`:
  `quantity * latest AssetValueHistory(asset).price`.
- `reit`/`stock`/`bond` with `currency in {USD, EUR}`:
  `quantity * latest AssetValueHistory(asset).price * latest
  FxRateHistory(currency).rate_to_brl`.

If an asset has no `AssetValueHistory`/`FxRateHistory` row yet (e.g. the
daily job hasn't run since the asset was created), its current value
falls back to `quantity * average_cost_brl` (the cost basis) rather than
failing to render.

**Historical monthly totals** (for the Dashboard chart,
`GET /api/assets/monthly-totals`): for each of the trailing 12 calendar
months (mirroring the expenses `/monthly-totals` endpoint's convention),
for each asset, replay its transactions to determine `quantity` as of
that month's last day, then value it using the latest
`AssetValueHistory`/`FxRateHistory` row dated at-or-before that same day
(same formulas as "current value" above, but "latest as of that date"
instead of "latest overall"). Sum across all assets per month. Months
with no price data at all for a given asset (e.g. before this feature
shipped, since historical prices aren't backfilled) contribute `0` for
that asset in that month — a known limitation, not a bug, matching the
existing expenses chart's zero-fill convention for months with no data.

This bucketing is done in Python (not SQL date functions), matching the
existing `ExpenseRepository.fetch_monthly_totals` rationale: keeps logic
portable between SQLite (tests) and Postgres (`docker-compose.yml`) and
easily unit-testable.

## API endpoints

New router `backend/app/assets/router.py`, mounted in `app/main.py`
alongside the expenses router:

- `GET /api/assets` — list; each item includes computed
  `current_value_brl` and `unrealized_gain_loss_brl`. No separate summary
  endpoint — the frontend sums the list client-side for the top total
  banner.
- `POST /api/assets` — create (asset + first buy transaction, per above).
- `PATCH /api/assets/{id}` — edit `name` only.
- `DELETE /api/assets/{id}` — deletes the asset, cascading its
  transactions and value history.
- `GET /api/assets/{id}/transactions` — list an asset's transaction
  history, newest first.
- `POST /api/assets/{id}/transactions` — record a buy or sell (per the
  mechanics above).
- `POST /api/assets/{id}/value` — manual value update; **400 if the
  asset's `category != bond`**. Inserts an `AssetValueHistory
  (source=manual)` row.
- `GET /api/assets/monthly-totals` — trailing-12-month BRL totals, same
  response shape as the expenses endpoint (`[{ "month": "YYYY-MM",
  "total": "..." }, ...]`, always 12 entries).

## Frontend

New feature folder `frontend/src/features/assets/`:

- `AssetsPage.tsx` — a total-in-BRL card at the top (client-side sum of
  the list response, formatted with the existing `formatBRL`), then an
  `AssetRow` list: name, category chip, quantity, BRL value, and
  unrealized gain/loss (colored green for gain, red/danger for loss,
  reusing the `Chip`/tone pattern already used for expense status).
- `AssetForm.tsx` — create form: `name`, `category` select, conditionally
  `code` + `currency` (stock/reit), or just `currency` (bond), or neither
  (bitcoin); plus `quantity`/`unit_price`/`date` for the initial buy.
- `AssetDetailPage.tsx` (`/assets/:id`) — current stats (quantity,
  average cost, current price, current BRL value, unrealized gain/loss),
  the transaction history list, and a Buy/Sell action opening
  `BuySellForm.tsx` (type toggle, quantity, unit_price, date). For bonds,
  an additional "Update value" action opens a small form (price, date)
  instead of relying on the price job.
- The existing BRL-only `CurrencyInput` (from
  [[2026-09-11-brl-currency-formatting-design]]) is reused wherever entry
  is BRL-denominated: bond manual value updates, and bitcoin's
  `unit_price` (always BRL). For USD/EUR `unit_price` entry on
  stock/reit/bond forms, a plain numeric input with a currency-symbol
  label is used instead of extending `CurrencyInput` to be
  multi-currency — smaller surface area, avoids scope creep.
- Navigation: an "Assets" link is added to the `AppShell` top app bar
  (from the dashboard/nav spec) alongside "Dashboard"/"Expenses", once
  that shell exists.

## Dashboard chart

Adds a second chart to `DashboardPage`: `AssetMonthlyTotalsChart.tsx`,
following the same Recharts bar-chart pattern as the expenses
`MonthlyTotalsChart` (`ResponsiveContainer` > `BarChart` with
`CartesianGrid`/`XAxis`/`YAxis`/`Tooltip`/`Bar`, current month
highlighted in the primary color), fed by
`GET /api/assets/monthly-totals`.

**Prerequisite:** `AppShell`, `DashboardPage`, and the `recharts`
dependency don't exist in the repo yet (the dashboard spec hasn't been
implemented). Building that groundwork is a prerequisite for this chart,
not part of this spec — the implementation plan should either build it
first or land this chart as a follow-up once it exists.

## New dependencies

- Backend: `apscheduler` (daily job), `httpx` is already present for the
  provider HTTP calls.
- Frontend: `recharts` — already planned by the dashboard spec, not new
  here.

## Non-goals

- No FIFO lots — average cost only.
- No multi-user/multi-portfolio support.
- No tax-report generation (e.g. Brazilian IR annual declaration) — just
  gain/loss numbers on screen.
- No backfilling historical prices/FX rates from before this feature
  ships.
- No archiving/hiding zero-quantity assets.
- No changing `category`/`code`/`currency` after asset creation (delete
  and recreate instead).
- No multi-currency `CurrencyInput` — USD/EUR entry uses a plain labeled
  numeric input.
- No synchronous ticker validation at creation time — an invalid/typo'd
  `code` isn't rejected up front; it just means the daily job never finds
  a price for that asset, and its value falls back to cost basis (see
  "Computing current and historical BRL value") until corrected (by
  deleting and recreating the asset, since `code` is immutable).

## Suggested implementation phasing

This is a large feature; the implementation plan should likely split it
into phases rather than one atomic change, roughly:

1. **Core CRUD + manual valuation**: `Asset`/`AssetTransaction`/
   `AssetValueHistory`/`FxRateHistory` models, buy/sell/cost-basis
   mechanics, all endpoints except `/monthly-totals`, and the
   `AssetsPage`/`AssetDetailPage`/`AssetForm`/`BuySellForm` frontend —
   fully usable with the cost-basis fallback for "current value" (no
   external price job yet).
2. **Daily price/FX job**: the four provider clients plus the
   APScheduler orchestrator, so `current_value_brl` reflects real market
   prices instead of the cost-basis fallback.
3. **Dashboard chart**: `GET /api/assets/monthly-totals` +
   `AssetMonthlyTotalsChart`, gated on the dashboard/nav shell
   ([[2026-09-10-dashboard-home-screen-design]]) existing.

## Testing

Backend (`backend/tests/`, following existing `test_repository.py` /
`test_router.py` / `test_models.py` patterns):

- Repository: buy math (average cost, average cost BRL conversion),
  sell math (realized gain/loss, rejection when selling more than held),
  current-value computation for each category/currency combination
  (including the no-history-yet fallback to cost basis), and
  monthly-totals bucketing (multi-month spread, zero-fill, boundary
  dates, mirroring the expenses chart's test style).
- Router: full CRUD + transaction + manual-value-update endpoints,
  including the 400 when a manual value update targets a non-bond asset.
- Pricing job: each provider client tested against mocked HTTP responses
  (success and failure cases); the orchestrator test confirms one
  provider/ticker failure doesn't prevent the others from being written.

Frontend (`frontend/src/features/assets/`, following existing list/form
component test patterns):

- `AssetsPage`/`AssetDetailPage`: loading/error/data states, correct
  total banner sum, correct gain/loss coloring.
- `AssetForm`/`BuySellForm`: field visibility per category, validation.
- `AssetMonthlyTotalsChart`: follows the existing `MonthlyTotalsChart`
  test pattern (assert on data passed to the chart, not SVG output).

Manual check via `docker-compose up`: create one asset per category,
record a buy and a sell, trigger the price job manually (e.g. a debug
endpoint or direct function call in a shell), and confirm values/gains
update and the Dashboard chart renders.
