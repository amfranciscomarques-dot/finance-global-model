import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { POST } from './route';

// Regression tests for /api/scenarios/run. The route was rewritten to anchor on
// ONE base consolidation and layer the scenario's growth factors arithmetically
// (the old version double-ran the engine, hard-coded a 25% tax rate, and applied
// ×10 interest / FX hacks that broke the balance sheet). These tests pin the new
// behaviour: base-case is a no-op, growth scales revenue, the base effective tax
// rate is preserved, and the projected balance sheet still balances.

const ENTITIES = ['MERID', 'MESP', 'MSUB', 'MUSA'];
let baseScenarioId: string;
let growthScenarioId: string;

beforeAll(async () => {
  await seedCompanyPack(db, getCompanyPack('template')!, { reset: true });
  const base = await db.scenario.create({
    data: { name: 'Test No-Op', scenarioType: 'base', revenueGrowthFactor: 1.0, opexGrowthFactor: 1.0, capexGrowthFactor: 1.0 },
  });
  baseScenarioId = base.id;
  const growth = await db.scenario.create({
    data: { name: 'Test Revenue +10%', scenarioType: 'optimistic', revenueGrowthFactor: 1.1, opexGrowthFactor: 1.0, capexGrowthFactor: 1.0 },
  });
  growthScenarioId = growth.id;
});

afterAll(async () => {
  await db.$disconnect();
});

function call(body: unknown) {
  const req = new Request('http://localhost/api/scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req as never);
}

describe('POST /api/scenarios/run', () => {
  it('treats an all-1.0 scenario as a no-op vs the base consolidation', async () => {
    const res = await call({ scenarioId: baseScenarioId, basePeriod: '2024-12', entityCodes: ENTITIES });
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.scenarioResult.kpis.totalRevenue).toBeCloseTo(body.baseResult.kpis.totalRevenue, 2);
    expect(body.scenarioResult.incomeStatement.netIncome).toBeCloseTo(body.baseResult.incomeStatement.netIncome, 2);
    // Balanced roll-forward: assets = liabilities + equity to the cent.
    expect(Math.abs(body.scenarioResult.balanceSheet.balanceCheck)).toBeLessThan(1);
  });

  it('scales revenue by the growth factor and preserves the base effective tax rate, staying balanced', async () => {
    const res = await call({ scenarioId: growthScenarioId, basePeriod: '2024-12', entityCodes: ENTITIES });
    expect(res.status).toBe(201);
    const body = await res.json();

    // Revenue scales 1.10×; EBITDA rises because opex is held flat.
    expect(body.scenarioResult.kpis.totalRevenue).toBeCloseTo(body.baseResult.kpis.totalRevenue * 1.1, 1);
    expect(body.scenarioResult.kpis.totalEBITDA).toBeGreaterThan(body.baseResult.kpis.totalEBITDA);

    // Effective tax rate (tax / EBT) preserved from the base run, not hard-coded.
    const b = body.baseResult.incomeStatement;
    const s = body.scenarioResult.incomeStatement;
    expect(s.taxExpense / s.ebt).toBeCloseTo(b.taxExpense / b.ebt, 6);

    // Projected balance sheet still reconciles.
    expect(Math.abs(body.scenarioResult.balanceSheet.balanceCheck)).toBeLessThan(1);
  });

  it('returns 404 for an unknown scenario id', async () => {
    const res = await call({ scenarioId: 'does-not-exist', basePeriod: '2024-12', entityCodes: ENTITIES });
    expect(res.status).toBe(404);
  });

  it('rejects an empty entity list', async () => {
    const res = await call({ scenarioId: baseScenarioId, basePeriod: '2024-12', entityCodes: [] });
    expect(res.status).toBe(400);
  });
});
