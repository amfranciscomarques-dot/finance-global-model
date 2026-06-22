# Plan — finance-global-model

**Backlog only — what's left to build.** Completed work lives in
[`CHANGELOG.md`](CHANGELOG.md); app features & design live in
[`README.md`](README.md).

The entire TOP, MEDIUM and LOW tiers have now shipped and are recorded in the
changelog. The following are **quick wins and follow-ups** from earlier work —
no tier assignment, no fixed ordering.

---

## Quick wins & follow-ups

- ~~**Operations → forecast link (from MEDIUM.11).**~~ Done 2026-06-22. Forecast COGS is now catalog-derived via `loadCatalogMargin`; falls back to historical ratio when no catalog exists.
- **FX deferred polish (from MEDIUM.1).** Per-tranche historical equity rates (v1
  uses acquisition-date or closing); CTA recycling to P&L on disposal (IAS 21 §48,
  out of scope until disposals are modelled); period-weighted average rates when
  monthly FX data lands.
- **Multi-tenancy (follow-up to LOW.5).** A `tenantId` on every table + query
  scoping. Out of scope for the single-tenant model but the natural next step if
  the app serves multiple groups.

---

## Audit backlog (2026-06-22)

Derived from a 4-agent high-effort code audit completed 2026-06-22 (orchestrator:
claude-sonnet-4-6). Coverage: `src/lib/finance/`, `consolidation-engine.ts`,
`src/lib/tax/`, 35 route handlers, `prisma/schema.prisma`. 20 findings total —
4 Critical, 11 Warning, 5 Optimization; 14 kept open, 6 moved to roadmap.

BUG-02 and BUG-03 (Critical) were fixed and verified on 2026-06-22 before this
backlog was written; they are recorded in `CHANGELOG.md` and intentionally omitted here.

### Priority matrix

| ID | Priority | Effort | Risk | Summary |
|----|----------|--------|------|---------|
| BUG-06 | **P1** | Trivial | Med | IC elimination sign wrong → wrong consolidated P&L |
| BUG-04 | **P1** | Trivial | Low | `minCash = Infinity` → JSON null breaks number contract |
| BUG-01 | **P1** | Trivial | Med | `!amountEUR` drops valid zero-amount entries |
| S2-08  | **P1** | Trivial | Low | Simple debt path allows `longTermDebt < 0` |
| BUG-09 | **P1** | Easy   | Low | Malformed `period` → silent all-zero KPIs, no 400 |
| BUG-08 | **P1** | Easy   | Low | `draws=0` → NaN cascade → JSON null in Monte-Carlo |
| BUG-10 | **P1** | Easy   | Low | Unsafe cast → runtime throw before data loads |
| S2-05  | **P1** | Easy   | Low | Credit-note period flips `grossMarginRate` sign → wrong COGS |
| BUG-05 | **P2** | Medium | Med | `applyModelledTax` ignores carryforwards → +70% PT tax overstatement |
| S2-07  | **P2** | Medium | Med | YTD snapshots stack in forecast anchor → N× revenue overstatement |
| S2-01  | **P2** | Medium | High | Concurrent elimination race → `eliminationsApplied=0` under multi-worker |
| BUG-12 | **P3** | Medium | Low | DTA merged into otherNonCurrentAssets (IAS 1 §54(o) presentation) |

**Fix order within P1 (trivial first, then easy):**
BUG-06 → BUG-04 → BUG-01 → S2-08 → BUG-09 → BUG-08 → BUG-10 → S2-05

**Fix order within P2 (highest financial impact first):**
BUG-05 → S2-07 → S2-01

---

### P1 — Fix now (trivial/easy effort, high correctness impact)

- ~~**BUG-06 — IC payable `Math.abs` flips elimination sign** (`src/lib/consolidation-engine.ts:480`).
  `Math.abs(payable.amountEUR)` converts a cost-negative payable to positive; the elimination
  delta then drives the payable more negative instead of netting to zero. Fix: remove `Math.abs`
  and pass the raw signed amount.~~ Done 2026-06-22.

- ~~**BUG-04 — `minCash` Infinity → JSON null** (`src/app/api/forecast/route.ts:332`). `minCash`
  is initialised to `Infinity`; if `forecastPeriods` is empty, `Math.round(Infinity)` serialises
  to `null` in JSON, breaking the `number` contract for `CashFlowForecast.minCashPosition`.
  Fix: initialise `minCash` to `yearEndCash` (or guard with `forecastPeriods.length > 0`).~~ Done 2026-06-22.

- ~~**BUG-01 — `!amountEUR` falsy-check on zero** (`src/lib/consolidation-engine.ts:127`). A
  valid clearing entry with `amountEUR === 0` falls into the `amountLocal` branch and may be
  double-converted if the local amount is non-zero. Fix: replace `!amountEUR` with
  `amountEUR == null` (and `entry.amountLocal != null` on the other arm).~~ Done 2026-06-22.

- ~~**S2-08 — Simple debt path allows `longTermDebt < 0`** (`src/lib/finance/project.ts:201`).
  When `netDebtChange` exceeds outstanding principal, closing debt goes negative (net creditor),
  which is economically incorrect. The sweep path caps repayment at `openingDebt`; the simple
  path does not. Fix: `bs.longTermDebt = Math.max(0, openingDebt + a.netDebtChange)`.~~ Done 2026-06-22.

- ~~**BUG-09 — Missing `period` validation on KPI/variance routes** (`src/app/api/kpis/route.ts`
  and `/api/variance`, `/api/budget`). A malformed `period` (e.g. `2024-13`) produces
  `Invalid Date`; Prisma silently returns zero rows and the response shows all-zero KPIs with
  no error signal. Fix: add `z.string().regex(/^\d{4}-\d{2}$/)` with a 400 for bad input.
  (See also LOW.4 below.)~~ Done 2026-06-22.

- ~~**BUG-08 — `draws=0` → NaN cascade → JSON null** (`src/lib/finance/simulate.ts:120`).
  `percentile([], p)` returns `NaN`; `Math.abs(NaN)` and `Math.max(NaN, 1e-9)` propagate NaN
  through band calculations and serialise to `null`. Fix: add `z.number().int().min(1)` guard
  on `draws` at the API layer and a fast-path in `simulateProjection` for `draws < 1`.~~ Done 2026-06-22.

- ~~**BUG-10 — `consolidation-view.tsx` unsafe double-cast initial state** (`src/components/consolidation-view.tsx:43`).
  `{} as unknown as ConsolidatedResult` bypasses strict null-checking; accessing
  `result.incomeStatement.revenue` before data loads will throw. Fix: use `null` as initial
  state with a proper null-guard in the render path.~~ Done 2026-06-22.

- ~~**S2-05 — All-credit-note period flips `grossMarginRate` sign** (`src/lib/finance/project.ts` /
  `src/app/api/forecast/route.ts`). When `is.revenue < 0` (net credit-note period),
  `grossMarginRate` sign flips and the kernel projects positive COGS (cost sign collapses).
  Fix: guard `grossMarginRate = revenue > 0 ? (revenue + cogs) / revenue : base.grossMarginRate`.~~ Done 2026-06-22.

### P2 — Fix next (medium effort or production-only risk)

- **BUG-05 — `applyModelledTax` ignores NOL/RFAI carryforwards** (`src/lib/consolidation-engine.ts:235–252`).
  `computeTax` is called without `nolOpening`/`rfaiOpening`; multi-year forecasts with
  `computeTaxForProjections: true` overstate Portuguese tax by up to 70% of the NOL-shield.
  Fix: thread `priorCfByEntityId` into `applyModelledTax` and pass prior-year carryforward
  openings, mirroring the reconciliation call at line 597. (TAX-001 protects actuals only;
  this is forecast-only.)

- **S2-07 — Multi-monthly YTD snapshots stack in forecast anchor** (`src/app/api/forecast/route.ts:77`).
  `buildRealAnnualStatements` sums all trial-balance rows in a date range; if the import
  creates one row per month (rather than a single year-end close), every YTD-cumulative balance
  stacks additively, overstating the anchor N×. Fix: enforce a single year-end snapshot per
  entity in the query, or add a defensive comment and import-convention guard.

- **S2-01 — Concurrent elimination race** (`src/lib/consolidation-engine.ts:310–326`).
  Two simultaneous `POST /api/consolidation` calls for the same period can each reset IC
  elimination state, read empty, and complete with `eliminationsApplied=0`. Fix: wrap the
  reset→read→write sequence in `db.$transaction`. (Cannot reproduce under single-process dev
  mode; surfaces under multi-worker `next start`.)

### P3 — Presentation / optimization

- **BUG-12 — DTA not presented as named balance-sheet line** (`src/lib/finance/account-maps.ts:131`).
  `AST-010` maps to `otherNonCurrentAssets`; IAS 1 §54(o) requires a dedicated DTA line.
  `storedDeferredTaxAsset` is captured correctly in the engine but merged at output time.
  Fix: add a `deferredTaxAsset` field to `BalanceSheetData` and a `dtaKey` in
  `BS_DETAIL_ACCOUNTS`. No balance or subtotal changes.

### Roadmap / deferred

- **LOW.3 — Interest `round2` + 10-year projection drift** (`src/lib/finance/project.ts:199`,
  simple interest branch). `interestMag = a.interestRate * openingDebt` is never passed through
  `round2`. Over 120 periods the unrounded accumulation can breach `DEFAULT_BALANCE_TOLERANCE_EUR = 1.0`.
  Deferred: fix when extending the projection horizon beyond 5 years or when the balance-check
  assertion is enabled on projected sheets. (BUG-11 + S2-02.)

- **LOW.4 — Route input validation** (multiple routes). Three patterns are unguarded: (a) POST
  `/api/forecast` silently ignores non-numeric body fields (S2-11); (b) GET `/api/forecast?period=`
  with a non-date string falls back to current year (S2-12); (c) GET `/api/consolidation?limit=`
  with no upper bound allows unbounded DB reads (S2-13). Fix: add a shared `parsePeriodParam`
  helper across affected routes and a `Math.min` clamp on `limit`. Deferred until route-layer
  hardening sprint. (BUG-09 partially overlaps; fix that one now, defer the rest.)

- **BACKLOG-COGS-MARGIN — Forecast anchor without IC elimination** (`src/app/api/forecast/route.ts`,
  `buildRealAnnualStatements`). The forecast anchor sums all entity trial balances without IC
  elimination; `loadCatalogMargin` then derives a gross-margin rate off the inflated revenue
  base, producing systematically incorrect COGS projections when IC is material. Structural fix
  requires anchoring on `computeConsolidation` (already done in `/api/consolidation/projection`).
  Deferred pending the multi-entity forecast milestone. (BUG-07; related to the completed
  Operations → forecast link above.)

### Invariants confirmed intact (2026-06-22)

| Invariant | Status |
|-----------|--------|
| INV-IRC-ACTUALS — Stored IRC authoritative for actuals | Intact. BUG-05 gap is forecast-only (`computeTaxForProjections`). |
| INV-CTA-OCI — CTA in OCI, not P&L | Intact. Stress-confirmed (S2-10). |
| INV-SUBTOTALS-RECOMPUTED — double-derive safe; costs negative | Intact. BUG-03/06 were bugs *against* the convention; convention itself is sound. |
| INV-SINGLE-TENANT — no login; ADMIN_TOKEN gates destructive routes | Intact. Not audited further by design. |
| INV-ALL-EUR-DEMO — demo all-EUR; CTA/FX in tests + README only | Intact. Golden tests pass. |

### Audit coverage gaps

- Compliance view (`compliance-view.tsx`, `/api/compliance`) not audited — treated as read-only in-flight scope.
- Component layer: only `consolidation-view.tsx` swept; other view components not checked for unsafe casts.
- S2-01 concurrent race cannot be reproduced with Vitest; requires manual curl-parallel test against multi-worker `next start`.
- Monte-Carlo output format not validated beyond NaN propagation (BUG-08).
