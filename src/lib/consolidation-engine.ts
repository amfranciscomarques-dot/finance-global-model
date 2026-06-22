import { db } from '@/lib/db';
import {
  addEntry,
  aggregateFinancials,
  applyEliminations,
  applyOwnership,
  applyTransferPricing,
  assertBalanced,
  buildEliminationEntries,
  calculateKPIs,
  computeMinorityInterest,
  DEFAULT_BALANCE_TOLERANCE_EUR,
  convertToEUR,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveDefaultAssumptions,
  deriveIncomeStatement,
  marginFromMarkup,
  reclassifyMinorityEquity,
  getExchangeRate,
  IS_ACCOUNTS,
  projectMultiPeriod,
  translateForeignEntity,
  type EliminationEntry,
  type FinancialStatements,
  type ICSaleFlow,
  type ProjectionAssumptions,
  type TransferPricingPolicy,
} from '@/lib/finance';
import { aggregateDeferredTax, computeDeferredTax, getTaxProvider, reconcileGroupTax } from '@/lib/tax';

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
  // Booked deferred tax asset (AST-010), captured separately from the trial
  // balance so it can be reconciled against the IAS 12 computed position
  // (MEDIUM.8b). AST-010 otherwise rolls into otherNonCurrentAssets on the sheet.
  storedDeferredTaxAsset: number;
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
  let storedDeferredTaxAsset = 0;
  for (const entry of entries) {
    let amountEUR = entry.amountEUR;
    if (!amountEUR && entry.amountLocal) {
      amountEUR = convertToEUR(entry.amountLocal, entry.exchangeRateUsed || rate);
    }
    addEntry(stmts, entry.groupCOACode, amountEUR);
    // Capture the booked DTA (AST-010) before it rolls into otherNonCurrentAssets,
    // so the IAS 12 reconciliation can see it (MEDIUM.8b).
    if (entry.groupCOACode === 'AST-010') storedDeferredTaxAsset += amountEUR;
  }

  // Calculate derived IS fields + minority interest
  deriveIncomeStatement(is);
  is.minorityInterest = computeMinorityInterest(is, entity.consolidationMethod, entity.ownershipPercentage);

  // MEDIUM.6 — carve the minority's share of the subsidiary's OPENING equity out
  // to minority equity (one-shot, before deriveBalanceSheet). No-op for wholly
  // owned / non-full entities, so every EUR golden value is unchanged.
  reclassifyMinorityEquity(bs, entity.consolidationMethod, entity.ownershipPercentage);

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
    storedDeferredTaxAsset,
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

  // Booked DTA (AST-010) is a non-current asset → translated at the closing rate,
  // captured in EUR for the IAS 12 reconciliation (MEDIUM.8b).
  const storedDeferredTaxAsset = entries
    .filter((e) => e.groupCOACode === 'AST-010')
    .reduce((s, e) => s + e.amountLocal, 0) * closing;

  const { statements } = translateForeignEntity(stmts, { closing, average, historical });
  const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = statements;

  // Minority interest is computed on the translated IS, then re-folded into the
  // sheet. It is equity-neutral (shifts retained earnings ↔ minority equity), so
  // it leaves the CTA — already recognised by translateForeignEntity — intact.
  is.minorityInterest = computeMinorityInterest(is, entity.consolidationMethod, entity.ownershipPercentage);
  // MEDIUM.6 — carve the minority's share of opening equity out of the TRANSLATED
  // sheet. reclassifyMinorityEquity is equity-total-neutral (it scales share
  // capital, historical RE and the CTA down to the owned fraction and books the
  // remainder as minority equity), so the CTA raised by translateForeignEntity is
  // split proportionally rather than disturbed.
  reclassifyMinorityEquity(bs, entity.consolidationMethod, entity.ownershipPercentage);
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
    storedDeferredTaxAsset,
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
  deriveIncomeStatement(is); // re-derive netIncome from the new tax (single source)
  is.minorityInterest = computeMinorityInterest(is, ef.consolidationMethod, ef.ownershipPercentage);
  deriveBalanceSheet(ef.balanceSheet, is);
  deriveCashFlow(ef.cashFlow, is);
}

// IC transaction types that flow through the P&L and must be netted out of
// consolidated revenue/COGS. Loans and dividends are balance-sheet/equity
// flows — they are still flagged as eliminated, but never netted against
// revenue (the previous behaviour netted everything, corrupting the IS).
const PL_TRANSACTION_TYPES = new Set(['sale', 'purchase', 'service']);

// IC transaction types that move GOODS (and so can leave unrealized profit in the
// buyer's closing inventory). Services have no inventory, so they only net
// revenue/COGS — never trigger the inventory-profit elimination (MEDIUM.8b).
const GOODS_TRANSACTION_TYPES = new Set(['sale', 'purchase']);

// Group default transfer-pricing policy (MEDIUM.8b). Per-sale markup /
// closing-inventory fraction stored on an IntercompanyTransaction always win;
// this only supplies the fallback cost-plus markup used to SIZE the unrealized
// inventory profit when a goods sale carries no explicit margin. The default
// holding fraction is intentionally left unset, so a sale with no observed
// closing-inventory fraction generates NO unrealized profit — we never invent
// inventory the data does not show, keeping the demo golden numbers unchanged.
const DEFAULT_TRANSFER_PRICING_POLICY: TransferPricingPolicy = { defaultMarkup: 0.30 };

/**
 * Run intercompany eliminations.
 *
 * Idempotent: elimination flags are derived state, so each run first resets
 * them for the period/entities in scope and recomputes from scratch. (They
 * used to be flipped permanently, so a re-run of the same period found zero
 * pending transactions, skipped the netting, and overstated revenue.)
 */
async function runICEliminations(
  period: string,
  periodDate: Date,
  entityIds: string[],
  idToCode: Map<string, string>,
): Promise<{ entries: EliminationEntry[]; eliminationAmount: number; eliminationCount: number; dedupedCount: number; details: string[] }> {
  const details: string[] = [];
  // Intercompany flows captured from the DB, then handed to the pure elimination
  // module (src/lib/finance/eliminations.ts) which turns them into explicit,
  // auditable journal entries keyed on (period, counterpartyPair, account).
  const flows: ICSaleFlow[] = [];
  let totalElimination = 0; // P&L internal volume (positive); reported as -ve
  let count = 0;
  let dedupedCount = 0;
  const codeOf = (id: string): string => idToCode.get(id) ?? id;

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
      // An internal sale: the seller's revenue and the buyer's cost both gross up
      // the group P&L. The pure module de-grosses both (net-zero on EBITDA).
      const flow: ICSaleFlow = { seller: codeOf(tx.fromEntityId), buyer: codeOf(tx.toEntityId), revenue: tx.amountEUR };
      // For GOODS sales, also size the unrealized profit locked in the buyer's
      // closing inventory from the per-sale transfer-pricing metadata (MEDIUM.8b),
      // falling back to the group default policy for the margin. Services carry no
      // inventory, so they skip this. `totalElimination` is a REPORTING figure only
      // (the statements are adjusted solely via the elimination entries built from
      // `flows`), so adding the inventory overlay here cannot double-net revenue.
      if (GOODS_TRANSACTION_TYPES.has(tx.transactionType)) {
        if (tx.markup != null) flow.margin = marginFromMarkup(tx.markup);
        if (tx.closingInventoryFraction != null) flow.fractionInEndingInventory = tx.closingInventoryFraction;
        flows.push(applyTransferPricing(flow, DEFAULT_TRANSFER_PRICING_POLICY));
      } else {
        flows.push(flow);
      }
    }
    // Register the flow so the trial-balance path below cannot re-net it. We
    // register EVERY transaction type (not just P&L) so a loan/dividend captured
    // here also blocks its matched BS rows from being double-counted.
    eliminatedKeys.add(pairAmountKey(tx.fromEntityId, tx.toEntityId, tx.amountEUR));
    count++;
    details.push(`Eliminated: ${tx.transactionId} (${tx.transactionType}) €${tx.amountEUR.toFixed(0)}`);
  }

  // Process IC trial-balance entries that match on the SAME account code (the
  // P&L revenue/cost legs). Balance-sheet IC codes (AST-009 receivable / LIA-006
  // payable) match cross-code and are handled in the dedicated pass below.
  const icTrialBalances = await db.trialBalance.findMany({
    where: {
      period: periodDate,
      entityId: { in: entityIds },
      isIntercompany: true,
      eliminationStatus: 'pending',
      groupCOACode: { notIn: ['AST-009', 'LIA-006'] },
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
            flows.push({ seller: codeOf(tb.entityId), buyer: codeOf(tb.icPartnerEntityId), revenue: Math.abs(tb.amountEUR) });
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

  // MEDIUM.3 — balance-sheet IC elimination. Match each IC receivable (AST-009)
  // against the matching IC payable (LIA-006) on its counterparty and net both
  // off the consolidated sheet. The legs may sit at different FX rates for a
  // cross-border pair; the pure module routes that residual to the CTA.
  const icReceivables = await db.trialBalance.findMany({
    where: { period: periodDate, entityId: { in: entityIds }, groupCOACode: 'AST-009', isIntercompany: true },
  });
  for (const recv of icReceivables) {
    if (!recv.icPartnerEntityId) continue;
    const payable = await db.trialBalance.findFirst({
      where: {
        period: periodDate,
        entityId: recv.icPartnerEntityId,
        icPartnerEntityId: recv.entityId,
        groupCOACode: 'LIA-006',
        isIntercompany: true,
      },
    });
    if (!payable) continue;

    const key = 'BAL|' + pairAmountKey(recv.entityId, recv.icPartnerEntityId, recv.amountEUR);
    if (eliminatedKeys.has(key)) { dedupedCount++; continue; }
    eliminatedKeys.add(key);

    flows.push({
      seller: codeOf(recv.entityId),
      buyer: codeOf(recv.icPartnerEntityId),
      revenue: 0,
      openBalance: { receivable: recv.amountEUR, payable: Math.abs(payable.amountEUR) },
    });
    await db.trialBalance.update({
      where: { id: recv.id },
      data: { eliminationStatus: 'eliminated', eliminationGroup: `EG-${recv.id.substring(0, 8)}` },
    });
    await db.trialBalance.update({
      where: { id: payable.id },
      data: { eliminationStatus: 'eliminated', eliminationGroup: `EG-${recv.id.substring(0, 8)}` },
    });
    count++;
    details.push(`Eliminated IC balance: ${codeOf(recv.entityId)}↔${codeOf(recv.icPartnerEntityId)} €${recv.amountEUR.toFixed(0)}`);
  }

  const entries = buildEliminationEntries(period, flows);
  return { entries, eliminationAmount: -totalElimination, eliminationCount: count, dedupedCount, details };
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
  const idToCode = new Map(entities.map((e) => [e.id, e.code]));
  const eliminations = await runICEliminations(input.period, periodDate, entityIds, idToCode);

  // Aggregate all entity financials
  const aggregated = aggregateFinancials(entityFinancials);

  // Apply the elimination journal entries to the aggregated statements. The pure
  // module nets internal revenue/COGS (net-zero on EBITDA), removes unrealized
  // intra-group inventory profit, and nets IC receivable/payable off the sheet —
  // then re-derives every subtotal. Each entry is internally balanced, so the
  // balance check is preserved.
  const consolidated: FinancialStatements = {
    incomeStatement: { ...aggregated.incomeStatement },
    balanceSheet: { ...aggregated.balanceSheet },
    cashFlow: { ...aggregated.cashFlow },
  };
  applyEliminations(consolidated, eliminations.entries);
  const consolidatedIS = consolidated.incomeStatement;
  const consolidatedBS = consolidated.balanceSheet;
  const consolidatedCF = consolidated.cashFlow;

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

  // MEDIUM.8b — feed each entity's PRIOR-year closing loss / RFAI pools back as
  // this year's opening pools, so the tax chain (and the IAS 12 deferred tax
  // below) compounds across a multi-year run. Keyed per (entity, year-1,
  // scenario); absent for a first/standalone year, in which case the openings are
  // 0 and the result is identical to the pre-persistence behaviour (the demo has
  // no 2023 pools, so every golden value is unchanged).
  const priorCarryforwards = await db.taxCarryforward.findMany({
    where: { entityId: { in: entityIds }, year: year - 1, scenarioType: input.scenarioType },
  });
  const priorCfByEntityId = new Map(priorCarryforwards.map((c) => [c.entityId, c]));

  // B1/B2 — tax reconciliation: compare each entity's booked IRC against what its
  // jurisdiction provider models, summed per-entity (the correct basis for the
  // progressive derrama estadual). Informational: it does NOT change net income
  // on actuals, so every golden test stays green. `comparable` is false when any
  // entity hits an unmodelled-jurisdiction 0% provider (drift is meaningless then).
  // We pass the raw EBT as the taxable base (not max(0, EBT)) so a LOSS year feeds
  // the carried-forward NOL pool; for a profitable entity this equals max(0, EBT),
  // so modelled tax (and the golden drift) is unchanged.
  const taxReconciliation = reconcileGroupTax(
    entityFinancials.map((ef, i) => {
      const prior = priorCfByEntityId.get(entities[i].id);
      return {
        is: { ebt: ef.incomeStatement.ebt, taxExpense: ef.incomeStatement.taxExpense },
        provider: getTaxProvider(ef.countryCode),
        year,
        taxInput: {
          taxableIncome: ef.incomeStatement.ebt,
          ...(prior ? { nolOpening: prior.nolClosing, rfaiOpening: prior.rfaiClosing } : {}),
        },
      };
    }),
  );

  // MEDIUM.8b — deferred tax (IAS 12), surfaced additively alongside the tax
  // reconciliation (it never mutates booked actuals — same stance as B1/B4).
  // Each entity's loss/credit carryforwards are bridged to the deferred-tax asset
  // they represent (loss → DTA at the statutory rate; RFAI → DTA at face value),
  // measured at the reconciliation's baseRate, with the booked AST-010 taken as
  // the opening balance so the period movement (deferredTaxExpense) is exactly the
  // true-up that would bring the booked DTA onto the modelled basis. perEntity is
  // index-aligned with entityFinancials (reconcileGroupTax preserves order).
  //
  // On a single-period actual run no carryforwards are generated yet (that needs
  // opening pools fed back per year — PLAN MEDIUM.8b "carryforward persistence"),
  // so the computed DTA is 0 and `drift` simply exposes the unsubstantiated booked
  // AST-010. The computation goes dynamic automatically once openings are fed —
  // see deferred-tax.test.ts for the carryforward-driven cases.
  const deferredTaxPerEntity = entityFinancials.map((ef, i) => {
    const r = taxReconciliation.perEntity[i];
    const computed = computeDeferredTax({
      rate: r.baseRate,
      lossCarryforward: r.nolClosing,
      creditCarryforward: r.rfaiClosing,
      openingNetDTA: ef.storedDeferredTaxAsset,
    });
    return {
      entityCode: ef.entityCode,
      jurisdiction: r.jurisdiction,
      storedDTA: ef.storedDeferredTaxAsset,
      computed,
      drift: ef.storedDeferredTaxAsset - computed.netDeferredTaxAsset,
    };
  });
  const groupDeferredTax = aggregateDeferredTax(deferredTaxPerEntity.map((e) => e.computed));
  const storedDeferredTaxAsset = deferredTaxPerEntity.reduce((s, e) => s + e.storedDTA, 0);
  const deferredTax = {
    perEntity: deferredTaxPerEntity,
    group: groupDeferredTax,
    /** Booked DTA summed from the AST-010 trial-balance lines (EUR). */
    storedDTA: storedDeferredTaxAsset,
    /** IAS 12 net DTA computed from carryforwards + timing differences (EUR). */
    computedDTA: groupDeferredTax.netDeferredTaxAsset,
    /** Booked − computed: the deferred-tax position not yet substantiated by the model. */
    drift: storedDeferredTaxAsset - groupDeferredTax.netDeferredTaxAsset,
    /** False when any entity hit an unmodelled-jurisdiction provider (rate is 0 then). */
    comparable: taxReconciliation.comparable,
  };

  // MEDIUM.8b — each entity's CLOSING loss / RFAI pools for this year. runConsolidation
  // persists these (keyed per entity/year/scenario) so the next year's run feeds them
  // back as opening pools above. Index-aligned with entityFinancials/perEntity.
  const taxCarryforwards = entityFinancials.map((ef, i) => ({
    entityCode: ef.entityCode,
    year,
    nolClosing: taxReconciliation.perEntity[i].nolClosing,
    rfaiClosing: taxReconciliation.perEntity[i].rfaiClosing,
  }));

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
    eliminationEntries: eliminations.entries,            // explicit, auditable elimination journal entries (MEDIUM.5)
    taxReconciliation,                                   // engine stored IRC vs modelled (B1/B2)
    deferredTax,                                         // IAS 12 booked AST-010 vs computed DTA (MEDIUM.8b)
    taxCarryforwards,                                    // per-entity closing NOL/RFAI pools, persisted by runConsolidation (MEDIUM.8b)
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

  // MEDIUM.8b — persist each entity's closing loss / RFAI pools so the NEXT year's
  // run feeds them back as opening pools (compounding the tax chain and making the
  // IAS 12 deferred tax dynamic across a multi-year roll-forward). Upsert per
  // (entity, year, scenario) so re-running a period overwrites rather than duplicates.
  const cfEntities = await db.entity.findMany({
    where: { code: { in: input.entityCodes } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(cfEntities.map((e) => [e.code, e.id]));
  for (const cf of result.taxCarryforwards) {
    const entityId = idByCode.get(cf.entityCode);
    if (!entityId) continue;
    await db.taxCarryforward.upsert({
      where: { entityId_year_scenarioType: { entityId, year: cf.year, scenarioType: input.scenarioType } },
      update: { nolClosing: cf.nolClosing, rfaiClosing: cf.rfaiClosing },
      create: { entityId, year: cf.year, scenarioType: input.scenarioType, nolClosing: cf.nolClosing, rfaiClosing: cf.rfaiClosing },
    });
  }

  return { ...result, runId: run.id };
}

interface ConsolidationProjectionInput extends ConsolidationInput {
  /** Number of future periods (years) to roll the consolidated state forward. */
  years: number;
  /**
   * Optional per-period driver overrides layered on top of the steady-state set
   * derived from each period's opening (e.g. `{ revenueGrowthRate: 0.05 }`).
   */
  assumptionOverrides?: Partial<ProjectionAssumptions>;
}

/**
 * MEDIUM.7 — multi-period CONSOLIDATED roll-forward. Anchors on the consolidated
 * (IC-eliminated, FX-translated) closing state from {@link computeConsolidation},
 * then chains the pure projection kernel forward `years` periods. Each period's
 * opening retained earnings is linked to the prior period's closing by the kernel
 * (closing → next opening), and every projected sheet balances by construction.
 *
 * This differs from /api/forecast, which projects a raw sum of trial balances:
 * here the projected path inherits the eliminations and currency translation, so
 * the multi-period consolidated balance sheet is internally consistent. Read-only
 * — persists nothing.
 */
export async function projectConsolidation(input: ConsolidationProjectionInput) {
  const base = await computeConsolidation(input);
  const opening: FinancialStatements = {
    incomeStatement: { ...base.incomeStatement },
    balanceSheet: { ...base.balanceSheet },
    cashFlow: { ...base.cashFlow },
  };
  const periods = projectMultiPeriod(opening, input.years, (_periodIndex, state) => ({
    ...deriveDefaultAssumptions(state),
    ...input.assumptionOverrides,
  }));
  return { base, periods };
}
