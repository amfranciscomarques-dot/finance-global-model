import { db } from '@/lib/db';
import {
  addEntry,
  aggregateFinancials,
  applyOwnership,
  calculateKPIs,
  computeMinorityInterest,
  convertToEUR,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  getExchangeRate,
  IS_ACCOUNTS,
  type FinancialStatements,
} from '@/lib/finance';

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
}

// Maximum tolerated assets − (liabilities + equity) imbalance, in EUR, before a
// consolidation run is rejected. The book reconciles to the cent, so anything
// above a euro is a genuine accounting break, not floating-point noise. A broken
// balance sheet must surface as a FAILED run — never be silently "force-closed".
const BALANCE_CHECK_TOLERANCE_EUR = 1.0;

interface EntityFinancials extends FinancialStatements {
  entityCode: string;
  legalName: string;
  localCurrency: string;
  ownershipPercentage: number;
  consolidationMethod: string;
}

/**
 * Build entity financials from trial balance entries
 */
async function buildEntityFinancials(
  entity: { id: string; code: string; legalName: string; localCurrency: string; consolidationMethod: string; ownershipPercentage: number },
  periodDate: Date,
  scenarioType: string
): Promise<EntityFinancials> {
  const stmts: FinancialStatements = {
    incomeStatement: createEmptyIS(),
    balanceSheet: createEmptyBS(),
    cashFlow: createEmptyCF(),
  };
  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = stmts;

  // Get exchange rate
  const rate = await getExchangeRate(entity.localCurrency, periodDate, 'closing');

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

  // Aggregate trial balance entries into financial statement line items
  for (const entry of entries) {
    let amountEUR = entry.amountEUR;
    if (!amountEUR && entry.amountLocal) {
      amountEUR = convertToEUR(entry.amountLocal, entry.exchangeRateUsed || rate);
    }
    addEntry(stmts, entry.groupCOACode, amountEUR);
  }

  // Apply ownership percentage for proportional consolidation
  if (entity.consolidationMethod === 'proportional') {
    applyOwnership(stmts, entity.ownershipPercentage);
  }

  // Calculate derived IS fields + minority interest
  deriveIncomeStatement(is);
  is.minorityInterest = computeMinorityInterest(is, entity.consolidationMethod, entity.ownershipPercentage);

  // Calculate derived BS + CF fields
  deriveBalanceSheet(bs);
  deriveCashFlow(cf, is);

  return {
    entityCode: entity.code,
    legalName: entity.legalName,
    localCurrency: entity.localCurrency,
    ownershipPercentage: entity.ownershipPercentage,
    consolidationMethod: entity.consolidationMethod,
    incomeStatement: is,
    balanceSheet: bs,
    cashFlow: cf,
  };
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
): Promise<{ eliminationAmount: number; eliminationCount: number; details: string[] }> {
  const details: string[] = [];
  let totalElimination = 0;
  let count = 0;

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
        await db.trialBalance.update({
          where: { id: tb.id },
          data: { eliminationStatus: 'eliminated', eliminationGroup: `EG-${tb.id.substring(0, 8)}` },
        });
        await db.trialBalance.update({
          where: { id: matching.id },
          data: { eliminationStatus: 'eliminated', eliminationGroup: `EG-${tb.id.substring(0, 8)}` },
        });
        // Only P&L codes are netted against revenue/COGS; matched BS balances
        // (IC receivable/payable) must not distort the income statement.
        if (IS_ACCOUNTS[tb.groupCOACode]) {
          totalElimination += Math.abs(tb.amountEUR);
        }
        count++;
      } else {
        await db.trialBalance.update({
          where: { id: tb.id },
          data: { eliminationStatus: 'matched' },
        });
      }
    }
  }

  return { eliminationAmount: -totalElimination, eliminationCount: count, details };
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

  // Build financials for each entity (with currency conversion)
  const entityFinancials: EntityFinancials[] = [];
  for (const entity of entities) {
    const financials = await buildEntityFinancials(entity, periodDate, input.scenarioType);
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
  deriveBalanceSheet(consolidatedBS);

  // Balance-sheet integrity gate (IFRS: assets must equal liabilities + equity).
  // If the consolidated sheet does not reconcile within tolerance the run is
  // FAILED — we report the numbers and the break, but never pretend it closed.
  const balanceCheck = consolidatedBS.balanceCheck;
  const isBalanced = Math.abs(balanceCheck) <= BALANCE_CHECK_TOLERANCE_EUR;
  const status = isBalanced ? 'completed' : 'failed';

  // Calculate KPIs
  const kpis = calculateKPIs(consolidatedIS, consolidatedBS, consolidatedCF);

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
