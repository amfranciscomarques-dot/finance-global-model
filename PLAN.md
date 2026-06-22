# Plan & Roadmap — finance-global-model

Forward-looking work for the multi-entity consolidation model. Completed
remediation history is in [`CHANGELOG.md`](CHANGELOG.md).

Items are grouped by **implementation priority** — **TOP** (do first), **MEDIUM**,
then **LOW** — and numbered within each tier (`TOP.1` = most important, `TOP.2`
second, and so on). Priority blends value *and* dependency/risk: cheap integrity
guard rails that protect every later change rank highest, then the structural
FX/IC corrections they unblock, then forecasting, simulation, and hardening.
Severity tags (`#1`–`#8`) reference the
[Architecture review findings](#appendix--architecture--logic-review) at the
bottom of this file.

> **Status (2026-06-22).** The three review passes are fully remediated, and the
> **tax reconciliation** stream below is now **complete** — workstreams A (A2/A3)
> and B (B1–B4 engine wiring, option (a) go/no-go) all shipped and green (see
> [`CHANGELOG.md`](CHANGELOG.md)). The roadmap below is the longer arc; the model
> is today a *consolidation reporting* engine, not yet a *forecasting* engine, and
> several roadmap items close exactly that gap.

Legend: `[ ]` planned · `[~]` in progress · `[x]` done

---

## Roadmap

### TOP — do first (integrity rails, correctness bugs, in-flight work)

Cheap, high-confidence, and covered by the existing Vitest golden tests; they
protect every later change. The single-source refactor here is nearly finished,
and the tax reconciliation stream is actively in flight.

- [x] **TOP.1 — Enforce `balanceCheck`.** `assertBalanced(bs, tolerance)` lives in
  the finance domain (`statements.ts`); `computeConsolidation` gates `status` on it
  and `runConsolidation` persists the signed imbalance to a new
  `ConsolidationRun.balanceCheck` column (migration
  `20260622000000_consolidation_run_balance_check`). Unblocks trustworthy FX work
  in MEDIUM.1. *(#5)*
- [x] **TOP.2 — Stop silent FX fallbacks.** `getExchangeRate` now throws
  `FxRateUnavailableError` instead of falling back to a static table / `1.0`, and
  `convertToEUR` throws on a non-positive/non-finite rate. Also fixed the
  period-end vs month-start rate-lookup mismatch the fallback had masked
  (`periodCeiling`). `/api/consolidation` maps the error to 422. Covered by
  `src/lib/finance/fx.test.ts`. *(#8)*
- [ ] **TOP.3 — De-duplicate IC elimination sources.** Make the
  `intercompanyTransaction` path and the `trialBalance.isIntercompany` path
  mutually exclusive (shared key) so internal sales aren't netted twice. *(#2)*
- [x] **TOP.4 — Fix proportional-method minority interest.** Verified: proportional
  consolidation already scales by ownership, so `computeMinorityInterest` returns 0
  (no phantom charge); covered by `statements.test.ts`. *(#7)*
- [x] **TOP.5 — Tax reconciliation.** **Done (2026-06-22).** Bug fixes A2/A3 plus
  `reconcileGroupTax` wired into the engine (B1–B4): informational drift on actuals
  (golden values unchanged), opt-in modelled IRC for forecasts, drift persisted on
  `ConsolidationRun` and surfaced as a 10th compliance check. Detail: [Completed:
  Tax reconciliation](#completed--tax-reconciliation-remediation). *(#6)*
- [ ] **TOP.6 — Finish the single-source refactor.** Have `scenarios/run` call
  `deriveIncomeStatement` / `deriveBalanceSheet` rather than re-deriving subtotals
  where any remain. *(remaining tail of the `finance` domain-module refactor —
  `kpis`, `consolidation-engine`, `export/*`, `variance`, `trends`, `budget`
  already repointed; see [`CHANGELOG.md`](CHANGELOG.md))*

### MEDIUM — structural correctness & forecasting

The FX/IC corrections the TOP rails protect, plus the forecasting and tax-depth
work that turns this from a *reporting* engine into a *forecasting* engine.

- [x] **MEDIUM.1 — FX engine (IAS 21 compliance).** **Done (2026-06-22).**
  Income statement translated at the **average** rate, assets/liabilities at
  **closing**, contributed/pre-existing equity at **historical**; new `cta`
  (Cumulative Translation Adjustment) line on `BalanceSheetData`, folded into
  `totalEquity` by `deriveBalanceSheet`, computed as the residual that forces
  `balanceCheck → 0`. Pure translation lives in `src/lib/finance/translation.ts`
  (`translateForeignEntity`), wired into the engine via a dedicated foreign-entity
  path (`buildForeignEntityFinancials`) that leaves the EUR per-line path — and
  thus every golden test — untouched. No static fallback table (removed in TOP.2);
  each of the three rates is resolved independently and fails loudly if missing.
  Tests: `translation.test.ts` (worked example + rates-equal + EUR-identity +
  invalid-rate) and `fx-translation.engine.test.ts` (USD MUSA book consolidated
  end-to-end → CTA raised, group still balances → completed). Worked example
  written up in the [README](README.md#currency-translation-ias-21). *(#4)*
- [~] **MEDIUM.2 — Real forecasting.** *Partially shipped.* `/api/forecast` no
  longer fabricates data — it reads real annual actuals (`buildRealAnnualCashFlow`),
  derives the consolidated cash flow through the finance domain, then projects 12
  months from it. Remaining gaps: it projects **cash flow only** (no forward IS/BS);
  the projection is a flat run-rate × growth, not **driver-based** (revenue → COGS →
  working capital → debt → cash); the uncertainty fan is hardcoded (±5/8/3%/mo); and
  no tax is applied to projected periods. Finishing this = projecting full IS/BS/CF
  on the **MEDIUM.10** kernel. *(was #1; fabrication resolved, scope narrowed)*
- [ ] **MEDIUM.3 — Balance-sheet IC elimination.** Automate elimination of IC
  receivable/payable and IC loans (`AST-009`/`LIA-006`) instead of mapping them
  into "other". *(#3)*
- [ ] **MEDIUM.4 — Unrealized intra-group profit in inventory.** Eliminate the
  margin on unsold internal stock. *(#2)*
- [ ] **MEDIUM.5 — Elimination journal entries.** Rework eliminations into
  explicit, auditable entries keyed on `(period, counterpartyPair, account)`.
- [ ] **MEDIUM.6 — Minority equity on the BS.** Derive from ownership × subsidiary
  equity (not only stored `EQY-003`).
- [ ] **MEDIUM.7 — Multi-period roll-forward.** Link opening retained earnings to
  prior closing; produce a multi-period consolidated balance sheet.
  *(#1.6 / single-period)*
- [ ] **MEDIUM.8 — Tax depth & cross-border rules.** NOL carryforward (thread
  `nolOpening`/`nolClosing` through `TaxInput`/`TaxResult` so loss years shelter
  future profit); deferred tax from book-vs-tax timing differences driving
  `AST-010` (DTA) dynamically; a `TransferPricingPolicy` (arm's-length markup per
  IC relationship) consumed by both IC pricing and the inventory-profit
  elimination. **Stress test:** multi-year NOL with a pending RFAI credit
  overhang. *(#6 / edge case 2)*
- [ ] **MEDIUM.9 — Debt schedule + cash sweep.** Interest on the **average**
  balance; resolve the cash↔interest circularity via controlled fixed-point
  iteration (`solveDebtSchedule`). *(#3.2)*
- [ ] **MEDIUM.10 — Pure projection kernel** `finance/project.ts`:
  `projectPeriod(openingState, assumptions) → ClosingState`, no DB. Basis for
  scenarios, forecasting, and simulation. **Stress test:** cross-border IC sale
  with margin stuck in inventory at mixed FX rates. *(refactor #1 / edge case 3)*

### LOW — simulation, scale & hardening

- [ ] **LOW.1 — Simulation through the kernel.** Run scenarios/Monte Carlo through
  the in-memory kernel (no per-iteration DB round trips or `ConsolidationRun`
  persistence). *(#3.3)*
- [ ] **LOW.2 — Remove N+1 / per-row `await`** patterns in the engine and IC
  elimination loops.
- [ ] **LOW.3 — Integer-cents / decimal money** representation to avoid float
  drift in multi-year runs. *(#4)*
- [ ] **LOW.4 — Per-jurisdiction tax view** in the Compliance UI.
- [ ] **LOW.5 — Authentication / authorization** on API routes (currently
  single-tenant demo; middleware gates destructive routes — see the README).

> **Suggested next step (2026-06-22, post-MEDIUM.1).** Integrity rails (TOP.1, .2,
> .4) and the FX/CTA centerpiece (MEDIUM.1) are done. Recommended order by
> value-per-effort and dependency:
>
> 1. **Seed a USD demo book into MUSA** — tiny; makes the new IAS 21 CTA visible in
>    the live UI (today the demo is all-EUR so CTA only shows in tests/README).
> 2. **TOP.3 — IC elimination de-duplication** — small correctness guard that
>    unblocks the IC family (MEDIUM.3/4/5).
> 3. **MEDIUM.10 kernel → MEDIUM.2 (full IS/BS/CF forecast)** — do as one stream;
>    the next structural centerpiece, the way MEDIUM.1 was for FX. The B4 forecast
>    tax override now has somewhere richer to live once the kernel projects a full
>    IS/BS.
>
> ~~4. TOP.5 / Workstream B — tax wiring~~ — **done (2026-06-22)**, see below.

---

## Completed — Tax reconciliation remediation

> **Status: ✅ fully shipped (2026-06-22).** All workstreams below are done and
> green (`npm test` 178 / `tsc` clean / `build` exit 0); see the top of
> [`CHANGELOG.md`](CHANGELOG.md). The plan is kept here as the record of what was
> built and why. The reconcile-only design was confirmed via go/no-go **option
> (a)** (proceed with B1–B4 as specified — no golden-number change).

Remediation plan for the Tax Divergence / Correctness Report (engine stored IRC
vs. the standalone tax module). Findings are cross-referenced D1–D7, R1, L1 (table
at the end of this section). Organized into three workstreams by risk: **A** =
unambiguous bug fixes, **B** = the engine reconciliation feature (one product
decision), **C** = tests & verification.

### Workstream A — Bug fixes (no judgment calls)

#### A2 — `PT_TAX_CONFIG` drift + dead reduced-rate path (D7) — ✅ Done

**File:** `src/lib/tax/jurisdictions/portugal.ts` (`:36-59`, lookup at `:91`).

- **Silent year fallback → fixed.** `ircRateByYear` covers 2024–2028; any other
  year used to drop to `ircGeneralRate = 0.20`, silently mis-rating a 2023 actual
  (21%) or a 2030 projection. **Shipped:** new `ircRateForYear` helper picks the
  **nearest scheduled year ≤ requested year** (clamp forward), falling to
  `ircGeneralRate` only for years before the table.
- **Dead + wrong SME reduced rate → fixed.** Was `ircReducedRate: 0.20` with
  `applyReducedRate: false` — disabled *and* mis-valued. **Shipped:**
  `ircReducedRate: 0.17` (2024 statutory SME rate on the first €50,000),
  `applyReducedRate` kept `false` (opt-in per call, since the engine can't classify
  PME/non-PME) with a doc line.

C5 (`tax-drift.test.ts`) now pins the clamp: 2024→21%, 2026→19%, 2029/2030→17%,
pre-table→20%.

#### A3 — `formatCompactEUR` not localized (L1) — ✅ Done

**File:** `src/lib/format.ts`.

`toFixed()` emitted en-US dots (`€52.2M`) next to de-DE commas elsewhere and the
`K` branch ignored its `decimals` arg. **Shipped:** the mantissa is built with
`formatNumber(abs/1e6, decimals)` (`€52,2M`) and `decimals` is honored in both the
M and K bands. C4 (`src/lib/format.test.ts`) pins the localized strings, sign, and
decimal overrides.

### Workstream B — Make the engine tax-aware (D1–D6) — ✅ Done

**Foundation + engine wiring complete.** `src/lib/tax/reconcile.ts`
(`reconcileEntityTax`, `reconcileGroupTax`, `storedTaxFromIS`) is written,
exported, and tested, and B1–B4 are wired into `consolidation-engine.ts`.

**The product decision — reconcile, don't replace.** Stored IRC on **actuals** is
authoritative: real 2024 IRC reflects SIFIDE/RFAI/ICE credits and
RAI→lucro-tributável adjustments the EBT-based model can't reproduce. So:

- **Actuals:** keep booked `taxExpense` as-is; additionally compute modelled IRC
  per entity and attach an informational `taxReconciliation` block. Net income
  unchanged → **all existing golden tests stay green.**
- **Forecast/budget:** same reconciliation, plus an opt-in
  `computeTaxForProjections` flag (default `false`) that, when set, replaces
  forecast `taxExpense` with modelled IRC.

#### B1 — Wire `reconcileGroupTax` into `computeConsolidation` — ✅ Done

**File:** `src/lib/consolidation-engine.ts`.

- `Entity.countryCode` is carried onto `EntityFinancials` (`buildEntityFinancials`
  / `buildForeignEntityFinancials`).
- After aggregation, the engine builds `GroupTaxEntity[]` from `entityFinancials`
  using `getTaxProvider(ef.countryCode)` and `{ ebt, taxExpense }` per entity IS,
  then calls `reconcileGroupTax(...)` (per-entity basis, D5).
- The result is attached to the return object as `taxReconciliation` —
  informational, so net income on actuals is unchanged (golden values hold).

#### B2 — Unmodelled-jurisdiction handling (D4) — ✅ Done

`reconcileGroupTax` sets `comparable = false` when any entity hits the
`"<CC> — unmodelled"` 0% provider (DE/FR/UK/IT); the compliance check surfaces it
as **"not comparable — unmodelled jurisdictions: [DE, FR]"** rather than a 100%
over-book. No fabricated tax. Covered by the B2 engine test (synthetic DE entity).

#### B3 — Persist + a Compliance "Tax Reconciliation" check (D2) — ✅ Done

- **Persisted:** nullable `taxDriftEUR` + `taxComparable` columns on
  `ConsolidationRun` (migration `20260622010000_consolidation_run_tax_drift`).
  `runConsolidation` writes the drift **only when comparable** (else `null`, so a 0
  is never read as "no divergence").
- **Compliance check:** the 10th check `tax-reconciliation` in
  `src/app/api/compliance/route.ts` flags `|drift| > €1,000` (skips non-comparable).
  Closes D2 — the BS integrity gate structurally *cannot* see tax drift because
  booked tax and its offsetting payable net to zero.

#### B4 — Forecast override toggle (D6, opt-in) — ✅ Done

`computeTaxForProjections?: boolean` on `ConsolidationInput` (default `false`).
When `true` and `scenarioType !== 'base'`, `applyModelledTax` replaces each
forecast entity's booked tax with modelled IRC (sign bridged via the engine's
negative convention) and accrues the incremental tax as a payable
(`otherCurrentLiabilities`) so the entity sheet still reconciles. Actuals untouched.

### Workstream C — Tests & verification

| #   | Test                                          | Status | Asserts                                                                                                                                                       |
| --- | --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `tax-drift.test.ts` (standalone module)       | ✅ Done | `reconcileGroupTax` drift = 56,250 on demo pack; sign-convention, loss year, unmodelled jurisdiction, PT edge cases.                                          |
| C2  | Forecast-override + engine integration        | ✅ Done | `tax reconciliation (B1/B2/B4)` block in `consolidation-engine.test.ts`: B1 attaches +56,250 drift (net income unchanged); B2 flags DE non-comparable; B4 modelled IRC lifts net income, collapses drift to ~0, keeps `balanceCheck ≈ 0`; override off by default. |
| C3  | Compliance characterization (`route.test.ts`) | ✅ Done | bs-integrity passes on `EQY-*` equity; minority-interest `hasEquityData` true for a 60%-owned `EQY-001` entity.                                               |
| C4  | `formatCompactEUR` localization               | ✅ Done | de-DE compact strings `€52,2M`, `€85K`, `decimals` honored (`src/lib/format.test.ts`).                                                                        |
| C5  | PT config year-clamp                          | ✅ Done | 2024→21%, 2026→19%, 2029/2030→17%, pre-table→`ircGeneralRate`.                                                                                                |

**Verification gate (achieved):** `npm test` = 178 passed / 24 files · `tsc
--noEmit` clean · `eslint` 0 errors · `npm run build` exit 0. The B3 migration
(`20260622010000_consolidation_run_tax_drift`) is committed alone, applies via
`npm run db:deploy`.

### Sequencing & decision (as executed)

**Order followed:** A2 + C5 → A3 + C4 → B1 (+ C2 engine tests) → B2 → B3 → B4. The
B3 migration was the only DB change. No change to the `finance`-has-no-`tax`
layering — all tax access stays in the engine/route layer.

**Go/no-go before B1 — chose (a):** proceeded with B1–B4 as specified (reconcile-only;
no golden-number change), rather than (b) workstream-A-only or (c) redesigning B.

### Finding cross-reference

| ID  | Finding                                                          | Addressed by                                   |
| --- | ---------------------------------------------------------------- | ---------------------------------------------- |
| D1  | No reconciliation seam; drift invisible by construction          | ✅ B1                                           |
| D2  | BS integrity gate cannot detect tax drift                        | ✅ B3 (compliance check)                        |
| D3  | Sign-convention landmine (engine negative, module positive)      | ✅ `storedTaxFromIS`; reused in B4              |
| D4  | Unmodelled jurisdictions fall back to 0%                         | ✅ B2 (`comparable=false`)                      |
| D5  | Per-entity vs. group basis (derrama progressivity)               | ✅ `reconcileGroupTax`; wired in B1             |
| D6  | Base mismatch (EBT/RAI vs. lucro tributável); credits            | ✅ B (reconcile-only) + B4 toggle               |
| D7  | `PT_TAX_CONFIG` drift; dead reduced-rate path                    | ✅ A2                                           |
| R1  | `compliance/route.ts` hand-rolled COA classification + `EQ-` bug | ✅ Done                                         |
| L1  | `formatCompactEUR` not localized                                 | ✅ A3                                           |

---

## Design — IAS 21 currency translation & CTA

Status: **proposed** (MEDIUM.1). Owner: finance domain.

### Problem

`buildEntityFinancials` (`src/lib/consolidation-engine.ts`) converts **every**
trial-balance entry of a foreign entity at a single **closing** rate:

```ts
const rate = await getExchangeRate(entity.localCurrency, periodDate, 'closing');
```

This violates IAS 21 §39. For a subsidiary whose functional currency ≠ the EUR
presentation currency, the standard requires **three** rates:

| Statement                                        | Rate                       | Rationale                        |
| ------------------------------------------------ | -------------------------- | -------------------------------- |
| Income statement (revenue → net income)          | **average** for the period | flows accrue throughout the year |
| Balance sheet — assets & liabilities             | **closing** at period end  | spot value of positions          |
| Equity (share capital, pre-acquisition reserves) | **historical**             | frozen at transaction date       |

Because the rates differ, the translated balance sheet no longer balances. The
residual is the **Cumulative Translation Adjustment (CTA)** — a real equity
component (OCI), not a plug to hide. With the balance-sheet integrity gate in
place (TOP.1, #5), a foreign entity's `balanceCheck` would be non-zero and the
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

| #   | Severity     | Location                                          | Issue                                                                                                                       |
| --- | ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Critical~~ → Med | `forecast/route.ts`                         | ~~Fabricated demo data~~ **resolved** — route now reads real actuals. Remaining: CF-only run-rate, not driver-based full IS/BS/CF (MEDIUM.2 + .10). |
| 2   | **Critical** | `consolidation-engine.ts:157,197`                 | IC eliminations double-count across the transaction table and TB rows.                                                      |
| 3   | **High**     | `consolidation-engine.ts` / `account-maps.ts:116` | IC loans/receivables/payables never eliminated → consolidated assets & liabilities inflated.                                |
| 4   | **High**     | `consolidation-engine.ts:60`, `fx.ts`             | P&L translated at closing rate; no average rate; no CTA reserve → not IAS 21-compliant and will not balance once corrected. |
| 5   | **High**     | `statements.ts:100`, engine `:276`                | `balanceCheck` never enforced; unbalanced runs marked `completed`.                                                          |
| 6   | Med → partly resolved | `tax/*`                                  | ~~tax not wired into forecasts~~ **resolved (TOP.5/B1–B4)** — reconciliation on actuals + opt-in modelled IRC for forecasts. Remaining: no NOL carryforward, no deferred tax, no transfer pricing (MEDIUM.8). |
| 7   | **Medium**   | `statements.ts:85`                                | Proportional-method minority interest double-removes ownership share.                                                       |
| 8   | **Medium**   | `fx.ts:34,43`                                     | Silent fallback to rate 1.0 / identity on bad data.                                                                         |

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
Gaps (#6) — **engine wiring now resolved** (TOP.5/B1–B4): the engine reconciles
stored IRC against modelled tax on actuals (informational, passthrough preserved)
and can replace forecast tax with modelled IRC via an opt-in flag. Remaining gaps:
no NOL carryforward (both providers floor taxable income at zero each year
independently); no capital-allowance / book-vs-tax timing, so `AST-010` DTA is
static; transfer pricing architecturally absent — all folded into **MEDIUM.8**.
*(The shipped reconciliation phase is detailed in
[Completed: Tax reconciliation](#completed--tax-reconciliation-remediation).)*

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
