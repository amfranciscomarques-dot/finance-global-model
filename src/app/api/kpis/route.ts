import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  addEntry,
  aggregateFinancials,
  applyOwnership,
  calculateKPIs,
  computeMinorityInterest,
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveCashFlow,
  deriveIncomeStatement,
  type FinancialStatements,
} from '@/lib/finance';

// Per-entity KPI summary + naive (pre-elimination) group totals.
// The COA→statement rollup and KPI math come from @/lib/finance so this stays
// in lockstep with the consolidation engine (see consolidation-engine.ts).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '2024-12';
    const scenarioType = searchParams.get('scenarioType') || 'base';

    const periodDate = new Date(period + '-01');

    const entities = await db.entity.findMany({ where: { isActive: true } });
    const entityCodes = entities.map((e) => e.code);

    // Get trial balances for all entities for the period
    const periodType = scenarioType === 'base' ? 'actual' : 'forecast';
    let entries = await db.trialBalance.findMany({
      where: { entityId: { in: entities.map((e) => e.id) }, period: periodDate, periodType },
    });
    // If no trial balances found, try any period type
    if (entries.length === 0) {
      entries = await db.trialBalance.findMany({
        where: { entityId: { in: entities.map((e) => e.id) }, period: periodDate },
      });
    }

    const entityStatements: FinancialStatements[] = [];
    const entityBreakdown = entities.map((entity) => {
      const stmts: FinancialStatements = {
        incomeStatement: createEmptyIS(),
        balanceSheet: createEmptyBS(),
        cashFlow: createEmptyCF(),
      };
      for (const entry of entries) {
        if (entry.entityId === entity.id) addEntry(stmts, entry.groupCOACode, entry.amountEUR);
      }

      if (entity.consolidationMethod === 'proportional') {
        applyOwnership(stmts, entity.ownershipPercentage);
      }
      const { incomeStatement: is, balanceSheet: bs, cashFlow: cf } = stmts;
      deriveIncomeStatement(is);
      is.minorityInterest = computeMinorityInterest(is, entity.consolidationMethod, entity.ownershipPercentage);
      deriveBalanceSheet(bs, is);
      deriveCashFlow(cf, is);
      entityStatements.push(stmts);

      const netIncome = is.netIncome + is.minorityInterest;
      const netDebt = bs.shortTermDebt + bs.longTermDebt - bs.cash;
      return {
        entityCode: entity.code,
        legalName: entity.legalName,
        localCurrency: entity.localCurrency,
        consolidationMethod: entity.consolidationMethod,
        ownershipPercentage: entity.ownershipPercentage,
        revenue: Math.round(is.revenue),
        ebitda: Math.round(is.ebitda),
        ebitdaMargin: is.revenue > 0 ? Math.round((is.ebitda / is.revenue) * 1000) / 10 : 0,
        netIncome: Math.round(netIncome),
        totalAssets: Math.round(bs.totalAssets),
        leverage: is.ebitda !== 0 ? Math.round((netDebt / is.ebitda) * 100) / 100 : 0,
        roe: bs.totalEquity !== 0 ? Math.round((netIncome / bs.totalEquity) * 1000) / 10 : 0,
      };
    });

    // Group totals are the simple sum of entities (no intercompany elimination —
    // that is the consolidation engine's job).
    const consolidated = aggregateFinancials(entityStatements);
    const k = calculateKPIs(consolidated.incomeStatement, consolidated.balanceSheet, consolidated.cashFlow);
    const kpis = {
      ...k,
      totalRevenue: Math.round(k.totalRevenue),
      totalEBITDA: Math.round(k.totalEBITDA),
      netIncome: Math.round(k.netIncome),
      totalAssets: Math.round(k.totalAssets),
    };

    return NextResponse.json({ kpis, entityBreakdown, period, scenarioType, entityCodes });
  } catch (error) {
    console.error('Error calculating KPIs:', error);
    return NextResponse.json({ error: 'Failed to calculate KPIs' }, { status: 500 });
  }
}
