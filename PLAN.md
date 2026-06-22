# Plan & Roadmap — finance-global-model

Forward-looking work for the multi-entity consolidation model. Completed
remediation history is in [`CHANGELOG.md`](CHANGELOG.md).

Items are grouped by priority — **TOP** (do first), **MEDIUM**, **LOW** — and
numbered within each tier. Priority blends value and dependency/risk: cheap
integrity rails that protect later changes rank highest, then the FX/IC
corrections they unblock, then forecasting and hardening. Severity tags `#1`–`#8`
reference the [architecture review](#appendix--architecture--logic-review).

> **Status (2026-06-22).** Three review passes fully remediated; the **tax
> reconciliation** stream (workstreams A + B) is complete and green — see
> [`CHANGELOG.md`](CHANGELOG.md). The model is today a *consolidation reporting*
> engine, not yet a *forecasting* engine; several roadmap items close that gap.

Legend: `[ ]` planned · `[~]` in progress · `[x]` done

---

## Roadmap

### TOP — integrity rails, correctness bugs, in-flight work

- [x] **TOP.1 — Enforce `balanceCheck`.** `assertBalanced(bs, tolerance)` in
  `statements.ts`; `computeConsolidation` gates `status` on it and
  `runConsolidation` persists the signed imbalance (`ConsolidationRun.balanceCheck`,
  migration `…_balance_check`). Unblocks MEDIUM.1. *(#5)*
- [x] **TOP.2 — Stop silent FX fallbacks.** `getExchangeRate` throws
  `FxRateUnavailableError` instead of falling back to a static table / `1.0`;
  `convertToEUR` throws on non-positive/non-finite rates. Fixed the period-end vs
  month-start lookup mismatch (`periodCeiling`); `/api/consolidation` maps to 422.
  Tests: `fx.test.ts`. *(#8)*
- [x] **TOP.3 — De-duplicate IC elimination sources.** `runICEliminations` keys
  every eliminated flow on its unordered entity pair + rounded EUR amount; the
  `intercompanyTransaction` path registers keys first and the
  `trialBalance.isIntercompany` path skips any flow already seen (`dedupedCount`
  surfaced as `eliminationsDeduped`). Covered by `consolidation-engine.test.ts`
  ("does not double-net … TOP.3"). *(#2)*
- [x] **TOP.4 — Fix proportional-method minority interest.** Proportional
  consolidation already scales by ownership, so `computeMinorityInterest` returns 0;
  covered by `statements.test.ts`. *(#7)*
- [x] **TOP.5 — Tax reconciliation.** `reconcileGroupTax` wired into the engine
  (B1–B4): informational drift on actuals (golden values unchanged), opt-in
  modelled IRC for forecasts, drift persisted and surfaced as a 10th compliance
  check. See [Completed: tax reconciliation](#completed--tax-reconciliation). *(#6)*
- [x] **TOP.6 — Finish the single-source refactor.** All statement subtotals now
  flow through the finance domain. The last two bypasses — `scenarios/run` and the
  engine's `applyModelledTax` (B4) — hand-rolled `netIncome = ebt + taxExpense`
  after overriding tax; both now re-call `deriveIncomeStatement` instead.
  (`kpis`, `consolidation-engine`, `export/*`, `variance`, `trends`, `budget`
  were already repointed.) `project.ts` derives inline as the MEDIUM.10 kernel —
  it *is* the source, not a bypass.

### MEDIUM — structural correctness & forecasting

- [x] **MEDIUM.1 — FX engine (IAS 21).** IS at **average** rate,
  assets/liabilities at **closing**, contributed equity at **historical**; new
  `cta` line on `BalanceSheetData` folded into `totalEquity`, computed as the
  residual that forces `balanceCheck → 0`. Pure translation in `translation.ts`
  (`translateForeignEntity`), wired via `buildForeignEntityFinancials` (the EUR
  per-line path and golden tests stay untouched). Tests: `translation.test.ts`,
  `fx-translation.engine.test.ts`. Worked example in the
  [README](README.md#currency-translation-ias-21). See
  [Design notes](#design-notes--ias-21-currency-translation) for open follow-ups. *(#4)*
- [~] **MEDIUM.2 — Real forecasting.** *Partially shipped.* `/api/forecast` reads
  real annual actuals (`buildRealAnnualCashFlow`) and projects 12 months. Gaps:
  cash flow only (no forward IS/BS); flat run-rate × growth, not **driver-based**
  (revenue → COGS → working capital → debt → cash); hardcoded uncertainty fan
  (±5/8/3%/mo); no tax on projected periods. Finishing = projecting full IS/BS/CF
  on the **MEDIUM.10** kernel. *(was #1)*
- [ ] **MEDIUM.3 — Balance-sheet IC elimination.** Auto-eliminate IC
  receivable/payable and IC loans (`AST-009`/`LIA-006`) instead of mapping them
  into "other". *(#3)*
- [ ] **MEDIUM.4 — Unrealized intra-group profit in inventory.** Eliminate the
  margin on unsold internal stock. *(#2)*
- [ ] **MEDIUM.5 — Elimination journal entries.** Rework eliminations into
  explicit, auditable entries keyed on `(period, counterpartyPair, account)`.
- [ ] **MEDIUM.6 — Minority equity on the BS.** Derive from ownership × subsidiary
  equity (not only stored `EQY-003`).
- [ ] **MEDIUM.7 — Multi-period roll-forward.** Link opening retained earnings to
  prior closing; produce a multi-period consolidated balance sheet. *(#1.6)*
- [ ] **MEDIUM.8 — Tax depth & cross-border rules.** NOL carryforward
  (`nolOpening`/`nolClosing` through `TaxInput`/`TaxResult` so loss years shelter
  future profit); deferred tax from book-vs-tax timing driving `AST-010` (DTA)
  dynamically; a `TransferPricingPolicy` (arm's-length markup per IC relationship)
  consumed by both IC pricing and inventory-profit elimination. **Stress test:**
  multi-year NOL with a pending RFAI credit overhang. *(#6)*
- [ ] **MEDIUM.9 — Debt schedule + cash sweep.** Interest on the **average**
  balance; resolve the cash↔interest circularity via fixed-point iteration
  (`solveDebtSchedule`). *(#3.2)*
- [ ] **MEDIUM.10 — Pure projection kernel** `finance/project.ts`:
  `projectPeriod(openingState, assumptions) → ClosingState`, no DB. Basis for
  scenarios, forecasting, and simulation. **Stress test:** cross-border IC sale
  with margin stuck in inventory at mixed FX rates. *(refactor #1)*

### LOW — simulation, scale & hardening

- [ ] **LOW.1 — Simulation through the kernel.** Run scenarios/Monte Carlo
  in-memory (no per-iteration DB round trips or `ConsolidationRun` persistence). *(#3.3)*
- [ ] **LOW.2 — Remove N+1 / per-row `await`** in the engine and IC elimination loops.
- [ ] **LOW.3 — Integer-cents / decimal money** to avoid float drift in multi-year
  runs. *(#4)*
- [ ] **LOW.4 — Per-jurisdiction tax view** in the Compliance UI.
- [ ] **LOW.5 — Auth/authz on API routes** (currently single-tenant demo;
  middleware gates destructive routes — see the README).

> **Suggested next step (2026-06-22).** The whole TOP tier is now done — integrity
> rails (TOP.1/.2/.4), FX/CTA (MEDIUM.1), tax wiring (TOP.5), IC de-dup (TOP.3),
> and the single-source refactor (TOP.6). Recommended order by value-per-effort and
> dependency:
>
> 1. **Seed a USD demo book into MUSA** — tiny; makes the IAS 21 CTA visible in the
>    live UI (today's demo is all-EUR, so CTA shows only in tests/README).
> 2. **MEDIUM.3 — balance-sheet IC elimination** — now that TOP.3 guards against
>    double-netting, automate IC receivable/payable + loan elimination, then the
>    rest of the IC family (MEDIUM.4/5).
> 3. **MEDIUM.10 kernel → MEDIUM.2 (full IS/BS/CF forecast)** — do as one stream;
>    the next structural centerpiece, the way MEDIUM.1 was for FX.

---

## Completed — tax reconciliation

> ✅ Fully shipped 2026-06-22 (`npm test` 178 / `tsc` clean / `build` exit 0).
> Kept as the record of what/why; details in [`CHANGELOG.md`](CHANGELOG.md).

Reconciles the engine's stored IRC against the standalone tax module. Findings
D1–D7 / R1 / L1 in the table below.

**Product decision — reconcile, don't replace.** Stored IRC on **actuals** is
authoritative (reflects SIFIDE/RFAI/ICE credits and RAI→lucro-tributável
adjustments the EBT-based model can't reproduce). So:

- **Actuals:** keep booked `taxExpense`; attach an informational `taxReconciliation`
  block. Net income unchanged → golden tests stay green.
- **Forecast/budget:** same reconciliation, plus an opt-in `computeTaxForProjections`
  flag (default `false`) that replaces forecast `taxExpense` with modelled IRC.

Confirmed via go/no-go **option (a)** (proceed with B1–B4 reconcile-only; no
golden-number change). No change to the `finance`-has-no-`tax` layering — all tax
access stays in the engine/route layer.

**What shipped:**

- **A2** — `portugal.ts`: `ircRateForYear` clamps to the nearest scheduled year ≤
  requested (no silent 20% fallback for 2023 actuals / 2030 projections); dead SME
  reduced rate fixed to `0.17` (2024 statutory, first €50k), still opt-in per call.
- **A3** — `format.ts`: `formatCompactEUR` localized to de-DE (`€52,2M`), `decimals`
  honored in both the M and K bands (was emitting en-US `€52.2M`).
- **B1** — `reconcileGroupTax` wired into `computeConsolidation` (per-entity basis,
  D5); `countryCode` carried onto `EntityFinancials`; result attached as the
  informational `taxReconciliation` (actuals net income unchanged).
- **B2** — unmodelled jurisdictions (DE/FR/UK/IT) set `comparable = false`;
  compliance surfaces "not comparable — unmodelled jurisdictions" rather than a
  100% over-book. No fabricated tax.
- **B3** — nullable `taxDriftEUR` + `taxComparable` on `ConsolidationRun` (migration
  `…_tax_drift`); written only when comparable (else `null`, never read as "no
  divergence"); 10th compliance check `tax-reconciliation` flags `|drift| > €1,000`.
- **B4** — `computeTaxForProjections` toggle: when `true` and `scenarioType !==
  'base'`, replaces each forecast entity's booked tax with modelled IRC (sign
  bridged) and accrues the incremental tax as a payable so the sheet reconciles.
  Actuals untouched.

Tests C1–C5: standalone module drift (56,250 on the demo pack) plus sign/loss/PT
edge cases; engine integration (B1 attaches +56,250 with net income unchanged, B2
flags DE non-comparable, B4 modelled IRC collapses drift to ~0 and keeps
`balanceCheck ≈ 0`); compliance characterization; format localization; PT
year-clamp.

| ID  | Finding                                                          | Addressed by                  |
| --- | --------------------------------------------------------------- | ----------------------------- |
| D1  | No reconciliation seam; drift invisible by construction        | B1                            |
| D2  | BS integrity gate cannot detect tax drift                      | B3 (compliance check)         |
| D3  | Sign-convention landmine (engine negative, module positive)    | `storedTaxFromIS` (reused B4) |
| D4  | Unmodelled jurisdictions fall back to 0%                       | B2 (`comparable=false`)       |
| D5  | Per-entity vs. group basis (derrama progressivity)            | `reconcileGroupTax` (B1)      |
| D6  | Base mismatch (EBT/RAI vs. lucro tributável); credits          | B reconcile-only + B4 toggle  |
| D7  | `PT_TAX_CONFIG` drift; dead reduced-rate path                  | A2                            |
| R1  | `compliance/route.ts` hand-rolled COA classification + `EQ-` bug | Done                        |
| L1  | `formatCompactEUR` not localized                              | A3                            |

---

## Design notes — IAS 21 currency translation

Implemented in `translation.ts` (MEDIUM.1, shipped); worked example in the
[README](README.md#currency-translation-ias-21). Recorded here for the open
follow-ups.

**Rule (current-rate method).** Three rates per foreign entity/period: IS at
**average**, assets/liabilities at **closing**, contributed/pre-existing equity at
**historical** (falls back to closing). `convertToEUR(local, rate) = local / rate`
(ECB quotes 1 EUR = X ccy). CTA is the balancing residual folded into
`totalEquity`, forcing `balanceCheck → 0`. EUR-only entities pass all-1.0 rates →
zero CTA, so golden tests are unaffected. The temporal method (hyperinflationary /
integrated operations) is out of scope.

**Open follow-ups:**

- **Historical equity rate source.** No per-tranche historical rate in the seed;
  v1 uses the acquisition-date rate or falls back to closing. Capture per-tranche
  historical rates later.
- **CTA recycling.** On disposal, accumulated CTA recycles to P&L (IAS 21 §48) —
  out of scope until disposals are modelled.
- **Average-rate granularity.** Annual snapshot → annual average ECB rate; move to
  period-weighted averages when monthly data lands.

---

## Appendix — architecture & logic review

> Senior quant-finance review of consolidation, FX, tax, and forecasting
> (2026-06-16). Scope: `src/lib/finance`, `consolidation-engine.ts`, `src/lib/tax`,
> `src/lib/projects`, and the `forecast` / `scenarios/run` routes. This is the
> rationale the roadmap references by finding number.

### Ranked fail-states

| #   | Severity              | Location                                          | Issue                                                                                                                  |
| --- | --------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Critical~~ → Med    | `forecast/route.ts`                               | ~~Fabricated demo data~~ **resolved** — reads real actuals. Remaining: CF-only run-rate, not driver-based IS/BS/CF (MEDIUM.2/.10). |
| 2   | ~~Critical~~ → resolved | `consolidation-engine.ts:157,197`               | ~~IC eliminations double-count across the transaction table and TB rows~~ **resolved (TOP.3)** — (pair, amount) dedup key. (Unrealized intra-group inventory profit still open → MEDIUM.4.) |
| 3   | **High**              | `consolidation-engine.ts` / `account-maps.ts:116` | IC loans/receivables/payables never eliminated → consolidated assets & liabilities inflated.                          |
| 4   | ~~High~~ → resolved   | `consolidation-engine.ts:60`, `fx.ts`             | ~~P&L at closing; no average; no CTA~~ **resolved (MEDIUM.1)** — IAS 21 three-rate translation + CTA plug.            |
| 5   | ~~High~~ → resolved   | `statements.ts:100`, engine `:276`                | ~~`balanceCheck` never enforced~~ **resolved (TOP.1)**.                                                               |
| 6   | Med → partly resolved | `tax/*`                                           | ~~tax not wired into forecasts~~ **resolved (TOP.5/B1–B4)**. Remaining: no NOL, deferred tax, or transfer pricing (MEDIUM.8). |
| 7   | ~~Medium~~ → resolved | `statements.ts:85`                                | ~~Proportional-method MI double-removes ownership share~~ **resolved (TOP.4)**.                                       |
| 8   | ~~Medium~~ → resolved | `fx.ts:34,43`                                     | ~~Silent fallback to rate 1.0 / identity~~ **resolved (TOP.2)**.                                                      |

### Detail

**Consolidation.** Sound: detail-account-only mapping with recomputed subtotals
(`account-maps.ts:70`, empty `SUMMARY_ACCOUNTS`) never trusts stored subtotals; IC
P&L netting is net-zero on EBITDA; IC elimination now de-dups across its two
sources (#2 → TOP.3: `intercompanyTransaction` (`:157`) and
`trialBalance.isIntercompany` (`:197`) reconciled on a (pair, amount) key). Open
vulnerabilities: (#2) no elimination of unrealized intra-group profit in inventory
(MEDIUM.4); (#3) `AST-009`/`LIA-006` mapped straight into other current
assets/liabilities and never eliminated; single-period only — no roll-forward.

**FX engine.** *Resolved (MEDIUM.1 + TOP.2):* IAS 21 three-rate translation with a
CTA equity plug, and no more silent parity fallback. (Was the weakest area:
everything translated at closing including the P&L, no CTA reserve, and
`getExchangeRate` degraded closing → average → static table → 1.0.)

**Tax** (strongest module). Genuinely decoupled: `TaxProvider` interface, runtime
registry with override, externalized `PT_TAX_CONFIG`, faithful PT IRC chain
(coleta → ICE → SIFIDE → RFAI-capped-at-50% → derramas → tributação autónoma).
Engine wiring resolved (TOP.5/B1–B4). Remaining gaps (#6 → MEDIUM.8): no NOL
carryforward (taxable income floored at zero each year), no book-vs-tax timing so
`AST-010` DTA is static, transfer pricing architecturally absent.

**Financial integrity & mechanisms.** Double-entry now enforced (#5 → TOP.1). Still
missing: a debt & cash-flow waterfall — financing CF is static `debtIssuance −
debtRepayment − dividendsPaid` and the only "interest" modelling is a magic
multiplier in the scenario route (MEDIUM.9). Simulation state is DB-bound at every
step (sequential `await` per entity / transaction) — LOW.1/.2. Good news:
`statements.ts` is already pure — the nucleus for the MEDIUM.10 kernel.

### Refactoring proposals

1. **Pure projection kernel** `finance/project.ts` (MEDIUM.10) —
   `projectPeriod(openingState, assumptions) → ClosingState`, no Prisma;
   prerequisite for simulation readiness and for killing duplicated mapping.
2. **Hard double-entry invariant** — ✅ done (TOP.1); consider integer cents (LOW.3).
3. **FX translation stage with a CTA plug** — ✅ done (MEDIUM.1).
4. **Unify IC elimination into one matched-pair pass** keyed on
   `(period, counterpartyPair, account)`, producing explicit elimination journal
   entries (revenue/COGS + receivable/payable + unrealized inventory profit).
   MEDIUM.3/4/5.
5. **Thread cross-period tax state** — `nolOpening`/`nolClosing` + a deferred-tax
   block + a `TransferPricingPolicy`. MEDIUM.8.
6. **Real debt waterfall with controlled iteration** — `solveDebtSchedule`,
   interest on average balance, fixed-point (cap ~20 passes, tolerance on
   Δinterest). MEDIUM.9.

### Edge cases to stress-test FX & tax

1. **FX, loss-making USD subsidiary, depreciating EUR.** USD net loss, USD
   strengthens ~15% between average and closing, historical-rate share capital.
   Correct: P&L at average, net assets at closing, share capital at historical, a
   **non-zero CTA** that balances. Validates MEDIUM.1 + `balanceCheck` enforcement.
2. **Multi-year NOL with a credit overhang.** PT entity: Year 1 large loss; Year 2
   profit smaller than the carried-forward loss but with a pending RFAI credit.
   Correct: Year 2 tax ≈ 0, loss partially consumed, RFAI carried forward, NOL
   closing tracked. Today: Year 1 loss vanishes (`Math.max(0, …)`), Year 2 taxed in
   full, RFAI silently lost. MEDIUM.8.
3. **Cross-border IC sale with margin stuck in inventory.** MERID (PT) sells to
   MUSA (US) at 30% markup; MUSA has on-sold only half by period end; legs sit at
   different FX rates. Correct: eliminate internal revenue/COGS, the unrealized
   profit in the unsold half, and the IC receivable/payable; translate
   consistently; with a transfer-pricing rate the tax module can test for arm's
   length. Hits the three biggest gaps at once. MEDIUM.3/4/10.
