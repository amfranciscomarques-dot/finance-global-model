import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { GET } from './route';

// Locks the /api/kpis output after repointing it onto @/lib/finance. Group
// totals are pre-elimination (the route's documented behaviour); the figures
// tie to the demo pack (src/lib/company-packs/template.ts).

beforeAll(async () => {
  await seedCompanyPack(db, getCompanyPack('template')!, { reset: true });
});

afterAll(async () => {
  await db.$disconnect();
});

function call(period: string) {
  const req = new Request(`http://localhost/api/kpis?period=${period}&scenarioType=base`);
  return GET(req as never);
}

describe('GET /api/kpis', () => {
  it('returns per-entity KPIs reconciling to the pack', async () => {
    const res = await call('2024-12');
    const body = await res.json();

    const merid = body.entityBreakdown.find((e: { entityCode: string }) => e.entityCode === 'MERID');
    expect(merid.revenue).toBe(41_500_000);
    expect(merid.ebitda).toBe(5_000_000);
    expect(merid.netIncome).toBe(1_500_000);

    const msub = body.entityBreakdown.find((e: { entityCode: string }) => e.entityCode === 'MSUB');
    expect(msub.ebitda).toBe(600_000);
    expect(msub.netIncome).toBe(250_000);
  });

  it('translates the USD subsidiary (MUSA) into EUR at the stored closing rate', async () => {
    const res = await call('2024-12');
    const body = await res.json();

    // The /api/kpis route reads the stored amountEUR (filled at the single
    // closing rate, 1.082, by the seeder). This is intentionally simpler than the
    // consolidation engine, which re-translates MUSA at three rates (IAS 21) and
    // raises a CTA — see fx-translation.engine.test.ts. Here MUSA's USD book
    // (revenue 10,000,000; EBITDA 1,300,000; net 450,000) scales uniformly.
    const musa = body.entityBreakdown.find((e: { entityCode: string }) => e.entityCode === 'MUSA');
    expect(musa.localCurrency).toBe('USD');
    expect(musa.revenue).toBe(Math.round(10_000_000 / 1.082));
    expect(musa.ebitda).toBe(Math.round(1_300_000 / 1.082));
    expect(musa.netIncome).toBe(Math.round(450_000 / 1.082));
  });

  it('returns naive (pre-elimination) group totals including the USD sub', async () => {
    const res = await call('2024-12');
    const body = await res.json();

    // Sum of entities, intercompany NOT eliminated here. EUR entities contribute
    // 49,000,000 / 5,600,000 / 1,750,000; MUSA adds its closing-rate EUR figures.
    expect(body.kpis.totalRevenue).toBe(49_000_000 + Math.round(10_000_000 / 1.082));
    expect(body.kpis.totalEBITDA).toBe(5_600_000 + Math.round(1_300_000 / 1.082));
    expect(body.kpis.netIncome).toBe(1_750_000 + Math.round(450_000 / 1.082));
  });
});
