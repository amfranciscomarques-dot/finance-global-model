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

  it('returns naive (pre-elimination) group totals', async () => {
    const res = await call('2024-12');
    const body = await res.json();

    // Sum of entities, intercompany NOT eliminated here.
    expect(body.kpis.totalRevenue).toBe(49_000_000);
    expect(body.kpis.totalEBITDA).toBe(5_600_000);
    expect(body.kpis.netIncome).toBe(1_750_000);
  });
});
