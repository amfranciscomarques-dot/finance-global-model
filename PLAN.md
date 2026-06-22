# Plan & Roadmap — finance-global-model

Forward-looking work for the multi-entity consolidation model. Completed
remediation history is in [`CHANGELOG.md`](CHANGELOG.md).

Phases are ordered by **dependency and risk**, not just value: integrity guard
rails first, then the structural FX/IC corrections they protect, then forecasting
and simulation. Severity tags (`#1`–`#8`) reference the
[Architecture review findings](#appendix--architecture--logic-review) at the
bottom of this file.

> **Status (2026-06-22).** The three review passes are fully remediated (see
> [`CHANGELOG.md`](CHANGELOG.md)). Active work is the **tax reconciliation**
> stream below (workstream A partially shipped; B awaiting a go/no-go). The
> roadmap below is the longer arc; the model is today a *consolidation reporting*
> engine, not yet a *forecasting* engine, and several phases close exactly that
> gap.

Legend: `[ ]` planned · `[~]` in progress · `[x]` done

---

## Roadmap

### Phase 0 — Integrity guard rails (do first, small & high-confidence)

Cheap, covered by the existing Vitest golden tests, and they protect every later
phase.

- [ ] **Enforce `balanceCheck`.** Add `assertBalanced(bs, tolerance)`; have
  `runConsolidation` set `status: 'failed'` and record the imbalance instead of
  always saving `completed`. *(#5)*
- [ ] **Fix proportional-method minority interest.** Proportional consolidation
  already scales by ownership, so MI should be 0; remove the phantom charge in
  `statements.ts:85`. *(#7)*
- [ ] **De-duplicate IC elimination sources.** Make the `intercompanyTransaction`
  path and the `trialBalance.isIntercompany` path mutually exclusive (shared key)
  so internal sales aren't netted twice. *(#2)*
- [ ] **Stop silent FX fallbacks.** `getExchangeRate` should not return `1.0` for
  an unknown currency, and `convertToEUR` should not return the unconverted amount
  on `rate === 0` — quarantine or throw. *(#8)*

### Phase 1 — Single source of truth (finish the refactor)

- [x] `src/lib/finance` domain module (account maps, statements, FX, KPIs).
- [x] Repoint `kpis` route and `consolidation-engine` onto `finance`.
- [x] Repoint `export/excel`, `export/pdf`, `variance`, `trends`, `scenarios/run`,
  `budget` off legacy prefix-matching (done across the review passes — see
  [`CHANGELOG.md`](CHANGELOG.md)).
- [ ] Have `scenarios/run` call `deriveIncomeStatement` / `deriveBalanceSheet`
  rather than re-deriving subtotals where any remain.

### Phase 2 — FX engine (IAS 21 compliance)

See the [IAS 21 design](#design--ias-21-currency-translation--cta) below for the
worked algorithm.

- [ ] Translate the income statement at the **average** rate, balance sheet at
  **closing**, equity/share capital at **historical**. *(#4)*
- [ ] Add a `cta` (Cumulative Translation Adjustment) line to `BalanceSheetData`
  and `totalEquity`, computed as the residual that forces `balanceCheck → 0`.
- [ ] Refresh / source the static `FALLBACK_RATES` table and treat it as a
  last-resort, logged path.
- [ ] **Stress test:** loss-making USD subsidiary across a depreciating EUR with
  historical-rate share capital → non-zero CTA, BS still balances. *(edge case 1)*

### Phase 3 — Intercompany & consolidation depth

- [ ] Automate **balance-sheet IC elimination** (IC receivable/payable, IC loans:
  `AST-009`/`LIA-006`) instead of mapping them into "other". *(#3)*
- [ ] Eliminate **unrealized intra-group profit in inventory** (margin on unsold
  internal stock). *(#2)*
- [ ] Rework eliminations into explicit, auditable **elimination journal entries**
  keyed on `(period, counterpartyPair, account)`.
- [ ] Derive **minority equity** on the BS from ownership × subsidiary equity (not
  only stored `EQY-003`).
- [ ] **Multi-period roll-forward:** link opening retained earnings to prior
  closing; produce a multi-period consolidated balance sheet. *(#1.6 / single-period)*

### Phase 4 — Tax engine wiring & cross-border rules

The detailed, in-flight plan for this phase is [Active: Tax
reconciliation](#active--tax-reconciliation-remediation) below.

- [x] Pluggable tax providers (`PT` full IRC chain; `ES`/`US` flat-rate stubs).
- [~] **Wire `getTaxProvider().computeTax()` into the engine for forecast
  periods** (keep passthrough only for stamped actuals) — reconcile foundation
  shipped; engine wiring (B1–B4) open. *(#6)*
- [ ] **NOL carryforward:** thread `nolOpening`/`nolClosing` through
  `TaxInput`/`TaxResult` so loss years shelter future profit. *(#6)*
- [ ] **Deferred tax** from book-vs-tax timing differences; drive `AST-010` (DTA)
  dynamically.
- [ ] **Transfer pricing:** a `TransferPricingPolicy` (arm's-length markup per IC
  relationship) consumed by both IC pricing and the inventory-profit elimination.
  *(#6)*
- [~] Restore the PT SME reduced-rate parameters (`portugal.ts:46-48`) — see
  workstream A2.
- [ ] Per-jurisdiction tax view in the Compliance UI.
- [ ] **Stress test:** multi-year NOL with a pending RFAI credit overhang.
  *(edge case 2)*

### Phase 5 — Forecasting & debt waterfall

- [ ] Replace the fabricated `/api/forecast` (`forecast/route.ts:251` discards
  real data and returns demo arrays) with real projected statements. *(#1)*
- [ ] **Debt schedule + cash sweep** with interest on the **average** balance;
  resolve the cash↔interest circularity via controlled fixed-point iteration
  (`solveDebtSchedule`). *(#3.2)*
- [ ] **Pure projection kernel** `finance/project.ts`:
  `projectPeriod(openingState, assumptions) → ClosingState`, no DB. Basis for
  scenarios, forecasting, and simulation. *(refactor #1)*
- [ ] **Stress test:** cross-border IC sale with margin stuck in inventory at
  mixed FX rates. *(edge case 3)*

### Phase 6 — Simulation & scale

- [ ] Run scenarios/Monte Carlo through the in-memory kernel (no per-iteration DB
  round trips or `ConsolidationRun` persistence). *(#3.3)*
- [ ] Remove N+1 query / per-row `await` patterns in the engine and IC elimination
  loops.
- [ ] Evaluate integer-cents / decimal money representation to avoid float drift
  in multi-year runs. *(#4)*

### Phase 7 — Platform hardening (tracked, lower priority)

- [ ] Authentication / authorization on API routes (currently single-tenant demo;
  middleware gates destructive routes — see the README).

> **Suggested next step:** start with **Phase 0** — all four items are small,
> high-confidence, and guarded by `npm test`. `assertBalanced` (#5) and the
> proportional-MI fix (#7) are low-risk and unblock trustworthy FX work in Phase 2.

---

## Active — Tax reconciliation remediation

Remediation plan for the Tax Divergence / Correctness Report (engine stored IRC
vs. the standalone tax module). Findings are cross-referenced D1–D7, R1, L1 (table
at the end of this section). Organized into three workstreams by risk: **A** =
unambiguous bug fixes, **B** = the engine reconciliation feature (one product
decision), **C** = tests & verification.

**Completed:** A1 + C3 shipped; the `src/lib/tax/reconcile.ts` module + C1
(standalone) shipped (see [`CHANGELOG.md`](CHANGELOG.md)). Remaining work below.

### Workstream A — Bug fixes (no judgment calls)

#### A2 — `PT_TAX_CONFIG` drift + dead reduced-rate path (D7) — Med

**File:** `src/lib/tax/jurisdictions/portugal.ts` (`:36-59`, lookup at `:91`).

- **Silent year fallback.** `ircRateByYear` covers 2024–2028; any other year drops
  to `ircGeneralRate = 0.20`. A 2023 actual (21%) or a 2030 projection is silently
  mis-rated. **Fix:** replace `?? c.ircGeneralRate` with a helper that picks the
  **nearest scheduled year ≤ requested year** (clamp forward), falling to
  `ircGeneralRate` only for years before the table.
- **Dead + wrong SME reduced rate.** `ircReducedRate: 0.20` with
  `applyReducedRate: false` — disabled *and* mis-valued (2024 statutory SME rate is
  **17%** on the first €50,000). **Fix:** set `ircReducedRate: 0.17`, keep
  `applyReducedRate: false` (opt-in per call, since the engine can't classify
  PME/non-PME), add a doc line. **Confirm the exact rate/threshold against current
  CIRC before merging.**

`tax-drift.test.ts:239-243` already characterizes the current behaviour (2030 →
0.20) as a documented defect; C5 updates those assertions once the clamp helper
lands. Risk: the lookup change affects only out-of-table years; the reduced-rate
value is inert while `applyReducedRate = false`.

#### A3 — `formatCompactEUR` not localized (L1) — Med

**File:** `src/lib/format.ts` (`:38-44`).

`toFixed()` emits en-US dots (`€52.2M`) next to de-DE commas elsewhere; the `K`
branch also ignores its `decimals` arg. **Fix:** build the mantissa with
`formatNumber(abs/1_000_000, decimals)` (`€52,2M`) and honor `decimals` in the `K`
branch. This intentionally changes display output → add C4 assertions for the
localized strings (separate describe block; `tax-drift.test.ts:247-263` tests
`formatNumber` but not `formatCompactEUR`).

A2 and A3 are independent — either can go first.

### Workstream B — Make the engine tax-aware (D1–D6) — High

**Foundation complete.** `src/lib/tax/reconcile.ts` (`reconcileEntityTax`,
`reconcileGroupTax`, `storedTaxFromIS`) is written, exported, and tested. Wiring
into the engine (B1–B4) is the remaining work.

**The product decision — reconcile, don't replace.** Stored IRC on **actuals** is
authoritative: real 2024 IRC reflects SIFIDE/RFAI/ICE credits and
RAI→lucro-tributável adjustments the EBT-based model can't reproduce. So:

- **Actuals:** keep booked `taxExpense` as-is; additionally compute modelled IRC
  per entity and attach an informational `taxReconciliation` block. Net income
  unchanged → **all existing golden tests stay green.**
- **Forecast/budget:** same reconciliation, plus an opt-in
  `computeTaxForProjections` flag (default `false`) that, when set, replaces
  forecast `taxExpense` with modelled IRC.

#### B1 — Wire `reconcileGroupTax` into `computeConsolidation` — ⏳

**File:** `src/lib/consolidation-engine.ts` (`:229-317`).

- `buildEntityFinancials` (`:53`) has the entity but **not `countryCode`** — add
  `Entity.countryCode` to the fetch select and carry it onto `EntityFinancials`.
- After aggregation (`:254`), build `GroupTaxEntity[]` from `entityFinancials`
  using `getTaxProvider(ef.countryCode)` and `{ ebt, taxExpense }` per entity IS,
  then call `reconcileGroupTax(...)`. Per-entity basis is already correct there
  (derrama progressivity, D5).
- Add the result to the returned object as `taxReconciliation`.

#### B2 — Unmodelled-jurisdiction handling (D4) — ⏳

`reconcileGroupTax` already sets `comparable = false` when any entity hits the
`"<CC> — unmodelled"` 0% provider (DE/FR/UK/IT). Surface it: report drift as
**"not comparable — unmodelled jurisdictions: [DE, FR]"**, never a 100% over-book.
No fabricated tax.

#### B3 — Persist + a Compliance "Tax Reconciliation" check (D2) — ⏳

- **Persist:** add a nullable `taxDriftEUR` (and optionally `taxComparable`) to
  `ConsolidationRun` → a new Prisma migration (project is migration-managed; use
  `db:deploy`, not `db:push`). Write it in `runConsolidation` (`:327`).
- **Compliance check:** add a 10th check `tax-reconciliation` to
  `src/app/api/compliance/route.ts` flagging `|drift| > tolerance` (skip
  non-comparable). This closes D2 — the BS integrity gate structurally *cannot*
  see tax drift because booked tax and its offsetting payable net to zero.

#### B4 — Forecast override toggle (D6, opt-in) — ⏳

Add `computeTaxForProjections?: boolean` to `ConsolidationInput`. When `true` and
`periodType !== 'actual'`, set each forecast entity's `is.taxExpense =
-modelledTax` (negation via `storedTaxFromIS`) before
`deriveIncomeStatement`/aggregation. Default `false`.

### Workstream C — Tests & verification

| #  | Test | Status | Asserts |
|----|------|--------|---------|
| C1 | `tax-drift.test.ts` (standalone module) | ✅ Done | `reconcileGroupTax` drift = 56,250 on demo pack; sign-convention, loss year, unmodelled jurisdiction, PT edge cases. Engine-integration extension pending B1. |
| C2 | Forecast-override test | ⏳ | With `computeTaxForProjections:true`, forecast `taxExpense` becomes `-modelledTax`; with `false`, booked passthrough. |
| C3 | Compliance characterization (`route.test.ts`) | ✅ Done | bs-integrity passes on `EQY-*` equity; minority-interest `hasEquityData` true for a 60%-owned `EQY-001` entity. |
| C4 | `formatCompactEUR` localization | ⏳ | de-DE compact strings `€52,2M`, `€85K`, `decimals` honored. |
| C5 | PT config year-clamp | ⏳ | 2023→2024, 2030→2028, pre-2024→`ircGeneralRate`. |

**Verification gate (every workstream):** `npm test` green + `tsc --noEmit` clean.
B3 additionally needs `npm run db:deploy` against a fresh clone to prove the
migration applies.

### Sequencing & decision

**Order:** A2 + C5 → A3 + C4 → B1 (+ extend C1) → B2 → B3 → B4 + C2. B3's
migration is the only DB change; commit it alone. No change to the
`finance`-has-no-`tax` layering — all tax access stays in the engine/route layer.

**Go/no-go before B1** (reconcile-only design is unchanged):

- **(a)** Proceed with B1–B4 as specified — safe, no golden-number change.
- **(b)** Workstream A only for now — B deferred to a later sprint.
- **(c)** Adjust the B design first.

### Finding cross-reference

| ID | Finding | Addressed by |
|----|---------|--------------|
| D1 | No reconciliation seam; drift invisible by construction | B1 ⏳ |
| D2 | BS integrity gate cannot detect tax drift | B3 ⏳ |
| D3 | Sign-convention landmine (engine negative, module positive) | ✅ `storedTaxFromIS`; reused in B4 |
| D4 | Unmodelled jurisdictions fall back to 0% | B2 ⏳ (module already flags `comparable=false`) |
| D5 | Per-entity vs. group basis (derrama progressivity) | ✅ `reconcileGroupTax`; engine wiring (B1) ⏳ |
| D6 | Base mismatch (EBT/RAI vs. lucro tributável); credits | B (reconcile-only) + B4 toggle ⏳ |
| D7 | `PT_TAX_CONFIG` drift; dead reduced-rate path | A2 ⏳ |
| R1 | `compliance/route.ts` hand-rolled COA classification + `EQ-` bug | ✅ Done |
| L1 | `formatCompactEUR` not localized | A3 ⏳ |

---

## Design — IAS 21 currency translation & CTA

Status: **proposed** (Phase 2). Owner: finance domain.

### Problem

`buildEntityFinancials` (`src/lib/consolidation-engine.ts`) converts **every**
trial-balance entry of a foreign entity at a single **closing** rate:

```ts
const rate = await getExchangeRate(entity.localCurrency, periodDate, 'closing');
```

This violates IAS 21 §39. For a subsidiary whose functional currency ≠ the EUR
presentation currency, the standard requires **three** rates:

| Statement | Rate | Rationale |
|-----------|------|-----------|
| Income statement (revenue → net income) | **average** for the period | flows accrue throughout the year |
| Balance sheet — assets & liabilities | **closing** at period end | spot value of positions |
| Equity (share capital, pre-acquisition reserves) | **historical** | frozen at transaction date |

Because the rates differ, the translated balance sheet no longer balances. The
residual is the **Cumulative Translation Adjustment (CTA)** — a real equity
component (OCI), not a plug to hide. With the balance-sheet integrity gate in
place (Phase 0 #5), a foreign entity's `balanceCheck` would be non-zero and the
run would be marked `failed`; the CTA is the missing piece that makes a
correctly-translated foreign sheet reconcile.

### Data model

`ExchangeRate` already supports the rate types
(`rateType String @default("closing")`) and `getExchangeRate(currency, periodDate,
rateType)` already accepts the type — **no migration** needed for
closing/average. Add one equity line to carry the CTA:

```ts
// BalanceSheetData
cta: number; // Cumulative Translation Adjustment (OCI within equity)
```

and fold it into equity in `deriveBalanceSheet`:

```ts
bs.totalEquity = bs.shareCapital + bs.retainedEarnings + bs.minorityEquity + bs.cta;
```

### Translation algorithm (per entity, per period)

Replace the single-rate conversion with rate-aware mapping. The natural seam is
`addEntry`: it already knows which statement a code belongs to.

```
closing    = getExchangeRate(ccy, period, 'closing')
average    = getExchangeRate(ccy, period, 'average')
historical = getExchangeRate(ccy, period, 'historical')   // fallback → closing

for each entry:
  if code ∈ IS_ACCOUNTS:        amountEUR = local / average
  else if code ∈ EQUITY (hist): amountEUR = local / historical
  else (other BS, CF):          amountEUR = local / closing
```

(`convertToEUR(local, rate) = local / rate`, since ECB rates are 1 EUR = X ccy.)
The CTA is computed **last**, as the balancing figure:

```ts
bs.cta = bs.totalAssets - bs.totalLiabilities
         - (bs.shareCapital + bs.retainedEarnings + bs.minorityEquity);
// deriveBalanceSheet then includes cta in totalEquity → balanceCheck == 0
```

This is the **current-rate method** — appropriate when the functional currency is
the local currency (the normal case for autonomous foreign subsidiaries). The
temporal method (hyperinflationary / integrated operations) is out of scope.

### Where it plugs in

1. `fx.ts` — no change; add a `getEntityRates(ccy, period) → { closing, average,
   historical }` helper to fetch once.
2. `account-maps.ts` — add `cta` to `BalanceSheetData`, `createEmptyBS`, and the
   `deriveBalanceSheet` equity rollup.
3. `statements.ts` — `addEntry` gains an optional `rates` arg; pure-EUR entities
   pass `{closing:1, average:1, historical:1}` and behave exactly as today (zero
   CTA, protecting the EUR-only golden tests).
4. `consolidation-engine.ts` — fetch the three rates once per entity, pass them
   into `addEntry`, compute `bs.cta` before `deriveBalanceSheet`.
5. On aggregation, `cta` sums like any other equity detail line.

### Open decisions

- **Historical equity rate source.** No per-tranche historical rate exists in the
  seed. v1: use the acquisition-date rate stored on the entity, or fall back to
  closing (CTA then only captures asset/liability vs. P&L drift). Follow-up to
  capture per-tranche historical rates.
- **CTA recycling.** On disposal, accumulated CTA recycles to P&L (IAS 21 §48).
  Out of scope until disposals are modelled.
- **Average-rate granularity.** With an annual snapshot, "average" = annual
  average ECB rate; move to period-weighted averages when monthly data lands.

### Test plan

- Golden tests stay green: EUR-only demo entities → all rates 1.0 → `cta == 0`.
- New unit test: a synthetic GBP entity with closing ≠ average → `cta ≠ 0` and
  `balanceCheck == 0` after derivation.
- New engine test: a two-entity group (EUR + GBP) → consolidated `balanceCheck ≈
  0` and `status == 'completed'`.

---

## Appendix — Architecture & logic review

> Senior quantitative-finance review of the consolidation, FX, tax, and
> forecasting logic (2026-06-16). Scope: `src/lib/finance`,
> `src/lib/consolidation-engine.ts`, `src/lib/tax`, `src/lib/projects`, and the
> `forecast` / `scenarios/run` routes. This is the rationale the roadmap above
> references by finding number.

### Ranked fail-states

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | **Critical** | `forecast/route.ts:251` | Forecast returns fabricated demo data even when real TB exists. |
| 2 | **Critical** | `consolidation-engine.ts:157,197` | IC eliminations double-count across the transaction table and TB rows. |
| 3 | **High** | `consolidation-engine.ts` / `account-maps.ts:116` | IC loans/receivables/payables never eliminated → consolidated assets & liabilities inflated. |
| 4 | **High** | `consolidation-engine.ts:60`, `fx.ts` | P&L translated at closing rate; no average rate; no CTA reserve → not IAS 21-compliant and will not balance once corrected. |
| 5 | **High** | `statements.ts:100`, engine `:276` | `balanceCheck` never enforced; unbalanced runs marked `completed`. |
| 6 | **Medium** | `tax/*` | No NOL carryforward, no deferred tax, no transfer pricing; tax not wired into forecasts. |
| 7 | **Medium** | `statements.ts:85` | Proportional-method minority interest double-removes ownership share. |
| 8 | **Medium** | `fx.ts:34,43` | Silent fallback to rate 1.0 / identity on bad data. |

### Detail

**Consolidation logic.** Sound: detail-account-only mapping with recomputed
subtotals (`account-maps.ts:70`, empty `SUMMARY_ACCOUNTS`) never trusts stored
subtotals; IC P&L netting is net-zero on EBITDA (`engine:254-261`).
Vulnerabilities: (#2) IC elimination sums from two independent sources — the
`intercompanyTransaction` table (`:157`) and `trialBalance.isIntercompany` rows
(`:197`) — with nothing reconciling them, so a sale present in both is netted
twice; (#2) no elimination of unrealized intra-group profit in inventory; (#3)
`AST-009`/`LIA-006` mapped straight into other current assets/liabilities and
never eliminated (the BS elimination branch only flips a flag the aggregation
ignores); (#5) `balanceCheck` computed but `runConsolidation` saves `completed`
unconditionally; (#7) proportional MI re-derives a phantom charge after
`applyOwnership` already scaled every line; single-period only — no roll-forward.

**FX engine** (weakest area). (#4) Everything is translated at the closing rate
including the income statement — `getExchangeRate` accepts a `rateType` and the DB
stores `average`, but the engine never requests it for the P&L, violating IAS
21/ASC 830. (#4) No CTA: today the BS "balances" only because one uniform rate
scales A, L, E identically; correct FX needs a CTA equity plug and there is no
reserve line for it. (#8) Silent fallback to parity: `getExchangeRate` degrades
closing → average → static table → **1.0**, and `convertToEUR` returns the
unconverted amount when `rate === 0` — bad data produces plausible-but-wrong
numbers instead of failing loudly.

**Tax** (strongest module). Genuinely decoupled: `TaxProvider` interface, runtime
registry with override, externalized `PT_TAX_CONFIG`, faithful PT IRC chain
(coleta → ICE → SIFIDE → RFAI-capped-at-50% → derramas → tributação autónoma).
Gaps (#6): not wired into the engine (passes through stored `TAX-001/2/3`; correct
for 2024 actuals, no real tax for forecasts); no NOL carryforward (both providers
floor taxable income at zero each year independently); no capital-allowance /
book-vs-tax timing, so `AST-010` DTA is static; transfer pricing architecturally
absent; reduced-rate parameters are placeholders. *(This phase is now detailed in
[Active: Tax reconciliation](#active--tax-reconciliation-remediation).)*

**Financial integrity & mechanisms.** Double-entry diagnosed, not enforced (#5).
Debt & cash-flow waterfall does not exist — financing cash flow is static
`debtIssuance − debtRepayment − dividendsPaid` and the only "interest" modelling
is a magic multiplier in the scenario route; `/api/forecast` is fabricated (#1).
Simulation readiness not there yet: state is DB-bound at every step (sequential
`await` per entity, `await db.update` per transaction). Good news: `statements.ts`
is already pure — the correct nucleus for an in-memory projection kernel.

### Refactoring proposals

1. **Extract a pure projection kernel** `finance/project.ts`:
   `projectPeriod(openingState, assumptions) → ClosingState`, no Prisma.
   Consolidation, scenarios, and Monte Carlo all call it. Prerequisite for
   simulation readiness and for killing duplicated mapping.
2. **Make double-entry a hard invariant.** `assertBalanced(bs, tolerance)` that
   throws above a cent tolerance; `runConsolidation` sets `status: 'failed'` with
   the imbalance recorded. Consider integer cents / decimal money.
3. **Introduce an FX translation stage with a CTA plug** (see the IAS 21 design
   above).
4. **Unify IC elimination into one matched-pair pass** keyed on
   `(period, counterpartyPair, account)`, producing explicit elimination journal
   entries (revenue/COGS *and* receivable/payable *and* unrealized inventory
   profit) so eliminations are auditable line items, not flag flips.
5. **Thread cross-period tax state** — `nolOpening`/`nolClosing` + a deferred-tax
   block; wire `computeTax()` into the kernel for forecasts; add a
   `TransferPricingPolicy` consumed by both IC pricing and inventory-profit
   elimination.
6. **Build a real debt waterfall with controlled iteration** — `solveDebtSchedule`
   computing interest on average balance, resolving the cash↔interest circularity
   by fixed-point iteration (cap ~20 passes, tolerance on Δinterest).

### Edge cases to stress-test FX & tax

1. **FX with a loss-making USD subsidiary across a depreciating EUR.** USD net
   loss, USD strengthens ~15% between average and closing, historical-rate share
   capital. Correct: P&L at average, net assets at closing, share capital at
   historical, a **non-zero CTA** that balances the consolidated BS. Today: single
   closing rate → no CTA → the imbalance is invisible. Proves whether FX
   architecture and `balanceCheck` enforcement actually exist.
2. **Multi-year NOL with a credit overhang.** PT entity: Year 1 large loss; Year 2
   a profit smaller than the carried-forward loss but with a pending RFAI credit.
   Correct: Year 2 tax ≈ 0, loss partially consumed, RFAI carried forward, NOL
   closing tracked. Today: Year 1 loss vanishes (`Math.max(0, …)`), Year 2 taxed in
   full, RFAI silently lost.
3. **Cross-border IC sale with margin stuck in inventory.** MERID (PT) sells to
   MUSA (US) at 30% markup; MUSA has on-sold only half by period end; legs sit at
   different FX rates. Correct: eliminate internal revenue/COGS, eliminate
   unrealized profit in the unsold half, eliminate the IC receivable/payable,
   translate consistently, with a transfer-pricing rate the tax module can test
   for arm's length. Today: naive net-zero leaves unrealized profit in group
   inventory, IC balances inflate both sides of the BS, no TP hook. Hits the three
   biggest gaps at once.
