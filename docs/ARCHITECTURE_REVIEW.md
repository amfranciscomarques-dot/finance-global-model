# Architecture & Logic Review — finance-global-model

> Senior quantitative-finance architecture review of the consolidation, FX, tax,
> and forecasting logic. Date: 2026-06-16. Reviewer scope: `src/lib/finance`,
> `src/lib/consolidation-engine.ts`, `src/lib/tax`, `src/lib/projects`, and the
> `forecast` / `scenarios/run` API routes.

## Scope & framing

This is a **Next.js + Prisma/SQLite consolidation app** built around a single
source-of-truth domain module (`src/lib/finance`), with one full demo
period (the Meridian group, 2024). It is architecturally a *consolidation reporting* engine,
not yet a *forecasting* engine — and several review dimensions (debt waterfall,
circularity resolution, stochastic readiness) expose exactly that gap. The notes
below are specific about what exists vs. what is scaffold.

---

## 1. Multi-Entity & Multi-Jurisdiction Architecture

### Consolidation logic

**What's sound.** The detail-account-only mapping with recomputed subtotals
(`account-maps.ts:70`, `SUMMARY_ACCOUNTS` empty set) is the right call — never
trusting stored subtotals eliminates a whole class of double-counting bugs. The
IC P&L netting was correctly fixed to be net-zero on EBITDA
(`consolidation-engine.ts:254-261`): remove internal sale from revenue, matching
cost from COGS.

**Structural vulnerabilities:**

1. **IC elimination can double-count.** `runICEliminations` sums eliminations
   from *two independent sources* — the `intercompanyTransaction` table
   (`:157`) **and** `trialBalance` rows flagged `isIntercompany` (`:197`).
   Nothing reconciles them. If the same internal sale exists in both
   representations (which is exactly what a real ETL would produce — a journal
   line *and* a transaction record), revenue is netted twice and consolidated
   EBITDA is understated. These two paths must be mutually exclusive or
   deduplicated by a shared key.

2. **No elimination of unrealized intra-group profit in inventory.** The netting
   treats internal volume as a single symmetric number (`internalVolume` applied
   equally to revenue and COGS). The classic consolidation requirement —
   eliminating the margin embedded in inventory that hasn't been on-sold to a
   third party — is absent. If MERID sells to MSUB at a markup and MSUB
   still holds the goods at period end, group profit is overstated.

3. **Balance-sheet IC eliminations are not automated.** `AST-009` (IC
   receivable) and `LIA-006` (IC payable) are mapped straight into
   `otherCurrentAssets`/`otherCurrentLiabilities` (`account-maps.ts:116,123`)
   and never eliminated. Intercompany loans (e.g. an MSUB↔MERID balance)
   inflate consolidated total assets and total liabilities. The BS elimination
   branch only flips an `eliminationStatus` flag (`consolidation-engine.ts:186-200`);
   the aggregation in `runConsolidation` ignores those flags.

4. **`balanceCheck` is computed but never enforced.** `deriveBalanceSheet` sets
   `balanceCheck = totalAssets − totalLiabilities − totalEquity`
   (`statements.ts:100`), but `runConsolidation` saves `status: 'completed'`
   unconditionally (`:276`). A consolidation that doesn't balance is
   indistinguishable from one that does. There is no double-entry *guard rail* —
   only a diagnostic field nobody asserts on.

5. **Minority interest logic is questionable.** For `proportional` method
   (`statements.ts:85-87`), the code computes `MI = −(netIncome·(1−own)/own)` —
   but proportional consolidation *already* scaled every line by ownership via
   `applyOwnership` (`:54`). Under proportional method you only bring in your
   share, so MI should be **zero**. The current formula re-derives a phantom
   minority charge. For `full` method the sign/magnitude is right, but it's taken
   on the entity's *standalone* net income, before any group-level adjustment.
   Minority *equity* on the BS is only populated if `EQY-003` happens to be
   stored — never derived from ownership × subsidiary equity.

6. **Single-period only.** No roll-forward: opening retained earnings are not
   linked to prior-period closing, and there is no multi-period consolidated
   balance sheet. "Across all forecasted periods" has no implementation surface.

### FX engine

This is the weakest area relative to the stated ambitions.

1. **Everything is translated at the closing rate — including the income
   statement.** `buildEntityFinancials` fetches one rate with
   `getExchangeRate(localCurrency, periodDate, 'closing')`
   (`consolidation-engine.ts:60`) and applies it to *all* trial-balance entries,
   P&L and BS alike (`:79`). `getExchangeRate` *accepts* a `rateType` parameter
   and the DB stores `average` rates (`fx.ts:28`), but the engine never requests
   them for the P&L. This violates IAS 21 / ASC 830: income statement at average
   rate, balance sheet at closing rate.

2. **No Cumulative Translation Adjustment (CTA).** This is the consequence of (1)
   and the real architectural fail-state. Today the balance sheet "balances"
   only because a *single* uniform rate scales A, L and E identically, so
   `balanceCheck` stays 0 trivially. The moment FX is done correctly — P&L at
   average, equity at historical, assets/liabilities at closing — assets will no
   longer equal liabilities + equity, and a **CTA equity plug** is required.
   There is no FX translation reserve line in `BalanceSheetData`
   (`account-maps.ts:27-52`). The architecture has no home for the adjustment
   correct FX creates; it is structurally not FX-ready.

3. **Silent fallback to parity.** `getExchangeRate` degrades closing → average →
   static table → **1.0** (`fx.ts:34`). An unknown currency is silently treated
   as 1:1 with EUR. Combined with `convertToEUR` returning the unconverted
   amount when `rate === 0` (`fx.ts:43`), bad/missing FX data produces
   plausible-looking but wrong numbers instead of failing loudly.

---

## 2. Tax Modularity & Cross-Border Rules

**What's well-designed.** The tax engine is genuinely decoupled: `TaxProvider`
interface (`tax/types.ts:53`), a runtime registry with override
(`tax/index.ts:25`), parameters externalized into `PT_TAX_CONFIG`
(`portugal.ts:38`), and a clean `getTaxProvider(countryCode)` lookup. The PT IRC
chain (coleta → ICE → SIFIDE → RFAI-capped-at-50%-coleta → derramas →
tributação autónoma) is faithfully modelled with progressive derrama estadual
tiers (`portugal.ts:64-80`). This is the strongest module in the codebase.

**Gaps:**

1. **Not wired into the engine.** Consolidation passes through stored
   `TAX-001/2/3`; `getTaxProvider().computeTax()` is never called from
   `runConsolidation`. Correct for 2024 actuals (real IRC reflects credits the
   statutory chain can't reproduce), but **any forecast period computes no real
   tax**.

2. **No NOL carryforward.** `TaxInput` has no loss-carryforward state, and both
   providers floor taxable income at zero each year independently
   (`portugal.ts:90`, `flat-rate.ts:20`). A loss year vanishes — it never
   shelters future profits. Can't be patched per-call: there's no place to
   thread the running NOL balance across periods.

3. **No capital-allowance / book-vs-tax timing.** Tax depreciation is implicitly
   assumed equal to book depreciation. No deferred tax — `AST-010` (DTA) is a
   static mapped line (`account-maps.ts:117`), never driven by timing
   differences.

4. **Transfer pricing: architecturally absent.** No intercompany margin policy,
   no arm's-length markup parameter, no cross-border cost allocation. IC
   transactions carry an amount but no pricing-rule provenance. Biggest missing
   tax-architecture piece, and it interacts with the missing unrealized-profit
   elimination from §1.

5. **Reduced-rate parameters are placeholders.** `ircReducedRate: 0.20` equals
   the general rate and `applyReducedRate: false` (`portugal.ts:46-48`); the PT
   SME reduced rate is effectively stubbed off.

---

## 3. Financial Integrity & Core Mechanisms

1. **Double-entry consistency: diagnosed, not enforced** (see §1.4). No
   assertion, no tolerance band, no rejection of unbalanced runs.

2. **Debt & cash-flow waterfall: does not exist.** No debt schedule, no cash
   sweep, no interest-on-average-balance, and therefore **no circular reference
   to resolve**. Financing cash flow is a static
   `debtIssuance − debtRepayment − dividendsPaid` (`statements.ts:113`); the only
   "interest" modelling is a magic multiplier in the scenario route
   (`scenarios/run/route.ts:54`). The `/api/forecast` endpoint is **fabricated**:
   it computes a linear regression and a `periodMap` from real data, then
   *discards both* and returns `getDemoForecastData()` (`forecast/route.ts:251-253`).

3. **Simulation readiness: not there yet.** State is DB-bound at every step:
   sequential `await` per entity (`:231-234`), `await db.update` per transaction
   in a loop (`:152-162`), and each scenario run triggers two full
   consolidations that persist `ConsolidationRun` rows and mutate IC flags. None
   of this survives a Monte Carlo inner loop. *Good news:* `statements.ts` is
   already pure — the correct nucleus for an in-memory projection kernel. The
   problem is orchestration sits on Prisma, not on that kernel.

---

## 4. Code Architecture & Scalability

- **Separation of concerns** is good where the refactor reached (`finance/` is a
  clean pure-domain layer). But `export/excel`, `export/pdf`, `scenarios/run`,
  `trends`, `variance`, and `ai-chat` still re-implement the mapping.
  `scenarios/run` hand-rolls `grossProfit`/`ebitda`/`ebit`
  (`route.ts:50-53,77-79`) instead of calling `deriveIncomeStatement`, so the two
  will drift.
- **Performance / vectorization:** N+1 query patterns; money held as JS floats
  with ad-hoc `Math.round`. Fine for 4 entities × 1 period; risks cent-level
  drift for the stated multi-year/stochastic goal where `balanceCheck` wants to
  be exactly 0.

---

## Fail-states & vulnerabilities (ranked)

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

---

## Refactoring proposals

1. **Extract a pure projection kernel.** Add `finance/project.ts` with
   `projectPeriod(openingState, assumptions) → ClosingState` operating entirely
   on plain objects (no Prisma). Consolidation, scenarios, and Monte Carlo all
   call it; the DB layer only loads opening state and persists results.
   Prerequisite for simulation readiness and for killing duplicated mapping.

2. **Make double-entry a hard invariant.** `assertBalanced(bs, tolerance)` that
   throws above a cent tolerance; `runConsolidation` sets `status: 'failed'` with
   the imbalance recorded. Consider integer cents / decimal type for money.

3. **Introduce an FX translation stage with a CTA plug.** Split rate lookups by
   statement (average IS, closing BS, historical equity/share capital). Add
   `ctaReserve` to `BalanceSheetData` and `totalEquity`, computed as the residual
   that forces `balanceCheck → 0`.

4. **Unify IC elimination into one matched-pair pass** keyed on
   `(period, counterpartyPair, account)`, producing explicit elimination journal
   entries (revenue/COGS *and* receivable/payable *and* unrealized-inventory
   profit) so eliminations are auditable line items, not flag flips.

5. **Thread cross-period tax state.** Extend `TaxInput`/`TaxResult` with
   `nolOpening`/`nolClosing` and a deferred-tax block; wire
   `getTaxProvider().computeTax()` into the projection kernel for forecast
   periods (keep passthrough only for stamped actuals). Add a
   `TransferPricingPolicy` (markup per IC relationship) consumed by both IC
   pricing and the inventory-profit elimination.

6. **Build a real debt waterfall with controlled iteration.** A
   `solveDebtSchedule` that computes interest on average balance and resolves the
   cash↔interest circularity by fixed-point iteration (cap ~20 passes, tolerance
   on Δinterest).

---

## Edge cases to stress-test FX & tax

1. **FX translation with a loss-making USD subsidiary across a depreciating EUR.**
   MUSA posts a USD net loss, USD strengthens ~15% between average and closing
   rates, holds historical-rate share capital. Correct: P&L at average, net
   assets at closing, share capital at historical, and a **non-zero CTA** that
   makes the consolidated BS balance. Today: single closing rate → no CTA → the
   imbalance is invisible because everything scales uniformly. Proves whether FX
   architecture and `balanceCheck` enforcement actually exist.

2. **Multi-year NOL with a credit overhang.** PT entity: Year 1 large tax loss;
   Year 2 a profit smaller than the carried-forward loss but with a pending RFAI
   credit. Correct: Year 2 tax ≈ 0, loss partially consumed, RFAI credit carried
   forward, NOL closing balance tracked. Today: Year 1 loss vanishes
   (`Math.max(0, …)`), Year 2 taxed in full, RFAI silently lost.

3. **Cross-border intercompany sale with margin stuck in inventory.** MERID (PT)
   sells to MUSA (US) at a 30% markup; MUSA has sold only half to third
   parties by period end, and the two legs sit at different FX rates. Correct:
   eliminate internal revenue/COGS, eliminate unrealized profit in the unsold
   half, eliminate the IC receivable/payable, translate consistently, with a
   transfer-pricing rate the tax module can test for arm's-length. Today: naive
   net-zero leaves unrealized profit in group inventory, IC balances inflate both
   sides of the BS, and there's no TP hook. Hits the three biggest gaps at once.
