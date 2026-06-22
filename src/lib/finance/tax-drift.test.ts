import { describe, expect, it } from 'vitest';
import {
  buildStatements,
  deriveIncomeStatement,
  createEmptyIS,
  type CoaAmount,
} from '@/lib/finance';
import {
  getTaxProvider,
  portugalProvider,
  reconcileEntityTax,
  reconcileGroupTax,
  storedTaxFromIS,
} from '@/lib/tax';
import { formatNumber } from '@/lib/format';

// ============================================================
// TAX-DRIFT SUITE — the "scary scenario": the engine trusts STORED IRC
// (TAX-001..003 → taxExpense) while the standalone tax module computes IRC from
// taxable income. Nothing reconciles them, so booked tax can drift silently and
// the balance-sheet gate cannot see it (the offsetting payable was booked at the
// same stored figure). These tests pin the drift on the seeded 2024 data and
// exercise the finance + tax modules with edge-case inputs.
//
// All pure (no DB) — mirrors src/lib/finance/statements.test.ts conventions.
// ============================================================

const CENT = 0.01;

// 2024 trial balances reconstructed from the demo pack (src/lib/company-packs/
// template.ts). REV-001/COGS-001 carry the bottom-up operational totals so the
// statements reproduce the pack exactly: MERID EBITDA 5,000,000 / EBT 2,000,000
// / net 1,500,000, balance sheet 44,000,000 = 27,500,000 + 16,500,000.
const MERID_2024: CoaAmount[] = [
  { groupCOACode: 'REV-001', amountEUR: 40_000_000 },
  { groupCOACode: 'REV-008', amountEUR: 1_000_000 },
  { groupCOACode: 'REV-010', amountEUR: 500_000 },
  { groupCOACode: 'COGS-001', amountEUR: -16_000_000 },
  { groupCOACode: 'OPX-004', amountEUR: -8_000_000 },
  { groupCOACode: 'OPX-010', amountEUR: -500_000 },
  { groupCOACode: 'PAY-001', amountEUR: -12_000_000 },
  { groupCOACode: 'DEP-002', amountEUR: -2_500_000 },
  { groupCOACode: 'INT-001', amountEUR: -600_000 },
  { groupCOACode: 'INT-003', amountEUR: 100_000 },
  { groupCOACode: 'TAX-001', amountEUR: -500_000 }, // stored IRC (~25% effective)
  // Balance sheet
  { groupCOACode: 'AST-005', amountEUR: 18_000_000 },
  { groupCOACode: 'AST-006', amountEUR: 200_000 },
  { groupCOACode: 'AST-007', amountEUR: 1_800_000 },
  { groupCOACode: 'AST-003', amountEUR: 13_000_000 },
  { groupCOACode: 'AST-002', amountEUR: 9_000_000 },
  { groupCOACode: 'AST-004', amountEUR: 1_500_000 },
  { groupCOACode: 'AST-001', amountEUR: 500_000 },
  { groupCOACode: 'LIA-001', amountEUR: 4_000_000 },
  { groupCOACode: 'LIA-007', amountEUR: 6_000_000 },
  { groupCOACode: 'LIA-002', amountEUR: 5_500_000 },
  { groupCOACode: 'LIA-004', amountEUR: 12_000_000 },
  { groupCOACode: 'EQY-001', amountEUR: 5_000_000 },
  { groupCOACode: 'EQY-002', amountEUR: 10_000_000 },
];

// MSUB standalone result (IRC is assessed on the entity's OWN profit, before IC
// elimination): EBITDA 600,000 / EBT 350,000 / net 250,000, stored IRC 100,000.
const MSUB_2024: CoaAmount[] = [
  { groupCOACode: 'REV-009', amountEUR: 6_000_000 },
  { groupCOACode: 'REV-009', amountEUR: 1_500_000 },
  { groupCOACode: 'COGS-001', amountEUR: -5_400_000 },
  { groupCOACode: 'PAY-001', amountEUR: -1_500_000 },
  { groupCOACode: 'DEP-002', amountEUR: -300_000 },
  { groupCOACode: 'INT-003', amountEUR: 50_000 },
  { groupCOACode: 'TAX-001', amountEUR: -100_000 },
];

describe('2024 import — reconstruction sanity', () => {
  it('reproduces MERID standalone P&L and a balanced sheet', () => {
    const s = buildStatements(MERID_2024);
    expect(s.incomeStatement.ebitda).toBeCloseTo(5_000_000, 2);
    expect(s.incomeStatement.ebt).toBeCloseTo(2_000_000, 2);
    expect(s.incomeStatement.netIncome).toBeCloseTo(1_500_000, 2);
    expect(Math.abs(s.balanceSheet.balanceCheck)).toBeLessThan(CENT);
  });

  it('reproduces MSUB standalone P&L', () => {
    const s = buildStatements(MSUB_2024);
    expect(s.incomeStatement.ebitda).toBeCloseTo(600_000, 2);
    expect(s.incomeStatement.ebt).toBeCloseTo(350_000, 2);
    expect(s.incomeStatement.netIncome).toBeCloseTo(250_000, 2);
  });
});

describe('Tax drift — engine stored IRC vs Portugal module (2024)', () => {
  it('MERID: stored 500,000 over-taxes vs modelled 465,000 (drift +35,000)', () => {
    const is = buildStatements(MERID_2024).incomeStatement;
    const rec = reconcileEntityTax(is, portugalProvider, { year: 2024 });

    // PT 2024: coleta 2,000,000×21% = 420,000 + derrama mun. 30,000
    //          + derrama estadual (2,000,000-1,500,000)×3% = 15,000 → 465,000.
    expect(rec.storedTax).toBeCloseTo(500_000, 2);
    expect(rec.modelledTax).toBeCloseTo(465_000, 2);
    expect(rec.drift).toBeCloseTo(35_000, 2); // positive ⇒ net income understated
    expect(rec.withinTolerance).toBe(false);
    expect(rec.comparable).toBe(true);
  });

  it('MSUB: stored 100,000 over-taxes vs modelled 78,750 (drift +21,250)', () => {
    const is = buildStatements(MSUB_2024).incomeStatement;
    const rec = reconcileEntityTax(is, portugalProvider, { year: 2024 });

    // PT 2024: coleta 350,000×21% = 73,500 + derrama mun. 5,250; below the
    // 1,500,000 derrama-estadual threshold → no state surcharge → 78,750.
    expect(rec.modelledTax).toBeCloseTo(78_750, 2);
    expect(rec.drift).toBeCloseTo(21_250, 2);
  });

  it('GROUP: stored 600,000 vs modelled 543,750 — net income understated by 56,250', () => {
    const merid = buildStatements(MERID_2024).incomeStatement;
    const msub = buildStatements(MSUB_2024).incomeStatement;

    const group = reconcileGroupTax([
      { is: merid, provider: portugalProvider, year: 2024 },
      { is: msub, provider: portugalProvider, year: 2024 },
    ]);

    expect(group.storedTotal).toBeCloseTo(600_000, 2);
    expect(group.modelledTotal).toBeCloseTo(543_750, 2); // 465,000 + 78,750
    expect(group.drift).toBeCloseTo(56_250, 2);
    expect(group.withinTolerance).toBe(false);
    // THE headline gap: the engine's consolidated net income is 56,250 lower
    // than the standalone IRC model implies, and nothing flags it today.
  });
});

describe('Sign-convention landmine', () => {
  it('storedTaxFromIS negates the engine sign so totals stay sane', () => {
    const is = buildStatements(MERID_2024).incomeStatement;
    expect(is.taxExpense).toBeCloseTo(-500_000, 2); // engine books tax negative
    expect(storedTaxFromIS(is)).toBeCloseTo(500_000, 2); // module-facing positive
  });

  it('a naive `taxExpense = totalTax` assignment flips net income above EBT', () => {
    const modelled = 465_000; // positive, as the module returns it

    const wrong = createEmptyIS();
    wrong.revenue = 41_500_000; wrong.cogs = -16_000_000; wrong.opex = -20_500_000;
    wrong.depreciation = -2_500_000; wrong.interestExpense = -500_000;
    wrong.taxExpense = modelled; // BUG: forgot to negate
    deriveIncomeStatement(wrong);
    expect(wrong.ebt).toBeCloseTo(2_000_000, 2);
    expect(wrong.netIncome).toBeCloseTo(2_465_000, 2); // tax ADDED to profit — nonsense

    const right = createEmptyIS();
    right.revenue = 41_500_000; right.cogs = -16_000_000; right.opex = -20_500_000;
    right.depreciation = -2_500_000; right.interestExpense = -500_000;
    right.taxExpense = -modelled; // correct bridge
    deriveIncomeStatement(right);
    expect(right.netIncome).toBeCloseTo(1_535_000, 2);
  });
});

describe('Balance-sheet invisibility of tax drift', () => {
  it('the 35,000 drift does NOT show up in balanceCheck', () => {
    // The booked IRC and its offsetting payable/cash were posted at the SAME
    // stored figure, so the sheet reconciles regardless of the model. The
    // engine's balance-check gate therefore cannot detect tax drift —
    // reconciliation is the only detector.
    const s = buildStatements(MERID_2024);
    expect(Math.abs(s.balanceSheet.balanceCheck)).toBeLessThan(CENT);

    const rec = reconcileEntityTax(s.incomeStatement, portugalProvider, { year: 2024 });
    expect(Math.abs(rec.drift)).toBeGreaterThan(1_000); // material drift…
    expect(Math.abs(s.balanceSheet.balanceCheck)).toBeLessThan(CENT); // …still invisible to the BS gate
  });
});

describe('Per-entity vs group taxation (derrama estadual is progressive)', () => {
  it('Σ computeTax(entity) ≠ computeTax(Σ taxable) — pooling over-states the surcharge', () => {
    const perEntity = 465_000 + 78_750; // correct basis: tax each entity, then sum
    expect(perEntity).toBe(543_750);

    // WRONG basis: run the provider once on consolidated taxable income.
    const pooled = portugalProvider.computeTax({ taxableIncome: 2_350_000, year: 2024 }).totalTax;
    // coleta 493,500 + derrama mun. 35,250 + derrama estadual (2,350,000-1,500,000)×3% = 25,500
    expect(pooled).toBeCloseTo(554_250, 2);

    // MSUB's 350,000, taxed standalone, sits below the 1,500,000 threshold and
    // pays no state surcharge; pooled onto MERID it incurs 350,000×3% = 10,500.
    expect(pooled - perEntity).toBeCloseTo(10_500, 2);
  });
});

describe('Loss year — module floors at 0, engine may still carry stored tax', () => {
  it('a booked tax on a pre-tax loss is 100% drift', () => {
    const is = { ebt: -1_000_000, taxExpense: -200_000 }; // mis-booked tax on a loss
    const rec = reconcileEntityTax(is, portugalProvider, { year: 2024 });
    expect(rec.taxableIncome).toBe(0); // taxable base floored at 0
    expect(rec.modelledTax).toBe(0); // no IRC on a loss
    expect(rec.drift).toBeCloseTo(200_000, 2);
  });

  it('the module never returns a negative tax', () => {
    const r = portugalProvider.computeTax({ taxableIncome: -5_000_000, year: 2024 });
    expect(r.totalTax).toBe(0);
    expect(r.taxableIncome).toBe(0);
  });
});

describe('Unmodelled jurisdiction fallback is 0% — not "no tax due"', () => {
  it('a DE entity falls back to 0% and is flagged not-comparable', () => {
    const de = getTaxProvider('DE');
    expect(de.computeTax({ taxableIncome: 1_000_000, year: 2024 }).totalTax).toBe(0);

    // A DE entity that booked real tax must NOT be read as a 1,000,000 over-book.
    const rec = reconcileEntityTax({ ebt: 1_000_000, taxExpense: -250_000 }, de, { year: 2024 });
    expect(rec.comparable).toBe(false);
    expect(rec.modelledTax).toBe(0);
    // Group reconciliation inherits non-comparability so the 0 isn't summed in blindly.
    const group = reconcileGroupTax([{ is: { ebt: 1_000_000, taxExpense: -250_000 }, provider: de, year: 2024 }]);
    expect(group.comparable).toBe(false);
  });
});

describe('Portugal IRC chain — edge cases', () => {
  it('derrama estadual spans tiers 1 and 2 above 7,500,000', () => {
    const r = portugalProvider.computeTax({ taxableIncome: 8_000_000, year: 2024 });
    // coleta 1,680,000 + derrama mun. 120,000
    // + estadual: (7,500,000-1,500,000)×3% = 180,000 + (8,000,000-7,500,000)×5% = 25,000
    expect(r.surcharges).toBeCloseTo(325_000, 2);
    expect(r.totalTax).toBeCloseTo(2_005_000, 2);
  });

  it('RFAI credit is capped at 50% of coleta', () => {
    const r = portugalProvider.computeTax({ taxableIncome: 1_000_000, year: 2024, rfaiCredit: 300_000 });
    // coleta 210,000; RFAI capped at 105,000; coleta after 105,000
    // + derrama mun. 15,000 (surcharges are NOT reduced by credits)
    expect(r.credits).toBeCloseTo(105_000, 2);
    expect(r.totalTax).toBeCloseTo(120_000, 2);
  });

  it('clamps the IRC rate forward to the schedule for years beyond the table (A2)', () => {
    expect(portugalProvider.computeTax({ taxableIncome: 1_000_000, year: 2024 }).baseRate).toBe(0.21);
    // 2029/2030 are past the table → clamp to the last scheduled year (2028 → 17%),
    // not the generic fallback. A future projection keeps the legislated trajectory.
    expect(portugalProvider.computeTax({ taxableIncome: 1_000_000, year: 2029 }).baseRate).toBe(0.17);
    expect(portugalProvider.computeTax({ taxableIncome: 1_000_000, year: 2030 }).baseRate).toBe(0.17);
    // A mid-schedule year resolves to its own rate.
    expect(portugalProvider.computeTax({ taxableIncome: 1_000_000, year: 2026 }).baseRate).toBe(0.19);
    // Years BEFORE the table fall back to the generic rate (no schedule to clamp to).
    expect(portugalProvider.computeTax({ taxableIncome: 1_000_000, year: 2020 }).baseRate).toBe(0.20);
  });
});

describe('High-precision formatting (de-DE) — no rounding/display drift', () => {
  it('formats 4-decimal euro results with comma decimal + dot grouping', () => {
    // 1,000,000.40 → coleta 210,000.084 + derrama mun. 15,000.006 = 225,000.09
    const r = portugalProvider.computeTax({ taxableIncome: 1_000_000.4, year: 2024 });
    expect(r.totalTax).toBeCloseTo(225_000.09, 2);

    // format.ts is the single de-DE formatter; verify it at 4 dp and 2 dp.
    expect(formatNumber(225_000.09, 4)).toBe('225.000,0900');
    expect(formatNumber(225_000.09, 2)).toBe('225.000,09');
    // Millions retain 4 dp without scientific notation or separator loss.
    expect(formatNumber(52_240_382.1234, 4)).toBe('52.240.382,1234');
  });

  it('rounds the 5th decimal and preserves the sign of tiny residuals', () => {
    expect(formatNumber(277_777.77567, 4)).toBe('277.777,7757'); // 5th decimal (6) rounds up
    expect(formatNumber(-0.004, 2)).toBe('-0,00'); // tiny negative residual shows as signed zero
  });
});
