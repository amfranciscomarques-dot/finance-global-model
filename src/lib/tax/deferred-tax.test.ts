// ============================================================
// Deferred tax (IAS 12) — DTA/DTL from book-vs-tax timing differences and from
// the NOL/RFAI carryforwards, plus the period movement (deferred-tax expense).
// ============================================================

import { describe, it, expect } from 'vitest';
import { aggregateDeferredTax, computeDeferredTax, deferredTaxFromTaxResult } from './deferred-tax';
import { createPortugalProvider } from './jurisdictions/portugal';

describe('temporary differences', () => {
  it('an asset with book > tax base is a taxable difference → DTL', () => {
    // Accelerated tax depreciation: book 800, tax 500 → 300 taxable diff @ 20% = 60 DTL.
    const r = computeDeferredTax({
      rate: 0.2,
      differences: [{ label: 'Accelerated depreciation', bookBase: 800, taxBase: 500 }],
    });
    expect(r.dtl).toBeCloseTo(60, 6);
    expect(r.dta).toBe(0);
    expect(r.netDeferredTaxAsset).toBeCloseTo(-60, 6);
    expect(r.ast010Balance).toBe(0);
    expect(r.netDeferredTaxLiability).toBeCloseTo(60, 6);
  });

  it('an asset with book < tax base is a deductible difference → DTA', () => {
    // Provision not yet tax-deductible: book 100, tax 300 → 200 deductible @ 20% = 40 DTA.
    const r = computeDeferredTax({
      rate: 0.2,
      differences: [{ label: 'Impairment provision', bookBase: 100, taxBase: 300 }],
    });
    expect(r.dta).toBeCloseTo(40, 6);
    expect(r.dtl).toBe(0);
    expect(r.ast010Balance).toBeCloseTo(40, 6);
  });

  it('a liability flips the sign of the difference', () => {
    // Liability book 300 > tax 100 → deductible difference (200) → DTA 40.
    const r = computeDeferredTax({
      rate: 0.2,
      differences: [{ label: 'Warranty provision', bookBase: 300, taxBase: 100, nature: 'liability' }],
    });
    expect(r.dta).toBeCloseTo(40, 6);
    expect(r.dtl).toBe(0);
  });

  it('nets a DTA and a DTL into a single net position', () => {
    const r = computeDeferredTax({
      rate: 0.25,
      differences: [
        { label: 'Provision', bookBase: 0, taxBase: 400 },   // +400 → DTA 100
        { label: 'Depreciation', bookBase: 700, taxBase: 300 }, // −400 → DTL 100
      ],
    });
    expect(r.dta).toBeCloseTo(100, 6);
    expect(r.dtl).toBeCloseTo(100, 6);
    expect(r.netDeferredTaxAsset).toBeCloseTo(0, 6);
  });
});

describe('carryforwards as deferred tax assets', () => {
  it('a tax-loss carryforward is a DTA at the rate', () => {
    const r = computeDeferredTax({ rate: 0.2, lossCarryforward: 1_000_000 });
    expect(r.dta).toBeCloseTo(200_000, 6);
    expect(r.ast010Balance).toBeCloseTo(200_000, 6);
  });

  it('an unused credit carryforward is a DTA at FACE value (not × rate)', () => {
    const r = computeDeferredTax({ rate: 0.2, creditCarryforward: 70_000 });
    expect(r.dta).toBeCloseTo(70_000, 6); // not 14,000
  });
});

describe('period movement (deferred-tax expense)', () => {
  it('a rising net DTA is a P&L benefit (negative expense)', () => {
    const r = computeDeferredTax({ rate: 0.2, lossCarryforward: 500_000, openingNetDTA: 40_000 });
    // closing net DTA = 100,000; movement = 40,000 − 100,000 = −60,000 (benefit).
    expect(r.netDeferredTaxAsset).toBeCloseTo(100_000, 6);
    expect(r.deferredTaxExpense).toBeCloseTo(-60_000, 6);
  });

  it('a reversing DTA is a P&L charge (positive expense)', () => {
    const r = computeDeferredTax({ rate: 0.2, lossCarryforward: 100_000, openingNetDTA: 80_000 });
    // closing 20,000; movement = 80,000 − 20,000 = +60,000 charge.
    expect(r.deferredTaxExpense).toBeCloseTo(60_000, 6);
  });
});

describe('bridge from a TaxResult — NOL/RFAI carryforwards drive AST-010', () => {
  it('recognises the loss and the unused RFAI from a loss/RFAI year as a DTA', () => {
    const pt = createPortugalProvider();
    // Year-2 of the stress scenario: 700k loss consumed leaves 1.3M carried, and
    // 70k RFAI unused. Both become a DTA the year they arise.
    const y2 = pt.computeTax({
      taxableIncome: 1_000_000,
      year: 2025,
      nolOpening: 2_000_000,
      rfaiCredit: 100_000,
    });
    const dt = deferredTaxFromTaxResult(y2);
    // NOL DTA = 1,300,000 × 20% = 260,000; RFAI DTA = 70,000 face → 330,000.
    expect(dt.dta).toBeCloseTo(1_300_000 * 0.2 + 70_000, 4);
    expect(dt.ast010Balance).toBeCloseTo(330_000, 4);
  });
});

describe('aggregateDeferredTax — group position (MEDIUM.8b)', () => {
  it('gross-sums DTA and DTL across entities and re-derives the net', () => {
    const dtaEntity = computeDeferredTax({ rate: 0.2, lossCarryforward: 1_000_000 }); // 200k DTA
    const dtlEntity = computeDeferredTax({
      rate: 0.25,
      differences: [{ label: 'Accelerated depreciation', bookBase: 1_000_000, taxBase: 200_000 }], // 200k DTL
    });
    const group = aggregateDeferredTax([dtaEntity, dtlEntity]);

    // A net asset in one entity does NOT net against a net liability in another:
    // both sides are carried gross on the consolidated sheet.
    expect(group.dta).toBeCloseTo(200_000, 4);
    expect(group.dtl).toBeCloseTo(200_000, 4);
    expect(group.netDeferredTaxAsset).toBeCloseTo(0, 4);
    expect(group.ast010Balance).toBeCloseTo(0, 4);
    expect(group.netDeferredTaxLiability).toBeCloseTo(0, 4);
    // Lines from every entity are preserved for the audit trail.
    expect(group.lines).toHaveLength(2);
  });

  it('sums the per-entity period movements into the group deferred-tax expense', () => {
    const a = computeDeferredTax({ rate: 0.2, lossCarryforward: 100_000, openingNetDTA: 80_000 }); // +60k charge
    const b = computeDeferredTax({ rate: 0.2, lossCarryforward: 500_000, openingNetDTA: 0 });      // −100k benefit
    const group = aggregateDeferredTax([a, b]);
    expect(group.deferredTaxExpense).toBeCloseTo(60_000 - 100_000, 4); // −40,000 net benefit
  });

  it('is the identity on a single entity', () => {
    const one = computeDeferredTax({ rate: 0.21, lossCarryforward: 300_000, creditCarryforward: 50_000 });
    expect(aggregateDeferredTax([one])).toEqual(one);
  });
});
