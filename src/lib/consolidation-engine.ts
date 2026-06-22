import { db } from '@/lib/db';
import {
  addEntry,
  aggregateFinancials,
  applyOwnership,
  assertBalanced,
  calculateKPIs,
  computeMinorityInterest,
  DEFAULT_BALANCE_TOLERANCE_EUR,
  convertToEUR,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  getExchangeRate,
  IS_ACCOUNTS,
  translateForeignEntity,
  type FinancialStatements,
} from '@/lib/finance';
import { getTaxProvider, reconcileGroupTax } from '@/lib/tax';

// ============================================================
// CONSOLIDATION ENGINE
// Core logic for multi-company financial consolidation.
//
// The COA→statement mapping, currency conversion, statement derivation and KPI
// math all live in @/lib/finance (the single source of truth). This module
// orchestrates: fetch trial balances → build per-entity statements → eliminate
// intercompany flows → aggregate → persist the run.
// ============================================================

interface ConsolidationInput {
  period: string; // YYYY-MM
  entityCodes: string[];
  scenarioType: string;
  // B4: when true, forecast/budget periods (scenarioType !== 'base') have their
  // booked tax replaced by modelled IRC from the per-jurisdiction tax module.
  // Actuals are never touched (stored IRC is authoritative). Default false.
  computeTaxForProjections?: boolean;
}

// Maximum tolerated assets − (liabilities + equity) imbalance, in EUR, before a
// consolidation run is rejected. A broken balance sheet must surface as a FAILED
// run — never be silently "force-closed". The threshold lives in the finance
// domain (single source) so the gate and any other caller agree.
const BALANCE_CHECK_TOLERANCE_EUR = DEFAULT_BALANCE_TOLERANCE_EUR;

interface EntityFinancials extends FinancialStatements {
  entityCode: string;
  legalName: string;
  localCurrency: string;
  countryCode: string;
  ownershipPercentage: number;
  consolidationMethod: string;
}

/**
 * Build entity financials from trial balance entries
 */
async function buildEntityFinancials(
  entity: { id: string; code: string; legalName: string; localCurrency: string; countryCode: string; consolidationMethod: string; ownershipPercentage: number },
  periodDate: Date,
  scenarioType: string
): Promise<EntityFinancials> {
  const stmts: FinancialStatements = {
    incomeStatement: createEmptyIS(),
    balanceSheet: createEmptyBS(),
    cashFlow: createEmptyCF(),
  };

  const isForeign = entity.localCurrency !== 'EUR';

  // Fetch trial balance entries for this entity and period
  const periodType = scenarioType === 'base' ? 'actual' : 'forecast';
  let entries = await db.trialBalance.findMany({
    where: { entityId: entity.id, period: periodDate, periodType },
  });

  // If no trial balances found, try any period type
  if (entries.length === 0) {
    entries = await db.trialBalance.findMany({
      where: { entityId: entity.id, period: periodDate },
    });
  }

  // Foreign entities are assembled in their FUNCTIONAL currency and translated as
  // a whole sheet (IAS 21 current-rate method) below — translating at the line
  // level with a single rate would collapse the very FX gap the CTA captures.
  // EUR entities (functional = presentation) need no translation, so we keep the
  // original per-entry EUR path verbatim — this is why every golden test is
  // unaffected by the FX work.
  if (isForeign) {
    return buildForeignEntityFinancials(entity, stmts, entries, periodDate);
  }

  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = stmts;
  const rate = await getExchangeRate(entity.localCurrency, periodDate, 'closing');

  // Aggregate trial balance entries into financial statement line items
  for (const entry of entries) {
    let amountEUR = entry.amountEUR;
    if (!amountEUR && entry.amountLocal) {
      amountEUR = convertToEUR(entry.amountLocal, entry.exchangeRateUsed || rate);
    }
    addEntry(stmts, entry.groupCOACode, amountEUR);
  }

  // Calculate derived IS fields + minority interest
  deriveIncomeStatement(is);
  is.minorityInterest = computeMinorityInterest(is, entity.consolidationMethod, entity.ownershipPercentage);

  // Calculate derived BS + CF fields
  deriveBalanceSheet(bs, is);
  deriveCashFlow(cf, is);

  return {
    entityCode: entity.code,
    legalName: entity.legalName,
    localCurrency: entity.localCurrency,
    countryCode: entity.countryCode,
    ownershipPercentage: entity.ownershipPercentage,
    consolidationMethod: entity.consolidationMethod,
    incomeStatement: is,
    balanceSheet: bs,
    cashFlow: cf,
  };
}

/**
 * Assemble a non-EUR entity in its functional currency, then translate the whole
 * sheet into EUR via the IAS 21 current-rate method (IS at average, assets &
 * liabilities at closing, equity at historical), surfacing the FX residual as
 * the CTA. Each rate is resolved independently so a missing one fails loudly
 * (FxRateUnavailableError) rather than silently degrading to a single rate.
 */
async function buildForeignEntityFinancials(
  entity: { code: string; legalName: string; localCurrency: string; countryCode: string; consolidationMethod: string; ownershipPercentage: number },
  stmts: FinancialStatements,
  entries: Array<{ groupCOACode: string; amountLocal: number }>,
  periodDate: Date,
): Promise<EntityFinancials> {
  // Build the statements in the entity's functional currency.
  for (const entry of entries) {
    addEntry(stmts, entry.groupCOACode, entry.amountLocal);
  }

  // Proportional consolidation scales the local sheet before translation; doing
  // it first keeps the CTA proportional to the parent's share too.
  if (entity.consolidationMethod === 'proportional') {
    applyOwnership(stmts, entity.ownershipPercentage);
  }

  const [closing, average, historical] = await Promise.all([
    getExchangeRate(entity.localCurrency, periodDate, 'closing'),
    getExchangeRate(entity.localCurrency, periodDate, 'average'),
    getExchangeRate(entity.localCurrency, periodDate, 'historical'),
  ]);

  const { statements } = translateForeignEntity(stmts, { closing, average, historical });
  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = statements;

  // Minority interest is computed on the translated IS, then re-folded into the
  // sheet. It is equity-neutral (shifts retained earnings ↔ minority equity), so
  // it leaves the CTA — already recognised by translateForeignEntity — intact.
  is.minorityInterest = computeMinorityInterest(is, entity.consolidationMethod, entity.ownershipPercentage);
  deriveBalanceSheet(bs, is);
  deriveCashFlow(cf, is);

  return {
    entityCode: entity.code,
    legalName: entity.legalName,
    localCurrency: entity.localCurrency,
    countryCode: entity.countryCode,
    ownershipPercentage: entity.ownershipPercentage,
    consolidationMethod: entity.consolidationMethod,
    incomeStatement: is,
    balanceSheet: bs,
    cashFlow: cf,
  };
}

/**
 * B4 — replace an entity's booked tax with modelled IRC from its jurisdiction
 * provider (forecast/budget only). The incremental tax is accrued as a payable
 * (otherCurrentLiabilities) so the change in net income (→ equity) is offset and
 * the entity balance sheet still reconciles. Mutates `ef` in place.
 */
function applyModelledTax(ef: EntityFinancials, year: number): void {
  const is = ef.incomeStatement;
  const oldTaxExpense = is.taxExpense; // negative (engine convention)
  const modelled = getTaxProvider(ef.countryCode).computeTax({
    taxableIncome: Math.max(0, is.ebt),
    year,
  }).totalTax; // positive
  const newTaxExpense = -modelled;

  // additionalTax > 0 ⇒ modelled tax exceeds booked; accrue it as a payable.
  const additionalTax = oldTaxExpense - newTaxExpense;
  ef.balanceSheet.otherCurrentLiabilities += additionalTax;

  is.taxExpense = newTaxExpense;
  is.netIncome = is.ebt + is.taxExpense;
  is.minorityInterest = computeMinorityInterest(is, ef.consolidationMethod, ef.ownershipPercentage);
  deriveBalanceSheet(ef.balanceSheet, is);
  deriveCashFlow(ef.cashFlow, is);
}

// IC transaction types that flow through the P&L and must be netted out of
// consolidated revenue/COGS. Loans and dividends are balance-sheet/equity
// flows — they are still flagged as eliminated, but never netted against
// revenue (the previous behaviour netted everything, corrupting the IS).
const PL_TRANSACTION_TYPES = new Set(['sale', 'purchase', 'service']);

/**
 * Run intercompany eliminations.
 *
 * Idempotent: elimination flags are derived state, so each run first resets
 * them for the period/entities in scope and recomputes from scratch. (They
 * used to be flipped permanently, so a re-run of the same period found zero
 * pending transactions, skipped the netting, and overstated revenue.)
 */
async function runICEliminations(
  periodDate: Date,
  entityIds: string[]
): Promise<{ eliminationAmount: number; eliminationCount: number; dedupedCount: number; details: string[] }> {
  const details: string[] = [];
  let totalElimination = 0;
  let count = 0;
  let dedupedCount = 0;

  // De-duplication key (TOP.3). IC flows can arrive from TWO independent sources:
  // the IntercompanyTransaction table and bilaterally-matched IC trial-balance
  // rows. Nothing in the schema links the two, so the same internal sale present
  // in both would be netted twice. We key each eliminated flow on its unordered
  // entity pair + rounded EUR amount; the transaction path registers its keys
  // first, and the trial-balance path skips any flow already seen.
  const eliminatedKeys = new Set<string>();
  const pairAmountKey = (a: string, b: string, amount: number): string =>
    [a, b].sort().join('~') + '|' + Math.round(Math.abs(amount));

  // Reset derived elimination state for this scope so the run is repeatable
  await db.intercompanyTransaction.updateMany({
    where: { period: periodDate, fromEntityId: { in: entityIds }, toEntityId: { in: entityIds } },
    data: { isEliminated: false },
  });
  await db.trialBalance.updateMany({
    where: { period: periodDate, entityId: { in: entityIds }, isIntercompany: true },
    data: { eliminationStatus: 'pending', eliminationGroup: null },
  });

  // Find matched IC transactions for this period
  const icTransactions = await db.intercompanyTransaction.findMany({
    where: {
      period: periodDate,
      fromEntityId: { in: entityIds },
      toEntityId: { in: entityIds },
      isEliminated: false,
    },
  });

  // Mark matched pairs as eliminated
  for (const tx of icTransactions) {
    await db.intercompanyTransaction.update({
      where: { id: tx.id },
      data: { isEliminated: true },
    });
    if (PL_TRANSACTION_TYPES.has(tx.transactionType)) {
      totalElimination += tx.amountEUR;
    }
    // Register the flow so the trial-balance path below cannot re-net it. We
    // register EVERY transaction type (not just P&L) so a loan/dividend captured
    // here also blocks its matched BS rows from being double-counted.
    eliminatedKeys.add(pairAmountKey(tx.fromEntityId, tx.toEntityId, tx.amountEUR));
    count++;
    details.push(`Eliminated: ${tx.transactionId} (${tx.transactionType}) €${tx.amountEUR.toFixed(0)}`);
  }

  // Also process IC trial balance entries
  const icTrialBalances = await db.trialBalance.findMany({
    where: {
      period: periodDate,
      entityId: { in: entityIds },
      isIntercompany: true,
      eliminationStatus: 'pending',
    },
  });

  for (const tb of icTrialBalances) {
    if (tb.icPartnerEntityId) {
      const matching = await db.trialBalance.findFirst({
        where: {
          period: periodDate,
          entityId: tb.icPartnerEntityId,
          groupCOACode: tb.groupCOACode,
          isIntercompany: true,
          eliminationStatus: 'pending',
        },
      });

      if (matching) {
        // Mark both legs eliminated regardless of dedup, so the audit trail is
        // consistent (the flow IS eliminated — the only question is which source
        // already netted it).
        await db.trialBalance.update({
          where: { id: tb.id },
          data: { eliminationStatus: 'eliminated', eliminationGroup: `EG-${tb.id.substring(0, 8)}` },
        });
        await db.trialBalance.update({
          where: { id: matching.id },
          data: { eliminationStatus: 'eliminated', eliminationGroup: `EG-${tb.id.substring(0, 8)}` },
        });

        const key = pairAmountKey(tb.entityId, tb.icPartnerEntityId, tb.amountEUR);
        if (eliminatedKeys.has(key)) {
          // Same flow already netted via the IntercompanyTransaction path — do
          // NOT net or count it again (TOP.3). The rows are still flagged above.
          dedupedCount++;
          details.push(
            `Skipped (already eliminated via IC transaction): ${tb.groupCOACode} €${Math.abs(tb.amountEUR).toFixed(0)}`,
          );
        } else {
          eliminatedKeys.add(key);
          // Only P&L codes are netted against revenue/COGS; matched BS balances
          // (IC receivable/payable) must not distort the income statement.
          if (IS_ACCOUNTS[tb.groupCOACode]) {
            totalElimination += Math.abs(tb.amountEUR);
          }
          count++;
        }
      } else {
        await db.trialBalance.update({
          where: { id: tb.id },
          data: { eliminationStatus: 'matched' },
        });
      }
    }
  }

  return { eliminationAmount: -totalElimination, eliminationCount: count, dedupedCount, details };
}

/**
 * Main consolidation function
 */
/**
 * Compute a full consolidation (per-entity statements + IC-eliminated group
 * statements + KPIs) WITHOUT persisting anything. This is the reusable core:
 * read-only callers (the Excel/PDF exporters) use it so they don't pollute the
 * audit trail with a ConsolidationRun row on every download. `runConsolidation`
 * wraps this and persists the run.
 */
export async function computeConsolidation(input: ConsolidationInput) {
  const startTime = Date.now();
  const periodDate = new Date(input.period + '-01');

  // Fetch entities
  const entities = await db.entity.findMany({
    where: { code: { in: input.entityCodes }, isActive: true },
  });

  if (entities.length === 0) {
    throw new Error('No active entities found for the given codes');
  }

  const year = parseInt(input.period.slice(0, 4), 10);

  // Build financials for each entity (with currency conversion)
  const entityFinancials: EntityFinancials[] = [];
  for (const entity of entities) {
    const financials = await buildEntityFinancials(entity, periodDate, input.scenarioType);
    // B4: forecast/budget tax can be modelled from the jurisdiction provider
    // (opt-in). Actuals keep their authoritative booked IRC.
    if (input.computeTaxForProjections && input.scenarioType !== 'base') {
      applyModelledTax(financials, year);
    }
    entityFinancials.push(financials);
  }

  // Run IC eliminations
  const entityIds = entities.map((e) => e.id);
  const eliminations = await runICEliminations(periodDate, entityIds);

  // Aggregate all entity financials
  const aggregated = aggregateFinancials(entityFinancials);

  // Apply elimination adjustments
  // IC eliminations reduce both sides (revenue/expense and receivable/payable) equally
  const consolidatedIS = { ...aggregated.incomeStatement };
  const consolidatedBS = { ...aggregated.balanceSheet };
  const consolidatedCF = { ...aggregated.cashFlow };

  // Apply IC elimination. For sale/service/purchase the internal sale must be
  // removed from group revenue AND the matching internal cost removed from group
  // expenses — a net-zero EBITDA impact. (The previous 50/50 split reduced
  // revenue and *increased* cost, double-penalising EBITDA.)
  // eliminations.eliminationAmount is negative (= -internal volume).
  if (eliminations.eliminationAmount !== 0) {
    const internalVolume = -eliminations.eliminationAmount; // positive
    consolidatedIS.revenue -= internalVolume;
    consolidatedIS.cogs += internalVolume; // COGS stored negative → reduces internal cost
    // No balance-sheet adjustment here: these are P&L flows already settled in
    // cash. IC loans/balances would be eliminated via matched IC trial-balance
    // entries (eliminationStatus) instead.
  }

  // Recalculate all derived fields after eliminations
  deriveIncomeStatement(consolidatedIS);
  deriveBalanceSheet(consolidatedBS, consolidatedIS);

  // Balance-sheet integrity gate (IFRS: assets must equal liabilities + equity).
  // If the consolidated sheet does not reconcile within tolerance the run is
  // FAILED — we report the numbers and the break, but never pretend it closed.
  const { balanced, imbalance: balanceCheck } = assertBalanced(
    consolidatedBS,
    BALANCE_CHECK_TOLERANCE_EUR,
  );
  const status = balanced ? 'completed' : 'failed';

  // Calculate KPIs
  const kpis = calculateKPIs(consolidatedIS, consolidatedBS, consolidatedCF);

  // B1/B2 — tax reconciliation: compare each entity's booked IRC against what its
  // jurisdiction provider models, summed per-entity (the correct basis for the
  // progressive derrama estadual). Informational: it does NOT change net income
  // on actuals, so every golden test stays green. `comparable` is false when any
  // entity hits an unmodelled-jurisdiction 0% provider (drift is meaningless then).
  const taxReconciliation = reconcileGroupTax(
    entityFinancials.map((ef) => ({
      is: { ebt: ef.incomeStatement.ebt, taxExpense: ef.incomeStatement.taxExpense },
      provider: getTaxProvider(ef.countryCode),
      year,
    })),
  );

  const processingTimeMs = Date.now() - startTime;

  return {
    period: input.period,
    entities: input.entityCodes,
    scenario: input.scenarioType,
    status,
    balanceCheck,
    incomeStatement: consolidatedIS,
    balanceSheet: consolidatedBS,
    cashFlow: consolidatedCF,
    kpis,
    eliminationsApplied: eliminations.eliminationAmount, // signed internal volume removed
    eliminationsCount: eliminations.eliminationCount,    // number of IC flows eliminated
    eliminationsDeduped: eliminations.dedupedCount,      // IC flows skipped as already eliminated (TOP.3)
    taxReconciliation,                                   // engine stored IRC vs modelled (B1/B2)
    entityBreakdown: entityFinancials.map((ef) => ({
      entityCode: ef.entityCode,
      legalName: ef.legalName,
      localCurrency: ef.localCurrency,
      ownershipPercentage: ef.ownershipPercentage,
      consolidationMethod: ef.consolidationMethod,
      incomeStatement: ef.incomeStatement,
      balanceSheet: ef.balanceSheet,
      cashFlow: ef.cashFlow,
    })),
    eliminationDetails: eliminations.details,
    processingTimeMs,
  };
}

/**
 * Run a consolidation and persist it as a ConsolidationRun audit record.
 * Thin wrapper over {@link computeConsolidation} — use this for the actual
 * consolidation action; use computeConsolidation for read-only reporting.
 */
export async function runConsolidation(input: ConsolidationInput) {
  const result = await computeConsolidation(input);

  const run = await db.consolidationRun.create({
    data: {
      period: new Date(input.period + '-01'),
      entityCodes: JSON.stringify(input.entityCodes),
      scenarioType: input.scenarioType,
      status: result.status,
      balanceCheck: result.balanceCheck,
      // B3: persist the tax drift only when comparable (no unmodelled jurisdiction);
      // otherwise leave it null so a 0 is never read as "no divergence".
      taxDriftEUR: result.taxReconciliation.comparable ? result.taxReconciliation.drift : null,
      taxComparable: result.taxReconciliation.comparable,
      eliminationsApplied: result.eliminationsCount,
      totalRevenue: result.kpis.totalRevenue,
      totalEBITDA: result.kpis.totalEBITDA,
      totalNetIncome: result.kpis.netIncome,
      totalAssets: result.kpis.totalAssets,
      netDebt: result.kpis.netDebt,
      ebitdaMargin: result.kpis.ebitdaMargin,
      leverage: result.kpis.leverage,
      processingTimeMs: result.processingTimeMs,
    },
  });

  return { ...result, runId: run.id };
}
