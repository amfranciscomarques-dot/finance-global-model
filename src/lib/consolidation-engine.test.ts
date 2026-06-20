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
