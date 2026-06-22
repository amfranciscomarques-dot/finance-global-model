import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { runConsolidation } from '@/lib/consolidation-engine';

// ============================================================
// FX TRANSLATION — ENGINE INTEGRATION
//
// Meridian USA (MUSA) ships with a locally-balanced USD book (see the demo pack,
// template.ts → MUSA_2024). Consolidated with the EUR parent, the engine must
// translate MUSA at three rates (IS at average 1.079, assets/liabilities at
// closing 1.082, contributed equity at historical 1.104), raise the resulting
// Cumulative Translation Adjustment, and STILL produce a group sheet that
// reconciles — proving the FX residual lands in equity, not in a broken run.
//
//   USD book: EBITDA 1,300,000 · Net 450,000 · Assets 8,000,000
//   Translated CTA ≈ €54,095.61 (the worked example in the README).
// ============================================================

const seed = () => seedCompanyPack(db, getCompanyPack('template')!, { reset: true });

// Translation rates from the demo pack (coa-data.ts EXCHANGE_RATES).
const USD = { closing: 1.082, average: 1.079, historical: 1.104 } as const;
const EXPECTED_CTA = 54_095.61;

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await db.$disconnect();
});

describe('runConsolidation with a foreign (USD) subsidiary', () => {
  it('translates MUSA at three rates, raises a CTA, and keeps the entity balanced', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB', 'MUSA'],
      scenarioType: 'base',
    });

    const musa = result.entityBreakdown.find((e) => e.entityCode === 'MUSA');
    expect(musa).toBeDefined();

    // Income at the average rate, assets at the closing rate, equity at historical.
    expect(musa!.incomeStatement.netIncome).toBeCloseTo(450_000 / USD.average, 1);
    expect(musa!.balanceSheet.totalAssets).toBeCloseTo(8_000_000 / USD.closing, 1);
    expect(musa!.balanceSheet.shareCapital).toBeCloseTo(2_000_000 / USD.historical, 1);
    expect(musa!.balanceSheet.cta).toBeCloseTo(EXPECTED_CTA, 1);
    expect(Math.abs(musa!.balanceSheet.balanceCheck)).toBeLessThan(0.01);
  });

  it('carries the CTA into the consolidated sheet and still reconciles → completed', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB', 'MUSA'],
      scenarioType: 'base',
    });

    // Only MUSA contributes a CTA (the EUR entities translate at 1.0 → 0).
    expect(result.balanceSheet.cta).toBeCloseTo(EXPECTED_CTA, 1);

    // The group sheet reconciles within tolerance, so the run is completed.
    expect(Math.abs(result.balanceCheck)).toBeLessThan(1);
    expect(result.status).toBe('completed');
  });

  it('does not disturb the EUR entities — MERID/MSUB net income is unchanged', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB', 'MUSA'],
      scenarioType: 'base',
    });

    const merid = result.entityBreakdown.find((e) => e.entityCode === 'MERID');
    const msub = result.entityBreakdown.find((e) => e.entityCode === 'MSUB');
    expect(merid!.incomeStatement.netIncome).toBeCloseTo(1_500_000, 2);
    expect(merid!.balanceSheet.cta).toBe(0);
    expect(msub!.incomeStatement.netIncome).toBeCloseTo(250_000, 2);
    expect(msub!.balanceSheet.cta).toBe(0);
  });
});
