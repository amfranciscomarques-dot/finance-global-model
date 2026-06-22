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

## 2026-06-22 — Operations → forecast link

Forecast COGS is now catalog-derived (BOM + labor + overhead) instead of a flat
ratio extracted from the opening income statement. When a manufacturing entity's
operational catalog exists, `loadCatalogMargin()` computes `grossMarginPct` from
`buildOperationalStatement` and threads it through the kernel chain and the
Monte-Carlo simulation; if no catalog exists the forecast falls back to the
historical margin ratio unchanged (zero regression).

- **`src/app/api/forecast/route.ts`** — `loadCatalogMargin()` helper queries the
  first operational entity's products/BOM/sales-mix and returns its blended gross
  margin; `kernelAssumptions` accepts `catalogMarginRate` and uses it over
  `base.grossMarginRate`; `buildForecast` threads the parameter through the kernel
  loop and the Monte-Carlo lambda; GET and POST handlers call `loadCatalogMargin`
  before building the forecast.
- **`src/lib/types.ts`** — `ForecastProjection.drivers` gains `grossMarginSource:
  'catalog' | 'historical'` so clients can show the margin's provenance.

---

## 2026-06-22 — Integer-cents / decimal money (LOW.3)

Eliminates float drift in multi-year / Monte-Carlo projection runs by quantizing
each period's driver-computed lines to the nearest cent before they feed the next
period. Design decisions settled: **integer-cents at the projection seams** (not a
full `Decimal` library or `bigint` schema change — Prisma stays `Float`); **half-up
away from zero** per derived line; rates and the cash plug left unrounded.

- **`src/lib/finance/money.ts`** (new) — canonical `round2(n)`: half-up-away-from-zero
  rounding to 2 decimal places (the financial standard: 0.5 rounds away from zero,
  not toward +∞). Exported from the domain index.
- **`src/lib/finance/project.ts`** — `projectPeriod` wraps the 8 driver-computed
  values (revenue, COGS, OPEX, depreciation, accounts-receivable, inventory,
  accounts-payable, PPE) in `round2`. The cash plug, interest, taxExpense, and
  netIncome are intentionally left unrounded: anything that flows through
  `cf.netChangeInCash` must remain algebraically exact to keep `balanceCheck = 0`
  and the debt-sweep `cash ≈ buffer` invariant intact.
- **`src/lib/finance/eliminations.ts`** — replaced the local inline `round2` with
  the shared import from `money.ts`.

277 tests pass. The LOW tier is complete.

---

## 2026-06-22 — Single-tenant auth & role-based authorization (LOW.5)

Real credential login and role-based authorization, layered over the original
demo-safe middleware guard. The model stays **single-tenant** (one shared dataset);
roles decide who may change it. Built on the **Web Crypto API** — no new runtime
dependency, no native bindings, edge-compatible — chosen over Auth.js so the same
hashing/signing code runs in both the edge middleware and Node route handlers and
the strict `test`+`eslint`+`build` gate stays safe on Next 16 / React 19 / Windows.

- **Auth core (`src/lib/auth/*`), all edge-safe where it must be.**
  - `password.ts` — **PBKDF2-SHA256** hashing (100k iters), self-describing format
    `pbkdf2$<iters>$<salt_b64>$<hash_b64>`, constant-time compare.
  - `session.ts` — **stateless HMAC-signed** session token
    (`base64url(payload).base64url(HMAC)`), 8 h TTL, tamper/expiry/wrong-secret
    rejection. `AUTH_SECRET` is required in production; a dev fallback keeps local
    use config-free.
  - `policy.ts` — role→capability map (pure, no I/O): `viewer` (read-only),
    `preparer` (+ run/import/edit), `approver` (+ any `DELETE`, + re-seed/reset via
    `POST /api/packs`).
  - `users.ts` — Prisma-backed `authenticate` + idempotent `ensureAuthUsers`
    (seeds one demo user per role; called from the company-pack seeder).
- **Middleware (`src/middleware.ts`) extended, not replaced.** Activates when
  `AUTH_SECRET` *or* `ADMIN_TOKEN` is set (else fully open locally). Reads pass; the
  auth-bootstrap and compute-only POSTs (`/api/auth/login|logout`,
  `/api/consolidation`, `/api/scenarios/run`) stay open; every other mutation needs a
  session whose role permits it (`401` if anonymous, `403` if under-privileged), or
  the legacy `ADMIN_TOKEN` escape hatch for full access.
- **Routes:** `POST /api/auth/login` (sets httpOnly cookie; no user enumeration on
  failure), `POST /api/auth/logout`, `GET /api/auth/me`.
- **UI:** a standalone `/login` page (form + clickable demo accounts, full EN + PT
  i18n) and a header `AuthStatus` indicator (role badge + logout / "Sign in").
- **Schema:** new `User` model + migration `20260622030000_user_auth` (the dev
  `custom.db` predates clean migration history, so the table was applied with
  `prisma db execute`; fresh clones get it via `npm run db:deploy`).
- **Verification:** 277 tests pass (was 251 — +26 across `auth.test.ts`,
  `middleware.test.ts`, `login/route.test.ts`); `tsc --noEmit` clean; `eslint` 0
  errors; `npm run build` ✓. Verified live: `/login` renders (PT), approver login →
  httpOnly session (not JS-readable) → header shows "Aprovador" → logout reverts to
  "Entrar"; no console errors.

---

## 2026-06-22 — Per-jurisdiction tax view in Compliance (LOW.4)

Surfaces the per-entity tax reconciliation — already computed for the
`tax-reconciliation` compliance check — as a **per-jurisdiction breakdown** in the
Compliance UI, and with it the NOL/RFAI carryforwards and PT statutory caps that
were previously visible only in the engine/tests (closing the MEDIUM.8 "surface the
carryforwards" quick win). Purely additive and read-only: no new computation, no
schema change, every golden value untouched.

- **`taxByJurisdiction` on `GET /api/compliance`.** Reuses the existing
  `reconcileGroupTax` result (same rows, same tolerance as check #10), grouping the
  per-entity `TaxReconciliation` by `countryCode`. Each jurisdiction carries the
  summed booked vs. modelled IRC, the headline statutory rate, a `comparable` flag,
  `withinTolerance`, the per-entity rows (taxable income, booked/modelled tax, drift,
  NOL c/f, RFAI c/f) and a one-line statutory note (the PT art.º 52.º CIRC NOL cap /
  art.º 23.º CFI RFAI cap; flat-rate note for ES/US; "not modelled" otherwise).
  Sorted by descending |drift|. Entities with no trial-balance data contribute no
  row, so the empty `MESP` (ES) book correctly produces no ES card.
- **New `TaxJurisdiction` / `TaxJurisdictionEntity` types** (`src/lib/types.ts`),
  added to `ComplianceData` in `api.ts`.
- **"Per-Jurisdiction Tax" section in `compliance-view.tsx`.** One card per
  jurisdiction (flag, country, statutory rate, reconciled/drift/not-modelled badge),
  a booked/modelled/drift summary, the per-entity table, and the statutory note.
  Money/percent via the shared `de-DE` formatters; full EN + PT i18n; demo-fallback
  data added. Verified live in both locales (no console errors): the demo group
  renders **US (MUSA) drift €131.701** and **PT €56.250** (MERID €500k→€465k, MSUB
  €100k→€78,75k), the per-jurisdiction drifts summing to the €187.951 the
  `tax-reconciliation` check reports.
- **Tests (251 pass, was 249).** Two cases in `compliance/route.test.ts`: the
  jurisdictions group with internally-consistent sums and numeric NOL/RFAI
  carryforwards on every entity (PT/US present, empty ES absent); and the
  per-jurisdiction drift reconciles to the authoritative `tax-reconciliation` check
  with the PT statutory note surfaced. `npx tsc --noEmit` clean, eslint 0 errors.

## 2026-06-22 — Remove N+1 / per-row `await` in the engine (LOW.2)

Collapses the per-row database round trips in the consolidation engine and the IC
elimination loops into batched / pre-fetched / concurrent queries. Pure performance —
no behaviour change: all 249 tests (including the IC idempotency, TOP.3 dedup and
MEDIUM.3 receivable-elimination golden cases) stay green, proving the in-memory
matching reproduces the old live-query semantics exactly.

- **Per-entity build runs concurrently.** `computeConsolidation` built each entity's
  statements one `await` at a time; the builds are independent reads, so they now run
  under `Promise.all` (order preserved, so the tax / carryforward index alignment is
  unchanged).
- **IC transaction marking in one write.** The matched IC transactions were flipped to
  `isEliminated` with an update per row; now a single `updateMany` over their ids.
- **In-memory counterparty matching (the real N+1).** `runICEliminations` issued a
  `findFirst` per IC trial-balance row to locate its partner leg, then two updates per
  match. The partner leg is itself in the already-fetched pending set, so it is now
  indexed by `(entityId|groupCOACode)` and matched in memory — with a local status map
  mirroring the original live `eliminationStatus: 'pending'` filter (a leg consumed as
  a match is no longer eligible). Row writes are accumulated once per row and flushed
  concurrently.
- **IC balance pairing pre-fetched.** The AST-009 receivable ↔ LIA-006 payable pass did
  a `findFirst` payable per receivable; both legs are now pulled in two queries and
  paired through a map, with the eliminations written concurrently.
- **Carryforward upserts concurrent.** `runConsolidation` upserted each entity's closing
  pool sequentially; the keys are distinct, so they now upsert under `Promise.all`.

## 2026-06-22 — Monte-Carlo simulation through the kernel & real forecast bands (LOW.1, LOW.6)

Fans the MEDIUM.10 projection kernel out for in-memory Monte-Carlo and replaces the
forecast's hardcoded uncertainty fan with bands derived from the model's own driver
dispersion. Pure and additive — no schema change, no new persistence; the demo's
golden consolidation/projection numbers are untouched (the simulation is a separate,
read-only path).

- **Pure simulation kernel (`src/lib/finance/simulate.ts`, LOW.1).**
  `simulateProjection(opening, periods, baseAssumptionsFor, distributions, metrics,
  options)` chains `projectPeriod` over `draws` paths with **no DB and no I/O**,
  perturbing each period's drivers around its base and reducing the per-period metric
  distributions to percentile bands. A seeded mulberry32 PRNG makes the bands
  reproducible (the tests pin exact percentiles). Ships `DriverNoise`/
  `DriverDistributions` (absolute + relative sigma with optional clamps), a linear-
  interpolated `percentile` (R-7), `CASH_FLOW_METRICS`, and a
  `DEFAULT_FORECAST_DISPERSION` driver set. 10 new tests
  (`simulate.test.ts`): ordered bands, reproducibility, dispersion-widens-the-band,
  collapse-to-deterministic at zero dispersion, and bounded-driver clamping.
- **Consolidated fan-out (`simulateConsolidation`, LOW.1).** Anchors **once** on the
  IC-eliminated, FX-translated closing state from `computeConsolidation`, then draws
  entirely in memory — no per-iteration DB round trips and no `ConsolidationRun`
  persistence. Returns the deterministic base path alongside the simulated bands.
- **Real forecast uncertainty bands (`/api/forecast`, LOW.6).** Replaces the hardcoded
  ±5/8/3%-per-month fan and the flat ±5pp scenario re-run with the year+1 percentile
  dispersion read off the simulation. The monthly cash-flow fan now widens by the
  simulated relative dispersion (ramped over the horizon, sign-safe so High ≥ base ≥
  Low for negative components), and the optimistic/base/pessimistic comparison reports
  the P95/P50/P5 of the driver dispersion. Fixed seed → stable GET response.

## 2026-06-22 — Carryforward persistence & live transfer pricing (MEDIUM.8b, legs 2–3)

Completes **MEDIUM.8b**: the two remaining legs both needed a schema migration, so
they ship together. The deferred tax surfaced in leg 1 now goes **dynamic** across a
multi-year run, and the shipped unrealized-profit elimination now fires on real
intercompany goods sales. The demo's golden actuals are unchanged — the new
behaviour is opt-in on data the demo book does not carry (no 2023 pools, no goods IC).

- **Schema (additive, `db push` + a migration file).** New `TaxCarryforward` model
  (per `entity`/`year`/`scenario`, holding `nolClosing`/`rfaiClosing`) and two
  nullable columns on `IntercompanyTransaction` — `markup` and
  `closingInventoryFraction` — carrying per-sale transfer-pricing metadata.
- **Carryforward persistence.** `computeConsolidation` reads each entity's prior-year
  closing pools and feeds them back as this year's `nolOpening`/`rfaiOpening`, and
  now passes the raw EBT as the taxable base so a **loss year actually feeds the NOL
  pool** (for a profitable entity this equals `max(0, EBT)`, so the modelled tax and
  the B1 drift are unchanged). It exposes the per-entity closings as
  `result.taxCarryforwards`; `runConsolidation` upserts them. The IAS 12 deferred tax
  from leg 1 therefore goes dynamic: a carried loss surfaces as a DTA (pool × rate)
  in the following year with no further wiring.
- **Transfer pricing → live eliminations.** `runICEliminations` now builds priced
  `ICSaleFlow`s for **goods** IC transactions (`sale`/`purchase`), sizing the
  unrealized inventory profit from the per-sale `markup`/`closingInventoryFraction`
  (falling back to a group default `TransferPricingPolicy`) so the
  `unrealized_inventory_profit` entry fires on real data. Services are excluded (no
  inventory). `totalElimination` is a reporting figure only — the statements are
  adjusted solely via the (internally balanced) elimination entries — so the
  inventory overlay cannot double-net revenue.
- **Seed reset.** `seedCompanyPack({ reset })` now clears `TaxCarryforward` before
  deleting entities (the model is `onDelete: RESTRICT` and every run now persists a
  row per entity/year).
- **Tests (239 pass, was 236).** A two-year run proves a 2024 loss persists a
  500,000 NOL pool that feeds 2025's opening and surfaces as a 100,000 DTA
  (500,000 × 20%); a priced IC goods sale fires a 100,000 unrealized-profit
  elimination that lowers consolidated inventory and net income while the sheet stays
  balanced; and the service-only demo never triggers it.

## 2026-06-22 — Deferred tax surfaced on the consolidation run (MEDIUM.8b, leg 1)

Wires the IAS 12 deferred-tax module (shipped pure in MEDIUM.8) into the persisted
consolidation run as an **additive** layer — it never mutates booked actuals, the
same stance as the B1/B4 tax reconciliation, so every golden value is unchanged.

- **`computeConsolidation` now surfaces `result.deferredTax`.** For each entity it
  bridges the carryforwards already produced by the tax reconciliation
  (`nolClosing` → DTA at the statutory rate; `rfaiClosing` → DTA at face value),
  measured at the new `TaxReconciliation.baseRate`, taking the booked **AST-010** as
  the opening balance so the period movement is exactly the true-up onto the
  modelled basis. The block carries `{ perEntity, group, storedDTA, computedDTA,
  drift, comparable }` — a deferred-tax reconciliation parallel to the tax-drift one.
- **Booked AST-010 is now captured.** AST-010 rolls into `otherNonCurrentAssets` on
  the sheet, so the engine sums it separately (per entity, translated at the closing
  rate for foreign books) to reconcile the booked DTA against the computed position.
- **`aggregateDeferredTax` (`src/lib/tax/deferred-tax.ts`).** Gross-sums DTA and DTL
  across entities (a net asset in one entity does not offset a net liability in
  another), re-derives the net, and sums the per-entity period movements.
- **Honest scope.** A single-period *actual* run generates no carryforwards yet (that
  needs opening pools fed back per year — the *carryforward persistence* leg below),
  so the computed DTA is 0 and `drift` simply exposes the unsubstantiated booked
  AST-010. The computation goes dynamic automatically once openings are fed; the
  carryforward-driven cases are proven in `deferred-tax.test.ts`.
- **Tests (236 pass, was 231).** `aggregateDeferredTax` group math (3); engine
  surfacing — the demo carries a comparable 0/0/0 block without touching net income,
  and a booked AST-010 shows as drift against the modelled DTA while the sheet stays
  balanced (2).

Still open in MEDIUM.8b: transfer pricing → live eliminations (gated on per-sale IC
schema fields) and carryforward persistence (per-entity/year `nolClosing`/
`rfaiClosing` fed back as next year's openings). Both need a schema migration.

## 2026-06-22 — Tax depth & cross-border rules (MEDIUM.8)

Adds the four pieces of tax/cross-border depth. The loss-year and capped-credit
behaviour that previously vanished via `Math.max(0, …)` now carries forward; a
new deferred-tax model derives AST-010 from first principles; and a transfer-
pricing policy lets the shipped unrealized-profit elimination fire on live flows.
All four are pure, fully-tested additions to `@/lib/tax` and `@/lib/finance`.

- **NOL carryforward (`src/lib/tax`).** `TaxInput.nolOpening` and
  `TaxResult.nolUsed`/`nolClosing` thread a loss pool through the providers: a loss
  year adds to the pool instead of disappearing, a profit year consumes it before
  assessment. Portugal applies the statutory **70% cap** on the deduction
  (art.º 52.º CIRC, configurable via `nolDeductionCapPct`) and correctly splits the
  base — IRC coleta on the post-NOL *matéria coletável* while the derramas stay on
  the pre-NOL *lucro tributável*; the flat-rate stubs offset in full. Backward
  compatible: with no pool the two bases coincide, so every existing golden value is
  unchanged.
- **RFAI credit carryforward (`src/lib/tax`).** `TaxInput.rfaiOpening` and
  `TaxResult.rfaiUsed`/`rfaiClosing`. RFAI is capped at 50% of the coleta each year
  (`rfaiLimitPctColeta`); the excess the cap or the available coleta cannot absorb
  is **no longer silently lost** — it carries forward (art.º 23.º CFI). The
  flat-rate stubs carry forward any credit the gross tax cannot absorb too. Both
  pools are surfaced on `TaxReconciliation` so multi-year reconciliation can chain
  them as the next year's opening.
- **Deferred tax — IAS 12 (`src/lib/tax/deferred-tax.ts`).** `computeDeferredTax`
  turns book-vs-tax temporary differences (asset/liability aware) into a DTA/DTL,
  measured at the enacted rate, and computes the period's deferred-tax expense as
  the movement in the net DTA. A tax-loss carryforward is a DTA at the rate; an
  unused tax-credit carryforward is a DTA at face value. `deferredTaxFromTaxResult`
  bridges directly from a provider's `nolClosing`/`rfaiClosing` to the AST-010
  balance, so the loss/credit relief is recognised the year it arises.
- **Transfer pricing (`src/lib/finance/transfer-pricing.ts`).** A
  `TransferPricingPolicy` holds a directional cost-plus markup per IC relationship
  (OECD / art.º 63.º CIRC). `priceFromCost`/`marginFromMarkup` price the sale and
  derive the embedded margin (a 30% markup on cost = a 30/130 margin on price), and
  `applyTransferPricing` populates a live `ICSaleFlow`'s `margin` (and ending-
  inventory fraction) from the policy — so the `unrealized_inventory_profit`
  elimination shipped with MEDIUM.4 fires on policy-driven flows, not only in
  hand-built tests. Observed values on a flow are never overwritten.
- **Tests.** New `nol.test.ts` (7), `rfai.test.ts` (7), `deferred-tax.test.ts` (12)
  and `transfer-pricing.test.ts` (12), including the PLAN.md cross-border stress
  scenario (PT Year-1 loss → Year-2 smaller profit + capped RFAI: loss partially
  consumed, RFAI excess carried forward, NOL/DTA tracked). **231 tests pass; `npx
  tsc --noEmit` clean.**
- **Not yet wired (follow-up in PLAN.md).** The deferred-tax balance and the
  transfer-pricing margins are additive/pure today (like `reconcile.ts`); feeding
  them into the persisted consolidation run needs IC-schema fields (per-sale cost,
  margin, closing-inventory fraction) and is tracked as a PLAN follow-up.

## 2026-06-22 — Minority interest on the balance sheet (MEDIUM.6)

Fixes how non-controlling interest (NCI) is stated when a subsidiary is less than
wholly owned. Closes PLAN.md MEDIUM.6.

- **`reclassifyMinorityEquity` in `src/lib/finance/statements.ts`.** A pure,
  one-shot reclassification that derives NCI from **ownership × the subsidiary's
  full equity** (share capital + historical reserves + CTA), rather than trusting a
  stored `EQY-003`. It scales the parent-attributable equity lines down to the owned
  fraction and books the remainder as the minority's historical equity. Paired with
  the existing `computeMinorityInterest` (which carves out the current year's NCI
  share of net income), the consolidated minority equity comes to exactly
  `(1 − ownership) × subsidiary total equity`. The function is **equity-total
  neutral** — it moves value between equity components without changing the total —
  so the balance check is preserved and the CTA raised on a translated foreign sheet
  is split proportionally rather than disturbed.
- **Equity data-model split.** `BalanceSheetData` now separates *opening* stored
  balances (`historicalRetainedEarnings`, `historicalMinorityEquity`) from the
  *derived* closing figures (`retainedEarnings`, `minorityEquity`).
  `deriveBalanceSheet` recomputes the closing figures from the opening lines plus
  net income and the NCI carve-out, so re-deriving (e.g. after a modelled-tax
  override) stays consistent.
- **Engine wiring.** `reclassifyMinorityEquity` is called once per subsidiary in
  both `buildEntityFinancials` (EUR) and `buildForeignEntityFinancials` (foreign),
  before `deriveBalanceSheet`. A no-op for wholly-owned and non-`full` entities, so
  every demo golden value — all entities are 100% owned — is unchanged.
- **Tests.** A consolidation-engine golden test adds an 80%-owned subsidiary with no
  stored `EQY-003` and asserts the IS carves out 20% of its net income while the
  consolidated sheet books minority equity of `(1 − 0.8) × total equity` and still
  reconciles. **201 tests pass.**

## 2026-06-22 — Debt schedule + cash sweep (MEDIUM.9)

Removes the projection kernel's last big financing simplification. Closes
PLAN.md MEDIUM.9.

- **`solveDebtSchedule` in `src/lib/finance/debt.ts`.** A pure fixed-point solver
  for a revolving cash sweep: interest is charged on the **average** of the
  opening and closing balance, surplus cash above a `minCashBuffer` sweeps to
  principal, and the resulting lower balance feeds back into interest. Iterates to
  a tolerance on Δinterest (cap 20 passes); the caller supplies
  `cashForDebtService(interest)` so the solver also resolves the tax-shield
  circularity (cash that itself depends on the interest charge). Handles no-debt,
  buffer-limited, mandatory-amortization and sweep-capped cases.
- **Opt-in kernel integration.** `ProjectionAssumptions.debtSweep` switches
  `projectPeriod` from "interest on opening debt + `netDebtChange` as input" to the
  swept schedule (interest on average, endogenous repayment, `debtSweep` overrides
  `netDebtChange`). Cash remains the plug, so the sheet still balances by
  construction. Omitting `debtSweep` keeps the exact prior behaviour — every
  existing kernel golden value is unchanged.
- **Tests.** `src/lib/finance/debt.test.ts` (6) covering the solver cases incl.
  the cash↔interest fixed point; `project.test.ts` gains 3 — a swept period leaves
  cash at the buffer with interest on the average balance and a balanced sheet,
  the sweep overrides `netDebtChange`, and the no-sweep path matches the simple
  formula exactly. **200 tests pass.**

## 2026-06-22 — Multi-period consolidated roll-forward (MEDIUM.7)

Produces a multi-period **consolidated** balance sheet by chaining the projection
kernel off the consolidated closing state. Closes PLAN.md MEDIUM.7.

- **`projectConsolidation(input)` in the consolidation engine.** Anchors on the
  consolidated (IC-eliminated, FX-translated) result of `computeConsolidation`,
  then chains `projectMultiPeriod` forward `years` periods with per-period
  steady-state drivers plus optional overrides. Each period's opening retained
  earnings links to the prior period's closing (closing → next opening, via the
  kernel), and every projected sheet balances by construction. Unlike
  `/api/forecast` — which projects a raw sum of trial balances and so double-counts
  IC and mis-states FX — this inherits the eliminations and translation.
- **Read-only endpoint `GET /api/consolidation/projection`.** `period`,
  `entities`, `scenarioType`, `years` (1–10), optional `revenueGrowthRate`
  override; returns the consolidated base plus one balanced IS/BS/CF per projected
  year. Persists nothing.
- **Tests.** A consolidation-engine golden test rolls the demo group forward 3
  years, asserting every period balances, revenue compounds at the override rate,
  and the **opening RE = prior closing RE − dividends** linkage holds; the new
  route is covered by the API smoke suite. The kernel's `projectMultiPeriod` was
  already unit-tested for the chained roll-forward. **191 tests pass.**

## 2026-06-22 — Intercompany elimination family (MEDIUM.3 / .4 / .5)

Reworks consolidation eliminations into an explicit, auditable, single-source
pass. Closes PLAN.md MEDIUM.3 (balance-sheet IC elimination), MEDIUM.5
(elimination journal entries), and the calculation half of MEDIUM.4 (unrealized
intra-group inventory profit). All prior golden values are unchanged.

- **First-class IC balance lines.** `AST-009` (IC receivable) and `LIA-006` (IC
  payable) are now their own `BalanceSheetData` fields (`icReceivable` /
  `icPayable`) instead of being folded into "other current assets/liabilities".
  They roll into `currentAssets`/`currentLiabilities` so gross totals are
  identical, but the IC portion is now visible and eliminable. Added to the IAS 21
  `BS_MONETARY_KEYS` (closing rate) and carried forward in the projection kernel.
- **Pure elimination module — `src/lib/finance/eliminations.ts`.** Turns
  intercompany flows (`ICSaleFlow`) into explicit `EliminationEntry` journals
  keyed on `(period, counterpartyPair, account)`:
  - **ic_sale** — de-grosses internal revenue and COGS by the transfer price
    (net-zero on EBITDA).
  - **unrealized_inventory_profit** — removes the seller's margin locked in the
    buyer's unsold stock (Dr COGS / Cr Inventory), lowering group inventory and
    net income.
  - **ic_balance** — nets the IC receivable against the matching payable; for a
    cross-border pair the FX difference between the two legs is routed to the CTA
    so the sheet stays balanced (a pragmatic IAS 21 §45 simplification).
  `applyEliminations` mutates the aggregated statements and re-derives every
  subtotal; each entry is internally balanced, so the balance check is preserved.
- **Engine now consumes the module (single source).** `runICEliminations` builds
  `ICSaleFlow[]` from the IC-transaction and IC-trial-balance paths (preserving
  the TOP.3 `(pair, amount)` de-dup) and a new cross-code **AST-009 ↔ LIA-006**
  balance-sheet pass, then `computeConsolidation` applies them via
  `applyEliminations`. The signed P&L volume (`eliminationsApplied`) and dedup
  count are unchanged; the structured `eliminationEntries` are exposed on the
  result for audit.
- **Tests.** `src/lib/finance/eliminations.test.ts` (10) including the PLAN
  cross-border **MERID (PT) → MUSA (US)** stress test (30% markup, half on-sold,
  FX-mismatched IC legs) exercising all three eliminations at once; a new
  consolidation-engine golden test seeds a matched IC receivable/payable and
  asserts both net to zero on a still-balanced sheet. **189 tests pass** (was 178).
- **Deferred (folds into MEDIUM.8).** The unrealized-profit elimination math is
  shipped and tested, but populating each sale's margin and ending-inventory
  fraction from a `TransferPricingPolicy` (rather than passing them in) lands with
  the MEDIUM.8 transfer-pricing work; the demo book's only IC flows are services
  with no inventory component, so live numbers are unaffected today.

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
