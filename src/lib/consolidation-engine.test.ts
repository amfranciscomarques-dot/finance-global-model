import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { runConsolidation } from '@/lib/consolidation-engine';

// ============================================================
// GOLDEN-VALUE TESTS — lock the consolidation numbers so any refactor of the
// financial-domain logic is caught. The expected figures are derived by hand
// from the demo pack (src/lib/company-packs/template.ts), whose round numbers
// are chosen so every statement reconciles exactly.
//
// These run against an isolated DB (see src/test/setup-db.ts), re-seeded fresh
// here so intercompany-elimination flags start clean and results are
// deterministic across runs.
// ============================================================

const EUR = 0.01; // tolerance: numbers reconcile to the cent
const seed = () => seedCompanyPack(db, getCompanyPack('template')!, { reset: true });

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await db.$disconnect();
});

describe('runConsolidation — Meridian group, 2024-12 base', () => {
  it('reproduces the parent (MERID) standalone P&L and a balanced sheet', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    const merid = result.entityBreakdown.find((e) => e.entityCode === 'MERID');
    expect(merid).toBeDefined();

    // EBITDA / EBT / net income built up from the trial balance.
    expect(merid!.incomeStatement.ebitda).toBeCloseTo(5_000_000, 2);
    expect(merid!.incomeStatement.ebt).toBeCloseTo(2_000_000, 2);
    expect(merid!.incomeStatement.netIncome).toBeCloseTo(1_500_000, 2);

    // Balance sheet reconciles exactly.
    expect(Math.abs(merid!.balanceSheet.balanceCheck)).toBeLessThan(EUR);
  });

  it('anchors the subcontracting sub (MSUB) standalone net income to 250,000', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    const msub = result.entityBreakdown.find((e) => e.entityCode === 'MSUB');
    expect(msub).toBeDefined();
    expect(msub!.incomeStatement.netIncome).toBeCloseTo(250_000, 2);
    expect(msub!.incomeStatement.ebitda).toBeCloseTo(600_000, 2);
  });

  it('eliminates the MSUB→MERID intercompany volume net-zero on EBITDA', async () => {
    // Re-seed so IC flags are pending again (the previous runs marked them).
    await seed();

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // €6,000,000 + €1,500,000 of internal sales removed from group revenue,
    // with the matching cost removed from COGS → net-zero EBITDA impact.
    expect(result.eliminationsApplied).toBeCloseTo(-7_500_000, 2);

    // Consolidated EBITDA / net income are the sum of the standalone figures.
    expect(result.incomeStatement.ebitda).toBeCloseTo(5_600_000, 2);
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);

    // Group balance sheet still reconciles.
    expect(Math.abs(result.balanceSheet.balanceCheck)).toBeLessThan(EUR);

    // A reconciling sheet must be reported as a completed (not failed) run.
    expect(result.status).toBe('completed');
    expect(Math.abs(result.balanceCheck)).toBeLessThan(EUR);
  });

  it('FAILS the run and records the imbalance when a trial balance is broken (integrity gate)', async () => {
    // Re-seed so the book starts reconciled, then deliberately corrupt the
    // parent's trial balance: inflate cash with no matching liability/equity,
    // so assets no longer equal liabilities + equity. This is the demo moment —
    // the gate must refuse to mark a broken book as a completed run.
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    expect(merid).toBeDefined();

    const periodDate = new Date('2024-12-01');
    const cashRow = await db.trialBalance.findFirst({
      where: { entityId: merid!.id, period: periodDate, groupCOACode: 'AST-001' },
    });
    expect(cashRow).toBeDefined();

    const BREAK = 1_000_000; // EUR of phantom cash, balancing nothing
    await db.trialBalance.update({
      where: { id: cashRow!.id },
      data: { amountEUR: cashRow!.amountEUR + BREAK },
    });

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // The gate refuses to mark a broken book completed...
    expect(result.status).toBe('failed');
    // ...and surfaces the signed imbalance (≈ the phantom asset we injected).
    expect(result.balanceCheck).toBeCloseTo(BREAK, 2);

    // The persisted audit row records BOTH the failure and the imbalance, so the
    // break is auditable after the fact (not just transient in the response).
    const run = await db.consolidationRun.findUnique({ where: { id: result.runId } });
    expect(run?.status).toBe('failed');
    expect(run?.balanceCheck ?? 0).toBeCloseTo(BREAK, 2);

    // Restore the reconciled book for any later tests.
    await seed();
  });

  it('does not double-net an IC flow present in BOTH the transaction table and matched TB rows (TOP.3)', async () => {
    // Re-seed so the demo IC flows (MSUB→MERID services, €7,500,000) start clean.
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    const msub = await db.entity.findFirst({ where: { code: 'MSUB' } });
    const periodDate = new Date('2024-12-01');

    // The SAME €3,000,000 internal sale, recorded twice: once as an
    // IntercompanyTransaction and once as a bilaterally-matched IC trial-balance
    // pair (REV-003 on both legs, an IS account). Pre-TOP.3 the engine netted it
    // from BOTH sources → −13,500,000. With the (pair, amount) dedup it is netted
    // once → −10,500,000 (the €7,500,000 demo services + this €3,000,000 sale).
    await db.intercompanyTransaction.create({
      data: {
        transactionId: 'IC-TEST-DEDUP-2024',
        fromEntityId: merid!.id,
        toEntityId: msub!.id,
        amount: 3_000_000,
        currency: 'EUR',
        amountEUR: 3_000_000,
        transactionType: 'sale',
        matchingReference: 'IC-TEST-DEDUP-2024',
        period: periodDate,
        isEliminated: false,
      },
    });
    for (const [entityId, partnerId] of [[merid!.id, msub!.id], [msub!.id, merid!.id]] as const) {
      await db.trialBalance.create({
        data: {
          entityId,
          period: periodDate,
          periodType: 'actual',
          groupCOACode: 'REV-003',
          amountLocal: 3_000_000,
          amountEUR: 3_000_000,
          currency: 'EUR',
          isIntercompany: true,
          icPartnerEntityId: partnerId,
          eliminationStatus: 'pending',
        },
      });
    }

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    expect(result.eliminationsApplied).toBeCloseTo(-10_500_000, 2);
    expect(result.eliminationsDeduped).toBe(1);

    await seed(); // restore the clean book for later tests
  });

  it('is idempotent — re-running the same period yields identical numbers (regression)', async () => {
    // Elimination flags used to be flipped permanently, so a second run found
    // zero pending IC transactions and reported overstated revenue.
    await seed();

    const input = { period: '2024-12', entityCodes: ['MERID', 'MSUB'], scenarioType: 'base' };
    const first = await runConsolidation(input);
    const second = await runConsolidation(input);

    expect(second.eliminationsApplied).toBeCloseTo(first.eliminationsApplied, 2);
    expect(second.eliminationsApplied).toBeCloseTo(-7_500_000, 2);
    expect(second.incomeStatement.revenue).toBeCloseTo(first.incomeStatement.revenue, 2);
    expect(second.incomeStatement.ebitda).toBeCloseTo(5_600_000, 2);
    expect(second.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);
  });
});

describe('runConsolidation — tax reconciliation (B1/B2/B4)', () => {
  it('attaches an informational tax reconciliation without changing actual net income (B1)', async () => {
    await seed();
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // Net income on ACTUALS is untouched by reconciliation (golden value holds).
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);
    // PT group: stored 600,000 vs modelled 543,750 → +56,250 drift, comparable.
    expect(result.taxReconciliation.comparable).toBe(true);
    expect(result.taxReconciliation.drift).toBeCloseTo(56_250, 0);
  });

  it('flags the group non-comparable when an unmodelled jurisdiction is in scope (B2)', async () => {
    await seed();
    const de = await db.entity.create({
      data: {
        code: 'MDEU', legalName: 'Meridian Deutschland GmbH', countryCode: 'DE',
        localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Manufacturing',
      },
    });
    for (const [code, amt] of [['AST-001', 1_000_000], ['EQY-001', 1_000_000]] as const) {
      await db.trialBalance.create({
        data: {
          entityId: de.id, period: new Date('2024-12-01'), periodType: 'actual',
          groupCOACode: code, amountLocal: amt, amountEUR: amt, currency: 'EUR',
        },
      });
    }

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB', 'MDEU'],
      scenarioType: 'base',
    });
    expect(result.taxReconciliation.comparable).toBe(false);

    await seed(); // restore the clean book
  });

  it('replaces forecast tax with modelled IRC and keeps the group balanced (B4)', async () => {
    await seed();
    const base = await runConsolidation({ period: '2024-12', entityCodes: ['MERID', 'MSUB'], scenarioType: 'base' });
    const proj = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'optimistic',
      computeTaxForProjections: true,
    });

    // Modelled IRC (543,750) is lower than the booked 600,000 → higher net income.
    expect(proj.incomeStatement.netIncome).toBeGreaterThan(base.incomeStatement.netIncome);
    // After the override booked == modelled, so the drift collapses to ~0…
    expect(Math.abs(proj.taxReconciliation.drift)).toBeLessThan(1);
    // …and the incremental tax accrued as a payable keeps the sheet balanced.
    expect(proj.status).toBe('completed');
    expect(Math.abs(proj.balanceCheck)).toBeLessThan(1);
  });

  it('leaves forecast tax booked when the override flag is off (default)', async () => {
    await seed();
    const proj = await runConsolidation({ period: '2024-12', entityCodes: ['MERID', 'MSUB'], scenarioType: 'optimistic' });
    // No forecast rows → falls back to actuals; booked tax retained → same drift.
    expect(proj.taxReconciliation.drift).toBeCloseTo(56_250, 0);
  });
});
