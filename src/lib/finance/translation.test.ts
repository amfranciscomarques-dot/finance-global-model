import { describe, expect, it } from 'vitest';
import {
  createEmptyBS,
  createEmptyCF,
  createEmptyIS,
  deriveBalanceSheet,
  deriveIncomeStatement,
  translateForeignEntity,
  type FinancialStatements,
} from '@/lib/finance';

// ============================================================
// IAS 21 TRANSLATION TESTS — the current-rate method must translate income at
// the average rate, assets/liabilities at the closing rate and equity at the
// historical rate, and surface the residual as the CTA so the translated sheet
// still reconciles. When all three rates are equal it must collapse to a uniform
// scaling with zero CTA (this is what keeps the EUR golden tests unaffected).
// ============================================================

// USD rates (1 EUR = X USD), matching the demo pack's seeded ECB values.
const USD = { closing: 1.082, average: 1.079, historical: 1.104 };

/**
 * A small, locally-balanced USD subsidiary used as the worked example (also the
 * one written up in the README): €-equivalent cash funded by share capital plus
 * the current year's retained result.
 *   revenue 1,000,000  cogs (600,000)        → net income 400,000
 *   cash    2,400,000  share capital 2,000,000 + retained earnings 400,000
 */
function usdSubsidiary(): FinancialStatements {
  const is = createEmptyIS();
  is.revenue = 1_000_000;
  is.cogs = -600_000; // expenses are stored negative
  deriveIncomeStatement(is);

  const bs = createEmptyBS();
  bs.cash = 2_400_000;
  bs.shareCapital = 2_000_000;
  bs.historicalRetainedEarnings = 0;
  deriveBalanceSheet(bs, is);

  return { incomeStatement: is, balanceSheet: bs, cashFlow: createEmptyCF() };
}

describe('translateForeignEntity (IAS 21 current-rate method)', () => {
  it('translates the worked USD example at three rates with a balancing CTA', () => {
    const { statements, cta } = translateForeignEntity(usdSubsidiary(), USD);
    const { incomeStatement: is, balanceSheet: bs } = statements;

    // Income & expenses at the AVERAGE rate (1.079).
    expect(is.revenue).toBeCloseTo(1_000_000 / 1.079, 2); // 926,784.06
    expect(is.cogs).toBeCloseTo(-600_000 / 1.079, 2); // -556,070.44
    expect(is.netIncome).toBeCloseTo(400_000 / 1.079, 2); // 370,713.62

    // Assets at the CLOSING rate (1.082).
    expect(bs.cash).toBeCloseTo(2_400_000 / 1.082, 2); // 2,218,114.60
    expect(bs.totalAssets).toBeCloseTo(2_400_000 / 1.082, 2);

    // Contributed equity at the HISTORICAL rate (1.104); current result rides in
    // at the average rate via retained earnings.
    expect(bs.shareCapital).toBeCloseTo(2_000_000 / 1.104, 2); // 1,811,594.20
    expect(bs.retainedEarnings).toBeCloseTo(400_000 / 1.079, 2);

    // The CTA is the residual that makes the mixed-rate sheet balance.
    expect(cta).toBeCloseTo(35_806.78, 2);
    expect(bs.cta).toBeCloseTo(cta, 6);

    // ...and with the CTA recognised in equity, the sheet reconciles.
    expect(Math.abs(bs.balanceCheck)).toBeLessThan(0.01);
    expect(bs.totalEquity).toBeCloseTo(bs.totalAssets, 2);
  });

  it('collapses to a uniform scaling with zero CTA when all rates are equal', () => {
    const flat = { closing: 1.082, average: 1.082, historical: 1.082 };
    const { statements, cta } = translateForeignEntity(usdSubsidiary(), flat);
    const { balanceSheet: bs, incomeStatement: is } = statements;

    expect(cta).toBeCloseTo(0, 6);
    expect(bs.cta).toBeCloseTo(0, 6);
    // Every line is simply local / 1.082.
    expect(is.revenue).toBeCloseTo(1_000_000 / 1.082, 2);
    expect(bs.cash).toBeCloseTo(2_400_000 / 1.082, 2);
    expect(bs.shareCapital).toBeCloseTo(2_000_000 / 1.082, 2);
    expect(Math.abs(bs.balanceCheck)).toBeLessThan(0.01);
  });

  it('is an identity (CTA 0) for a EUR entity (all rates 1.0)', () => {
    const local = usdSubsidiary();
    const { statements, cta } = translateForeignEntity(local, {
      closing: 1,
      average: 1,
      historical: 1,
    });
    expect(cta).toBeCloseTo(0, 6);
    expect(statements.balanceSheet.cash).toBeCloseTo(local.balanceSheet.cash, 2);
    expect(statements.incomeStatement.netIncome).toBeCloseTo(local.incomeStatement.netIncome, 2);
  });

  it('rejects a non-positive or non-finite rate rather than producing a junk sheet', () => {
    const local = usdSubsidiary();
    expect(() => translateForeignEntity(local, { ...USD, closing: 0 })).toThrow(RangeError);
    expect(() => translateForeignEntity(local, { ...USD, average: -1 })).toThrow(RangeError);
    expect(() => translateForeignEntity(local, { ...USD, historical: NaN })).toThrow(RangeError);
  });
});
