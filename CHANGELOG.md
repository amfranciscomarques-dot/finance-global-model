# Changelog

Record of the code-review passes and correctness fixes for finance-global-model,
newest first. This consolidates the former `CODE_REVIEW.md`, `CODE_REVIEW_PLAN.md`,
the resolved items from the action plan, and the completed tax-drift work.
Forward-looking work (roadmap, open findings, design docs) lives in
[`PLAN.md`](PLAN.md).

**Gate convention.** Unless noted, each batch was verified with `npm test`,
`npx eslint .` (0 errors), and `npm run build` with `ignoreBuildErrors: false`
(so the TypeScript step really runs). Test/lint counts are quoted per batch
because they grew over time.

---

## 2026-06-22 — Tax reconciliation: workstreams A & B complete (engine wiring B1–B4)

Closes the Tax Divergence / Correctness Report. The standalone `src/lib/tax`
module is now **wired into the consolidation engine**, plus the two workstream-A
bug fixes. The design decision held throughout: **reconcile, don't replace** —
stored IRC on actuals stays authoritative (it captures SIFIDE/RFAI/ICE credits
and RAI→lucro-tributável adjustments the EBT-based model can't reproduce), so
**every golden value is unchanged**.

**Workstream A — bug fixes:**

- **A2 — `PT_TAX_CONFIG` year handling + reduced rate (D7).** New `ircRateForYear`
  helper clamps **forward** to the nearest scheduled year ≤ the requested year, so
  a projection past the table (2029/2030) uses the last scheduled rate (2028 → 17%)
  instead of silently dropping to the generic 20% fallback; only years *before* the
  table fall back. The dead SME reduced rate was corrected to the statutory **17%**
  (kept opt-in via `applyReducedRate: false`, since the engine can't classify
  PME/non-PME). `src/lib/finance/tax-drift.test.ts` (C5) pins 2024→21%, 2026→19%,
  2029/2030→17%, pre-table→20%.
- **A3 — `formatCompactEUR` localized (L1).** The compact formatter emitted en-US
  dots (`€52.2M`) next to de-DE commas everywhere else and ignored its `decimals`
  arg in the K band. Now built via `formatNumber` so the mantissa is de-DE
  (`€52,2M`) and `decimals` is honored in both the M and K bands. New
  `src/lib/format.test.ts` (C4) pins the localized strings, sign, and decimal
  overrides.

**Workstream B — engine is now tax-aware:**

- **B1 — `reconcileGroupTax` wired into `computeConsolidation`.** `Entity.countryCode`
  is carried onto `EntityFinancials`; after aggregation the engine builds
  `GroupTaxEntity[]` (per-entity `{ebt, taxExpense}` + `getTaxProvider(countryCode)`)
  and attaches an **informational** `taxReconciliation` block to every result. Net
  income on actuals is untouched. Demo group drift (PT 2024): stored **600,000** vs
  modelled **543,750** → **+56,250**, `comparable: true`.
- **B2 — unmodelled-jurisdiction handling (D4).** When any in-scope entity hits the
  `"<CC> — unmodelled"` 0% provider (DE/FR/UK/IT), the group is reported
  **`comparable: false`** rather than as a 100% over-book — no fabricated tax.
- **B3 — persisted + surfaced in Compliance (D2).** New nullable
  `ConsolidationRun.taxDriftEUR` (+ `taxComparable`) columns (migration
  `20260622010000_consolidation_run_tax_drift`); `runConsolidation` writes the drift
  **only when comparable** (else `null`, so a 0 is never read as "no divergence").
  A 10th compliance check `tax-reconciliation` was added to
  `src/app/api/compliance/route.ts` (per-entity basis, €1,000 tolerance) — this is
  the only check that can see tax drift, since the BS integrity gate structurally
  can't (booked tax and its offsetting payable net to zero).
- **B4 — opt-in forecast override (D6).** New `computeTaxForProjections?: boolean`
  on `ConsolidationInput` (default `false`). When set, forecast/budget periods
  (`scenarioType !== 'base'`) have booked tax replaced by modelled IRC via the new
  `applyModelledTax`, which accrues the incremental tax as a payable
  (`otherCurrentLiabilities`) so the entity sheet still reconciles. **Actuals are
  never touched.**

**Tests (C1 extension + C2).** A `tax reconciliation (B1/B2/B4)` block in
`src/lib/consolidation-engine.test.ts` asserts: B1 attaches the +56,250 drift
without changing net income; B2 flags a synthetic DE entity non-comparable; B4
modelled IRC (543,750 < booked 600,000) lifts net income, collapses the drift to
~0, and keeps `balanceCheck ≈ 0` / `status: completed`; and the override stays off
by default.

Verified: `npx tsc --noEmit` clean · `npm test` = **178 passed / 24 files** (was
152) · `npx eslint` 0 errors on changed files · `npm run build` exit 0.

---

## 2026-06-22 — MEDIUM.1: IAS 21 currency translation + CTA

The headline FX feature. Foreign subsidiaries are now consolidated with the
**current-rate method** and the translation residual is recognised as a
**Cumulative Translation Adjustment (CTA)** in equity, so a foreign sheet still
reconciles after being translated at mixed rates.

- **New pure module `src/lib/finance/translation.ts`** (`translateForeignEntity`).
  Translates income & expenses at the **average** rate, assets & liabilities at
  the **closing** rate, and contributed/pre-existing equity at the **historical**
  rate. The CTA is the residual that balances the sheet (computed by deriving the
  sheet with `cta = 0`, reading the resulting `balanceCheck`, recognising it as
  the CTA, and re-deriving → `balanceCheck ≈ 0`). When the three rates are equal
  it collapses to a uniform scaling with `cta = 0`.
- **`cta` added to `BalanceSheetData`** (`account-maps.ts`) and folded into
  `totalEquity` by `deriveBalanceSheet` (`statements.ts`). It defaults to 0, so
  the all-EUR demo group and every golden test are unaffected.
- **Engine integration** (`consolidation-engine.ts`): `buildEntityFinancials`
  now branches on functional currency. EUR entities keep the original per-line
  EUR path verbatim; non-EUR entities are assembled in functional currency and
  routed through the new `buildForeignEntityFinancials`, which resolves the three
  rates independently (each fails loudly via `FxRateUnavailableError` if missing —
  no single-rate degradation) and translates the whole sheet. Minority interest
  is applied on the translated IS and is equity-neutral, so it leaves the CTA
  intact.
- **Tests (+7):** `src/lib/finance/translation.test.ts` (the README worked
  example, rates-equal, EUR-identity, invalid-rate) and
  `src/lib/fx-translation.engine.test.ts` (a USD Meridian-USA book consolidated
  end-to-end: MUSA translated at three rates, CTA raised, group still reconciles
  → run reported `completed`; EUR entities unchanged).
- **README:** new "Currency translation (IAS 21)" section with the rate table and
  the Meridian-USA worked example (CTA = 35,806.78 → sheet balances).

Verified: `npx tsc --noEmit` clean · `npm test` = **152 passed** (was 145) ·
eslint 0 errors on changed files.

---

## 2026-06-22 — TOP.2 & TOP.4: trustworthy FX + no phantom minority interest

Two cheap correctness rails that make the upcoming IAS 21 FX/CTA work trustworthy.

- **TOP.2 — FX fails loudly instead of silently assuming 1.0.** `getExchangeRate`
  no longer falls back to a static rate table and ultimately `1.0` for an unknown
  currency, and `convertToEUR` no longer returns the amount unconverted on a zero
  rate (`src/lib/finance/fx.ts`). A missing/unknown rate now throws the new typed
  `FxRateUnavailableError` (names the currency + period); an invalid rate throws
  `RangeError`. Returning 1.0 had been silently treating a foreign balance as if
  already in EUR — letting a broken book still appear to reconcile.
  - **Root cause this exposed:** ECB rates are dated period-**end** (`2024-12-31`)
    while periods are passed as month-**start** (`2024-12-01`), so the old
    `rateDate <= periodStart` lookup never matched a same-month rate — the static
    fallback was masking a broken lookup (the USD import test only "passed"
    because the fallback's 1.0820 happened to equal the seeded rate). Fixed by
    resolving rates against the **end of the period month** (`periodCeiling`).
  - **Caller handling.** `/api/consolidation` maps `FxRateUnavailableError` to a
    422 (fixable data gap, names the rate to import) rather than a generic 500;
    `/api/import` already turns the throw into a clear per-row error and skips the
    row instead of importing a phantom 1.0 conversion.
  - **Tests.** New `src/lib/finance/fx.test.ts` (10 cases): `convertToEUR` divides
    correctly and rejects zero/negative/non-finite rates; `getExchangeRate`
    returns EUR=1.0 without a DB hit, finds the seeded closing rate, soft-falls to
    the average rate, and throws for an unknown currency and for a period that
    predates any rate.
- **TOP.4 — proportional consolidation already carries no minority interest.**
  Verified `computeMinorityInterest` returns 0 for the proportional method (only
  the parent's share is consolidated via `applyOwnership`, so deducting a minority
  would double-count). No code change needed; coverage already present in
  `statements.test.ts` (wholly-owned full = 0, partial full = −share, proportional
  regression = 0).

Verified: `npx tsc --noEmit` clean, `npm test` = 145 passed (was 135), eslint 0
errors.

---

## 2026-06-22 — TOP.1: enforce & record the balance-sheet integrity check (#5)

The double-entry invariant is now a domain-level helper and is persisted, not just
computed in passing.

- **`assertBalanced(bs, tolerance)` added to the finance domain**
  (`src/lib/finance/statements.ts`), alongside `DEFAULT_BALANCE_TOLERANCE_EUR`
  (1.0). Pure and non-throwing: returns `{ balanced, imbalance, tolerance }` so
  callers can both gate a run and record the signed break. `consolidation-engine.ts`
  now derives `status` from it (the local tolerance const sources the finance
  default) instead of an inline `Math.abs(...)`.
- **Imbalance persisted.** New nullable `ConsolidationRun.balanceCheck` column
  (migration `20260622000000_consolidation_run_balance_check`); `runConsolidation`
  writes the signed imbalance even on `failed` runs so the break is auditable
  rather than silently lost.
- **Surfaced in the consolidation UI.** The "Balance Sheet Check" card in
  `consolidation-view.tsx` now reads the engine's authoritative `result.balanceCheck`
  instead of recomputing it client-side — the old recompute subtracted
  `minorityEquity` a second time (`totalEquity` already contains it), inventing a
  phantom break, and ignored the gate entirely. The card mirrors the run verdict
  (a `failed` run never reads green) and the consolidation-history timeline now
  shows failed runs with a red marker + "Failed" badge rather than a green check.
  Fixed the `offBy` label unit bug (it claimed `€{amount}K` while being handed a
  raw euro figure) and added a `gateFailed` message in both locales.
- **Tests.** New `assertBalanced` unit tests in `statements.test.ts` (balanced
  pass, signed imbalance on a break, tolerance honouring), plus a negative
  engine test in `consolidation-engine.test.ts`: a deliberately broken trial
  balance yields `status: 'failed'`, a `balanceCheck` ≈ the injected imbalance,
  and a persisted `ConsolidationRun` row recording both. Existing golden tests
  stay green — the demo book still reconciles to the cent and reports `completed`.

## 2026-06-22 — Tax reconciliation (workstream A, partial) + browser smoke

Remediation of the Tax Divergence / Correctness Report (engine stored IRC vs. the
standalone tax module). Findings are cross-referenced as D1–D7, R1, L1; the full
open plan is in [`PLAN.md`](PLAN.md). Done so far:

- **A1 / R1 — compliance route migrated off hand-rolled COA classification.**
  `src/app/api/compliance/route.ts` now calls `buildStatements(...)` for the
  balance-sheet integrity check and uses `categorizeCoaCode(tb.groupCOACode) ===
  'Equity'` for the minority-interest check. The local
  `ASSET_CODES`/`LIABILITY_CODES`/`EQUITY_CODES` arrays and their helpers are gone
  — this also fixes the `EQ-` vs `EQY-` prefix bug. New
  `src/app/api/compliance/route.test.ts` (C3) seeds a balanced entity with
  `EQY-001` and asserts both checks pass.
- **`src/lib/tax/reconcile.ts` foundation shipped.** Pure reconciliation helpers
  (`reconcileEntityTax`, `reconcileGroupTax`, `storedTaxFromIS`), exported from
  `src/lib/tax/index.ts` and fully covered by `src/lib/finance/tax-drift.test.ts`
  (C1): group drift = 56,250 on the demo pack, plus sign-convention, loss-year,
  unmodelled-jurisdiction, and PT edge cases. The D3 sign-convention bridge
  (engine stores tax negative, module positive) lives in `storedTaxFromIS`.

The design decision behind workstream B (*reconcile, don't replace* — stored IRC
on actuals stays authoritative; forecast override is an opt-in flag, default off)
is recorded in [`PLAN.md`](PLAN.md). *(Engine wiring B1–B4 was completed later the
same day — see the top entry of this file.)*

### PLAN P3 — browser smoke of all 18 views

Drove the running app (`next dev --webpack`) through every view not previously
exercised in-browser — Consolidation, IC Transactions, Journal Entry, Scenarios,
Variance, Budget vs Actual, Trend Analysis, Cash Flow Forecast, Projects, FX
Rates, Chart of Accounts, Reports, AI Insights, Compliance, Data Import, Audit
Trail, Workflow, Settings — after loading the Meridian Group pack. Scanned each
for render failures, `NaN`/`Infinity`/`undefined` leakage, error banners, and
console errors.

**Result:** all 18 render real consolidated data with no failed network requests
and no console errors. The engine path checks out visually — Consolidation shows
the per-entity columns, **−€7.50M IC eliminations**, consolidated **€41.5M**
revenue, a **Balanced ✓** check and a 100% quality score, all in `de-DE` grouping.

One defect found and fixed:

- **Cash Flow Forecast rendered the literal "Invalid Date".** `/api/forecast`
  returns a full-year actual anchor as its first period (`month: "2024 (FY)"`),
  but the view's `formatMonth` assumed every value was `YYYY-MM`. The `try/catch`
  was dead code — `new Date("2024 (FY)-01")` yields an *Invalid Date* object
  (which does not throw), and `toLocaleDateString` on it returns the string
  `"Invalid Date"`. Extracted `formatMonth` to
  `src/components/cash-flow-forecast/helpers.ts` with an explicit
  `Number.isNaN(getTime())` guard that passes non-month labels through verbatim,
  locked by a golden test (3 cases). Verified live: the first tick now reads
  **"2024 (FY)"**.

Gates: `npx eslint .` → 0 errors / 24 warnings · `npm test` → 89 passed / 13
files · `npm run build` → 34/34 pages.

---

## 2026-06-21 — Pass 3: residual cleanup

Driven by the (now retired) Pass-3 plan. The plan was first **verified against the
code** — several items were stale or mis-attributed — then the genuinely-open
items were remediated.

**Plan corrections:**

- **P1 (NaN gauge) was already closed.** `computeHealthIndicators`
  (`src/components/dashboard/helpers.ts`) and its regression tests were already
  present and green. The root cause was `0/0` from zero revenue growth (earliest
  period, no prior to compare), **not** zero equity/liabilities as the plan said.
  The `> 0` branch now floors at a finite 30; `helpers.test.ts` asserts
  `Number.isFinite` for zero, negative, and crash-level growth.
- **R2** mis-located the unused `KPIs` — it was in `src/lib/demo-data.ts`, not
  `api.ts`.
- **R4** had its premise inverted — there was no comment on `projects-view`'s
  local `fmtMoney`; the gap was the missing comment.
- **R5** was understated — there was no `prisma/migrations/` directory at all; the
  *entire* schema was `db push`-only, not just `COAMapping`.
- **R6** was overstated — the compliance route is mostly real-data-derived; the
  fabrication was an empty-state fallback plus `Math.random()` in filing statuses
  and the trend.

**Fixed:**

- **R5 — Prisma migrations baselined.** Generated `prisma/migrations/0_init`
  (`migrate diff --from-empty`, including the `COAMapping`
  `@@unique([entityCode, localAccountCode])` + `@@index([groupCOACode])` and
  `migration_lock.toml`), then `migrate resolve --applied 0_init` so existing data
  is untouched (`migrate status` → "up to date"). Added a `db:deploy` script and
  updated the README.
- **R6 — compliance route de-faked.** Removed the `Math.random()` filing-status
  simulation (now deterministic: past-due → `overdue`, else `pending`), removed
  the `Math.random()` synthetic trend (replaced with the single real current-period
  point), deleted the demo-violation fallback (UI already renders a proper empty
  state), and dropped the dead `consolidationRuns` query plus three unused locals.
- **R7 — `entityCodes` JSON hardened.** New validated boundary `parseEntityCodes`
  (`src/lib/entity-codes.ts`, Zod `string[]`, `[]` on any failure) replaces raw
  `JSON.parse` in the `audit` and `reports` routes, so malformed column data
  degrades gracefully instead of 500-ing. Unit tested (4 cases).
- **R8 — route smoke suite.** `src/app/api/smoke.test.ts` exercises the 10 read
  routes added during remediation (`audit`, `coa`, `compliance`, `exchange-rates`,
  `forecast`, `journal-entries`, `notifications`, `projects`, `trial-balances`,
  `workflow`) against a seeded pack and asserts a non-500 JSON response — a
  regression tripwire, not a full contract test.
- **R1 — lint sweep.** Cleared all 61 `no-unused-vars`, the 3
  `react-hooks/exhaustive-deps`, and the 1 `react-hooks/immutability` (refactored
  the variance waterfall to precompute prefix sums so the `map` callback is pure).
  89 → 24 warnings. The 24 `set-state-in-effect` warnings are deliberately
  deferred — runtime-safe React-Compiler-readiness flags whose fixes are genuine
  effect refactors carrying batch regression risk.
- **R2** — removed the unused `KPIs` import in `demo-data.ts`.
- **R3** — documented the `formatMetricValue` scale deviation explicitly (renders
  EUR-K inputs as `€M`; shared `formatCompactEUR` expects full euros) in
  `entities/helpers.ts`.
- **R4** — documented `projects-view`'s local `fmtMoney` as intentionally
  multi-currency, not to be unified with the EUR-only shared formatter.

Gates: `npx eslint .` → 0 errors / 24 warnings · `npm test` → 86 passed / 12 files
· `npm run build` → 34/34.

### PLAN P1/P2 resolutions

- **P1 — NaN health gauge:** closed (see the plan-correction note above).
- **P2 — `npm run dev` Windows footgun:** the default `next dev` (Turbopack)
  panics on Windows compiling `globals.css` through PostCSS (`exit 0xc0000142`,
  `GET /` 500). The `dev` script points at `--webpack` (mirrored in
  `.claude/launch.json` for the Preview MCP); `GET /` returns 200.

---

## 2026-06-21 — Pass 2 follow-ups: F11 component decomposition

The two remaining monolithic views were decomposed following the dashboard
pattern — pure logic moved into a co-located `helpers.ts` with golden tests,
leaving each view as JSX/wiring. Pure structural extraction; no displayed values
changed.

- **`entities-view` decomposed.** New `src/components/entities/helpers.ts` (158
  lines) holds the comparison-metric model, ownership math (`normalizeOwnership`
  deduped a `<= 1 ? *100 : x` pattern repeated ~9×), `buildFinancialRatios`, the
  CSV builder `toEntityCSV`, and presentation maps. 12 test cases. View dropped
  1199 → 1038 lines; two dead locals (`ownershipA`/`ownershipB`) removed.
- **`settings-view` decomposed.** New `src/components/settings/helpers.ts` (133
  lines) holds the demo fallback data plus pure transforms (`buildTableCounts`
  returns `null` when stats are absent so demo counts aren't zeroed, id
  generators, `countActiveRules`/`countHealthyEndpoints`). 7 test cases. View
  dropped 1266 → 1126 lines.

Gates: `npx eslint .` → 0 errors / 85 warnings · `npm test` → 68/68 (10 files) ·
`npm run build` → 34/34.

---

## 2026-06-21 — Pass 2 follow-ups: F3/F4/F5 view sweep

Formatter centralization, locale, and silent-fallback sweep across the remaining
views.

- **F5 — explicit error states everywhere.** New shared `DataLoadError`
  (`src/components/data-load-error.tsx`) banner. Wired a `loadError` flag into
  every view that previously swallowed its fetch error and rendered demo numbers
  silently (`budget-vs-actual`, `journal-entry`, `fx-rates`, `workflow`,
  `variance`, `audit-trail`, `compliance`, `coa`, `ic-transactions`,
  `trend-analysis`, `data-import`, `reports`, `scenarios`, `settings`,
  `cash-flow-forecast`, `entities`). Each `catch` now `console.error`s and flips
  the flag; messages are honest per view.
- **F4 — formatting routed through `src/lib/format.ts`.** Removed per-component
  formatters across `budget-vs-actual`, `journal-entry`, `variance`,
  `consolidation`, `trend-analysis`, and `entities`. `projects-view`'s `fmtMoney`
  kept local (genuinely multi-currency).
- **F3 — locale.** No number-locale work remained; every surviving `en-US`
  `toLocaleString` is a **date** (kept `en-US` to match the English UI chrome).

Gates: `npx eslint .` → 0 errors / 87 warnings · `npm test` → 49/49 ·
`npm run build` → 34/34.

---

## 2026-06-20 — Pass 2: frontend / UI layer

Follow-on pass over the ~15 view components, the client data layer
(`src/lib/api.ts`, `src/lib/store.ts`), the never-opened routes, and the Prisma
schema.

| # | Severity | Finding |
|---|----------|---------|
| F1 | 🟠 High | Dashboard charts & trend badges were hardcoded demo data, not derived from real figures |
| F2 | 🟠 High | Revenue Waterfall labelled the same `/1000` data as "K" (bar) and "M" (axis) — off by 1000× |
| F3 | 🟡 Medium | Number locale split: most views `de-DE`, but Reports & IC Transactions used `en-US` |
| F4 | 🟡 Medium | Number formatting duplicated per-component instead of a shared formatter |
| F5 | 🟡 Medium | 14 views silently rendered fabricated "demo fallback" numbers on a swallowed API error |
| F6 | 🟡 Medium | `middleware.ts` guarded only the wipe set; other mutating routes (+ `ai-chat`) stayed open |
| F7 | 🟢 Low | `@tanstack/react-query` installed but never used |
| F8 | 🟢 Low | `src/lib/api.ts` was `any`-typed and shape-guessed with `data.x || data` |
| F9 | 🟢 Low | Schema hygiene: missing `COAMapping` unique/index, stringly-typed fields, comment drift |
| F10 | 🟢 Low | Stale `|| '51,900'` magic fallback in `data-import-view` |
| F11 | 🟢 Low | Several view components 45–69 KB |

**Remediation (across 2026-06-20):**

- **F1 — dashboard wired to real data.** Revenue Waterfall from the live
  `incomeStatement`; entity-contribution bar/donut from `entityBreakdown` (real
  names, not `PT0001`/`España` placeholders); cash-flow bridge from `cashFlow`;
  Revenue/EBITDA and EBITDA-margin trends from `/api/trends`; KPI-card trend
  badges and the scorecard's revenue-growth + interest-coverage pillars are now
  period-over-period deltas (badges **omitted** when there's no prior data rather
  than faked). Later slices also wired Recent Consolidation Runs
  (`getConsolidationRuns`), Recent Activity (`getAuditTrail`), Entity Health
  Comparison (per-entity from `entityBreakdown`), Market Snapshot (real
  `getExchangeRates`), and KPI sparklines (real `/api/trends`; ROCE omitted, not
  faked).
- **F2 — waterfall magnitude.** Axis and bar labels both route through
  `formatCompactEUR`; card subtitle `(€K)` → `(€)`.
- **F3 — locale.** `reports-view` and `ic-transactions-view` moved to the shared
  `de-DE` helpers.
- **F4 — shared formatting.** New `src/lib/format.ts`
  (`formatNumber`/`formatCurrency`/`formatCompactEUR`/`formatPercent`);
  `utils.formatEUR` re-exports it.
- **F5 — silent fallback.** Dashboard shows an explicit error banner and labels
  placeholders (full sweep finished 2026-06-21, above).
- **F6 — middleware default-deny.** All mutating methods denied with a 2-entry
  allowlist (consolidation, scenario-run); `ai-chat` (cost + data egress),
  entity/coa/budget/fx/journal/eliminate writes, and `seed` gated when
  `ADMIN_TOKEN` is set.
- **F7** — dropped `@tanstack/react-query`.
- **F8 — `api.ts` fully typed.** Removed all 44 `any` in `api.ts` plus 24 across
  components (68 → 0 `no-explicit-any`); typed `unwrap<T>(data, key)` replaces the
  shape-guessing; `getConsolidationRuns` returns a real `ConsolidationRunRecord[]`.
- **F9 — `COAMapping` constraint + atomic upsert.** Added
  `@@unique([entityCode, localAccountCode])` and `@@index([groupCOACode])` (live
  DB had 0 duplicates / 100 rows); POST route's find-then-update/create is now a
  race-free `upsert`. Also fixed the `Entity.code` comment drift.
- **F10** — removed the dead `|| '51,900'` fallback.
- **F11** — dashboard decomposition first slice → `src/components/dashboard/`
  (`helpers.ts`, 332 lines + 13-case golden test); view 1445 → 1141 lines.
  (`entities`/`settings` finished 2026-06-21, above.)

**Phase-0 re-verification** of the Pass-1 fixes against current `main`: no
`new Function` in `src/`, `src/middleware.ts` present, only `package-lock.json`,
`tsconfig` `strict: true`, `npm run build` exit 0 with `ignoreBuildErrors: false`.

---

## 2026-06-20 — Pass 1: backend review & remediation

Full static review of the engine, `src/lib/finance/*`, tax, projects, and the API
routes.

| # | Severity | Area | Finding |
|---|------------|------|---------|
| 1 | 🔴 Critical | Security | `new Function()` evaluates expressions in the Excel export |
| 2 | 🔴 Critical | Security | No authentication / authorization on any API route |
| 3 | 🟠 High | Correctness | Stale prefix-matching code in 6+ API routes produces wrong numbers vs. the engine |
| 4 | 🟠 High | Correctness | `api/scenarios/run` re-implements a broken version of the engine |
| 5 | 🟠 High | Correctness | Excel `eliminations` column is a fake (3% of revenue) — not real IC elimination |
| 6 | 🟡 Medium | Security/Correct. | Routes read `request.url`/`nextUrl` inconsistently; some return 500 on bad input |
| 7 | 🟡 Medium | Security | `z-ai-web-dev-sdk` and external ECB endpoints have no SSRF/secret controls |
| 8 | 🟡 Medium | Quality | Lockfile drift (`bun.lock` + `package-lock.json`); `.env` path documentation |
| 9 | 🟡 Medium | Quality | ESLint effectively disabled (every rule off) |
| 10 | 🟡 Medium | Quality | `import { z } from 'zod/v4'` in `budget/route.ts` inconsistent with every other route |
| 11 | 🟢 Low | DX | `tsconfig` `noImplicitAny: false`; `next.config.ts` `ignoreBuildErrors: true` |
| 12 | 🟢 Low | Quality | In-memory state in `settings`, `ai-chat`, `import` (history) |
| 13 | 🟢 Low | Quality | Dead deps: `pdfkit`, `next-auth` declared but never imported |
| 14 | 🟢 Low | Quality | Prisma `db.cOAMapping` camelCase awkward to grep |
| 15 | 🟢 Low | Quality | Large view components (70 KB `entities-view`, 64 KB `dashboard-view`) |

**Corrections to the original report (after re-verification):**

- **#1 was overstated as a live RCE.** Every `calc` string was a hard-coded
  literal and every key in `values` a hard-coded identifier mapping to a number —
  no user-controlled path. A fragile pattern, not an exploitable RCE. Fixed anyway.
- **#8 ("`.env` checked in") was wrong** — `.env` is gitignored and untracked.
- **#3 (`variance`) was overstated** — the `sign` field was dead, not producing
  wrong Net Income (expenses stored negative).
- **#4 (`scenarios/run`) — detail wrong, severity understated.** The route does
  not discard the second `runConsolidation` (uses it as the adjustment base); the
  real bug was `interestRate`/`fxVolatility` seeded as whole-number percents
  against fraction-assuming formulas (interest ×~50, revenue ×~3.5).

**Fixed:**

- **#1** — `new Function()` replaced with a safe additive token parser (no
  `eval`/`new Function`).
- **#2** — addressed via a right-sized demo-safe `src/middleware.ts`: reads open,
  destructive routes gated by `ADMIN_TOKEN`. Multi-tenant auth intentionally
  deferred for a demo (documented in the README's "Security / auth posture").
- **#3** — `trends` prefix-subset fixed (all `REV-*`, not just `001–003`); `budget`
  `EQ-`→`EQY-`; the route mapping work was completed in Pass 2.
- **#4** — `scenarios/run` rewritten engine-driven: base effective tax rate, no
  magic 25% / ×10 interest / fx double-count. Added a 4-case route test.
- **#5** — fake 3%-of-revenue eliminations removed; exporters now go through a
  compute-only `computeConsolidation` (no audit-row side effect) via
  `src/lib/report-model.ts`, so the Excel/PDF Consolidated column carries real IC
  eliminations (verified by parsing the generated `.xlsx`: Revenue entity-sum
  49.0M − elim 7.5M = 41.5M consolidated, balance check 0, no `ConsolidationRun`
  rows written).
- **#9 / #11** — all TypeScript errors cleared; `noImplicitAny: false` override
  removed (clean under `strict`); `ignoreBuildErrors: false` flipped and verified
  by a real `next build`. ESLint runs a curated rule set at 0 errors.
- **#10** — `zod/v4` → `zod`; swept `error.errors` → `.issues` (Zod v4) repo-wide.
- **#12** — `settings`/`validationRules`, AI-chat sessions, and import history now
  persist to Prisma (`Setting`, `ValidationRule`, `ChatSession`, `ImportBatch`)
  via `src/lib/app-settings.ts` with round-trip tests.
- **#13** — removed `pdfkit`, `next-auth`, and the stray `bun.lock`.

**What was already strong (left as-is):** the consolidation engine and
`src/lib/finance/*` (golden-value tests, clean `addEntry` → derive separation),
the pluggable tax module (`portugal.ts` IRC chain), the projects NPV/IRR/payback
module, and the isolated-DB-per-run Vitest setup (`src/test/setup-db.ts`,
`fileParallelism: false`).

---

*Earlier test gate milestones, for reference: Pass 1 closeout 36/36 → Pass 2
49/49 → 68/68 → Pass 3 86 → 89 passed.*
