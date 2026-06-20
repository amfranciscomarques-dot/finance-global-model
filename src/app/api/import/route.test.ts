import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { POST } from './route';

// Regression tests for /api/import: non-EUR amounts used to be stored 1:1 as
// EUR (no FX conversion), and the history dateRange did numeric Math.min on
// "YYYY-MM" strings → "NaN to NaN".

beforeAll(async () => {
  await seedCompanyPack(db, getCompanyPack('template')!, { reset: true });
});

afterAll(async () => {
  await db.$disconnect();
});

function call(records: unknown[]) {
  const req = new Request('http://localhost/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  return POST(req as never);
}

describe('POST /api/import', () => {
  it('converts non-EUR amounts using the stored closing rate', async () => {
    // Seeded ECB closing rate: 1 EUR = 1.0820 USD (2024-12-31).
    const res = await call([
      {
        entityCode: 'MUSA',
        period: '2024-12',
        groupCOACode: 'REV-001',
        amountLocal: 108_200,
        currency: 'USD',
      },
    ]);
    expect(res.status).toBe(201);

    const usstore = await db.entity.findUnique({ where: { code: 'MUSA' } });
    const tb = await db.trialBalance.findFirst({
      where: { entityId: usstore!.id, groupCOACode: 'REV-001' },
      orderBy: { createdAt: 'desc' },
    });
    expect(tb!.amountLocal).toBe(108_200);
    expect(tb!.amountEUR).toBeCloseTo(100_000, 2);
    expect(tb!.exchangeRateUsed).toBeCloseTo(1.0820, 4);
  });

  it('honours an explicit exchangeRateUsed over the stored rate', async () => {
    const res = await call([
      {
        entityCode: 'MUSA',
        period: '2024-11',
        groupCOACode: 'REV-002',
        amountLocal: 1_100,
        currency: 'USD',
        exchangeRateUsed: 1.1,
      },
    ]);
    expect(res.status).toBe(201);

    const usstore = await db.entity.findUnique({ where: { code: 'MUSA' } });
    const tb = await db.trialBalance.findFirst({
      where: { entityId: usstore!.id, groupCOACode: 'REV-002' },
      orderBy: { createdAt: 'desc' },
    });
    expect(tb!.amountEUR).toBeCloseTo(1_000, 2);
    expect(tb!.exchangeRateUsed).toBeCloseTo(1.1, 6);
  });

  it('stores EUR records 1:1 and reports a sane dateRange', async () => {
    const res = await call([
      { entityCode: 'MERID', period: '2025-02', groupCOACode: 'REV-001', amountLocal: 500, currency: 'EUR' },
      { entityCode: 'MERID', period: '2025-01', groupCOACode: 'REV-001', amountLocal: 300, currency: 'EUR' },
    ]);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.imported).toBe(2);
    expect(body.historyEntry.dateRange).toBe('2025-01 to 2025-02');
  });

  it('rejects malformed periods', async () => {
    const res = await call([
      { entityCode: 'MERID', period: 'banana', groupCOACode: 'REV-001', amountLocal: 1, currency: 'EUR' },
    ]);
    expect(res.status).toBe(400);
  });
});
