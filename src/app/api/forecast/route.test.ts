import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { GET, POST } from './route';

// ============================================================
// /api/forecast — driver-based projection (MEDIUM.2 + MEDIUM.10).
//
// The route now anchors on the real year-end actuals and chains the pure
// projection kernel (finance/project.ts) forward, returning full balanced
// IS/BS/CF per year alongside the monthly cash-flow chart. These tests pin that
// the projection is real (balances, compounds, responds to assumptions) rather
// than a fabricated run-rate.
// ============================================================

beforeAll(async () => {
  await seedCompanyPack(db, getCompanyPack('template')!, { reset: true });
});

afterAll(async () => {
  await db.$disconnect();
});

const getReq = (path: string) => new Request(`http://localhost/api${path}`) as never;
function post(body: unknown) {
  return POST(new Request('http://localhost/api/forecast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never);
}

describe('GET /api/forecast', () => {
  it('returns a multi-year projection of full, balanced statements', async () => {
    const res = await GET(getReq('/forecast?period=2024-12'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.projection).toBeDefined();
    expect(body.projection.years).toHaveLength(3);

    // Every projected year's balance sheet reconciles (cash is the kernel plug).
    for (const y of body.projection.years) {
      expect(Math.abs(y.balanceSheet.balanceCheck)).toBeLessThan(1);
    }

    // Revenue compounds at the default +5% growth across the chained years.
    const [y1, y2, y3] = body.projection.years;
    expect(y2.incomeStatement.revenue).toBeCloseTo(y1.incomeStatement.revenue * 1.05, 0);
    expect(y3.incomeStatement.revenue).toBeCloseTo(y2.incomeStatement.revenue * 1.05, 0);
  });

  it('ties the month-12 cumulative cash to the projected year-1 balance sheet', async () => {
    const res = await GET(getReq('/forecast?period=2024-12'));
    const body = await res.json();

    const lastMonth = body.periods[body.periods.length - 1];
    expect(lastMonth.cumulativeCash).toBe(Math.round(body.projection.years[0].balanceSheet.cash));
  });

  it('orders the scenario comparison optimistic > base > pessimistic', async () => {
    const res = await GET(getReq('/forecast?period=2024-12'));
    const body = await res.json();

    const { optimistic, base, pessimistic } = body.scenarioComparison;
    expect(optimistic.totalNetChange).toBeGreaterThan(base.totalNetChange);
    expect(base.totalNetChange).toBeGreaterThan(pessimistic.totalNetChange);
  });
});

describe('POST /api/forecast', () => {
  it('responds to a higher revenue-growth assumption with higher projected revenue', async () => {
    const lowRes = await post({ period: '2024-12', revenueGrowthRate: 2 });
    const highRes = await post({ period: '2024-12', revenueGrowthRate: 15 });
    const low = await lowRes.json();
    const high = await highRes.json();

    expect(high.data.projection.years[0].incomeStatement.revenue)
      .toBeGreaterThan(low.data.projection.years[0].incomeStatement.revenue);
    // Still balanced under the flexed assumption.
    expect(Math.abs(high.data.projection.years[0].balanceSheet.balanceCheck)).toBeLessThan(1);
  });
});
