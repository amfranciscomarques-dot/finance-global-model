# Roadmap — finance-global-model

Living roadmap for the multi-entity consolidation model. Phases are ordered by
**dependency and risk**, not just value: integrity guard rails first, then the
structural FX/IC corrections they protect, then forecasting and simulation.

Severity tags reference the findings in [`ARCHITECTURE_REVIEW.md`](./ARCHITECTURE_REVIEW.md).

Legend: `[ ]` planned · `[~]` in progress · `[x]` done

---

## Phase 0 — Integrity guard rails (do first, small & high-confidence)

These are cheap, covered by the existing Vitest golden tests, and protect every
later phase.

- [ ] **Enforce `balanceCheck`.** Add `assertBalanced(bs, tolerance)`; have
  `runConsolidation` set `status: 'failed'` and record the imbalance instead of
  always saving `completed`. *(Review #5)*
- [ ] **Fix proportional-method minority interest.** Proportional consolidation
  already scales by ownership, so MI should be 0; remove the phantom charge in
  `statements.ts:85`. *(Review #7)*
- [ ] **De-duplicate IC elimination sources.** Make the
  `intercompanyTransaction` path and the `trialBalance.isIntercompany` path
  mutually exclusive (shared key) so internal sales aren't netted twice.
  *(Review #2)*
- [ ] **Stop silent FX fallbacks.** `getExchangeRate` should not return `1.0` for
  an unknown currency, and `convertToEUR` should not return the unconverted
  amount on `rate === 0` — quarantine or throw. *(Review #8)*

## Phase 1 — Single source of truth (finish the refactor)

- [x] `src/lib/finance` domain module (account maps, statements, FX, KPIs).
- [x] Repoint `kpis` route and `consolidation-engine` onto `finance`.
- [ ] Repoint remaining routes off legacy prefix-matching math:
  `export/excel`, `export/pdf`, `scenarios/run`, `trends`, `variance`,
  `ai-chat`, `budget`. *(Review §4)*
- [ ] Have `scenarios/run` call `deriveIncomeStatement` / `deriveBalanceSheet`
  instead of hand-rolling subtotals (`route.ts:50-53,77-79`).

## Phase 2 — FX engine (IAS 21 compliance)

- [ ] Translate the income statement at the **average** rate, balance sheet at
  **closing**, equity/share capital at **historical**. *(Review #4)*
- [ ] Add a `ctaReserve` line to `BalanceSheetData` and `totalEquity`, computed
  as the residual that forces `balanceCheck → 0`.
- [ ] Refresh / source the static `FALLBACK_RATES` table and treat it as a
  last-resort, logged path.
- [ ] **Stress test:** loss-making USD subsidiary across a depreciating EUR with
  historical-rate share capital → non-zero CTA, BS still balances.
  *(Review edge case 1)*

## Phase 3 — Intercompany & consolidation depth

- [ ] Automate **balance-sheet IC elimination** (IC receivable/payable, IC
  loans: `AST-009`/`LIA-006`) instead of mapping them into "other". *(Review #3)*
- [ ] Eliminate **unrealized intra-group profit in inventory** (margin on
  unsold internal stock). *(Review #2 / §1)*
- [ ] Rework eliminations into explicit, auditable **elimination journal
  entries** keyed on `(period, counterpartyPair, account)`.
- [ ] Derive **minority equity** on the BS from ownership × subsidiary equity
  (not only stored `EQY-003`).
- [ ] **Multi-period roll-forward:** link opening retained earnings to prior
  closing; produce a multi-period consolidated balance sheet. *(Review §1.6)*

## Phase 4 — Tax engine wiring & cross-border rules

- [x] Pluggable tax providers (`PT` full IRC chain; `ES`/`US` flat-rate stubs).
- [ ] **Wire `getTaxProvider().computeTax()` into the engine for forecast
  periods** (keep passthrough only for stamped actuals). *(Review #6)*
- [ ] **NOL carryforward:** thread `nolOpening`/`nolClosing` through
  `TaxInput`/`TaxResult` so loss years shelter future profit. *(Review #6)*
- [ ] **Deferred tax** from book-vs-tax timing differences; drive `AST-010`
  (DTA) dynamically.
- [ ] **Transfer pricing:** a `TransferPricingPolicy` (arm's-length markup per IC
  relationship) consumed by both IC pricing and the inventory-profit
  elimination. *(Review #6)*
- [ ] Restore the PT SME reduced-rate parameters (`portugal.ts:46-48`).
- [ ] Per-jurisdiction tax view in the Compliance UI.
- [ ] **Stress test:** multi-year NOL with a pending RFAI credit overhang.
  *(Review edge case 2)*

## Phase 5 — Forecasting & debt waterfall

- [ ] Replace the fabricated `/api/forecast` (`forecast/route.ts:251` discards
  real data and returns demo arrays) with real projected statements.
  *(Review #1)*
- [ ] **Debt schedule + cash sweep** with interest on the **average** balance;
  resolve the cash↔interest circularity via controlled fixed-point iteration
  (`solveDebtSchedule`). *(Review §3.2)*
- [ ] **Pure projection kernel** `finance/project.ts`:
  `projectPeriod(openingState, assumptions) → ClosingState`, no DB. Basis for
  scenarios, forecasting, and simulation. *(Review refactor #1)*
- [ ] **Stress test:** cross-border IC sale with margin stuck in inventory at
  mixed FX rates. *(Review edge case 3)*

## Phase 6 — Simulation & scale

- [ ] Run scenarios/Monte Carlo through the in-memory kernel (no per-iteration
  DB round trips or `ConsolidationRun` persistence). *(Review §3.3)*
- [ ] Remove N+1 query / per-row `await` patterns in the engine and IC
  elimination loops.
- [ ] Evaluate integer-cents / decimal money representation to avoid float drift
  in multi-year runs. *(Review §4)*

## Phase 7 — Platform hardening (tracked, lower priority)

- [ ] Authentication / authorization on API routes (currently single-user).
- [ ] Resolve `next.config.ts` `ignoreBuildErrors: true` (zod v4
  `.errors`→`.issues` migration).

---

### Suggested next step

Start with **Phase 0** — all four items are small, high-confidence, and guarded
by `npm test`. `assertBalanced` (#5) and the proportional-MI fix (#7) in
particular are low-risk and unblock trustworthy FX work in Phase 2.
