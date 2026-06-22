import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { convertToEUR, getExchangeRate, FxRateUnavailableError } from '@/lib/finance';

// ============================================================
// FX TESTS — currency conversion must fail LOUDLY on missing/invalid rates
// rather than silently assuming 1.0 (which would let a foreign balance slip
// into the EUR book unconverted and a broken sheet still appear to reconcile).
//
// getExchangeRate is DB-backed, so we seed the demo pack (USD closing/average/
// historical + GBP closing) against the isolated test DB. convertToEUR is pure.
// ============================================================

const seed = () => seedCompanyPack(db, getCompanyPack('template')!, { reset: true });

describe('convertToEUR (pure)', () => {
  it('divides local by the rate (1 EUR = X currency)', () => {
    // 1,082 USD at 1.0820 = 1,000 EUR.
    expect(convertToEUR(1082, 1.082)).toBeCloseTo(1000, 6);
  });

  it('throws on a zero rate instead of returning the amount unconverted', () => {
    expect(() => convertToEUR(1000, 0)).toThrow(RangeError);
  });

  it('throws on a negative rate', () => {
    expect(() => convertToEUR(1000, -1.08)).toThrow(RangeError);
  });

  it('throws on a non-finite rate (NaN / Infinity)', () => {
    expect(() => convertToEUR(1000, NaN)).toThrow(RangeError);
    expect(() => convertToEUR(1000, Infinity)).toThrow(RangeError);
  });
});

describe('getExchangeRate (DB-backed)', () => {
  // ISO-4217 reserves XTS for testing; guarantee it has no rate regardless of
  // what the shared dev DB happens to carry (reset does not clear ExchangeRate).
  const MISSING = 'XTS';

  beforeAll(async () => {
    await seed();
    await db.exchangeRate.deleteMany({ where: { currency: MISSING } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const periodDate = new Date('2024-12-31');

  it('returns 1.0 for EUR without touching the DB', async () => {
    expect(await getExchangeRate('EUR', periodDate, 'closing')).toBe(1.0);
  });

  it('returns the seeded closing rate for a known currency (USD)', async () => {
    expect(await getExchangeRate('USD', periodDate, 'closing')).toBeCloseTo(1.082, 6);
  });

  it('falls back to the average rate when the requested type is missing (same-source)', async () => {
    // GBP is seeded with a closing rate only; asking for "historical" should
    // soft-fall to the average rate IF one exists. GBP has no average either,
    // so instead we prove the fallback with USD: a bogus type resolves to the
    // USD average (1.0790), not a silent 1.0.
    expect(await getExchangeRate('USD', periodDate, 'nonexistent-type')).toBeCloseTo(1.079, 6);
  });

  it('THROWS for an unknown currency rather than silently returning 1.0', async () => {
    await expect(getExchangeRate(MISSING, periodDate, 'closing')).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
  });

  it('THROWS for a known currency with no rate at/before the period', async () => {
    // Self-contained: give XTS a single rate dated 2024-12-31, then ask for a
    // 2023 period that predates it — the `lte: periodDate` lookup finds nothing.
    await db.exchangeRate.create({
      data: { currency: MISSING, rateDate: new Date('2024-12-31'), rateType: 'closing', rate: 2.5, source: 'TEST' },
    });
    try {
      await expect(
        getExchangeRate(MISSING, new Date('2023-01-01'), 'closing'),
      ).rejects.toBeInstanceOf(FxRateUnavailableError);
    } finally {
      await db.exchangeRate.deleteMany({ where: { currency: MISSING } });
    }
  });

  it('names the currency in the error message (actionable)', async () => {
    await expect(getExchangeRate(MISSING, periodDate, 'closing')).rejects.toThrow(
      new RegExp(MISSING),
    );
  });
});
