// ============================================================
// NOL carryforward — loss years shelter future profit instead of
// vanishing via Math.max(0, …). Covers PT (70% statutory cap) and the
// flat-rate stubs (full offset), plus the PLAN.md MEDIUM.8 stress test.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createPortugalProvider, PT_TAX_CONFIG } from './jurisdictions/portugal';
import { usaProvider, createFlatRateProvider } from './jurisdictions/flat-rate';

const pt = createPortugalProvider();

describe('Portugal NOL carryforward', () => {
  it('a loss year produces no tax and carries the full loss forward', () => {
    const r = pt.computeTax({ taxableIncome: -1_000_000, year: 2024 });
    expect(r.taxableIncome).toBe(0);
    expect(r.grossTax).toBe(0);
    expect(r.surcharges).toBe(0); // derramas are on lucro tributável = 0
    expect(r.totalTax).toBe(0);
    expect(r.nolUsed).toBe(0);
    expect(r.nolClosing).toBe(1_000_000);
  });

  it('autonomous taxation still applies in a loss year', () => {
    const r = pt.computeTax({ taxableIncome: -500_000, year: 2024, autonomousTaxBase: 100_000 });
    expect(r.autonomousTax).toBe(10_000); // 10% of base, independent of profit
    expect(r.totalTax).toBe(10_000);
    expect(r.nolClosing).toBe(500_000);
  });

  it('caps the loss deduction at 70% of taxable profit (art.º 52.º CIRC)', () => {
    // Profit 400k, large pool. Only 70% (280k) is deductible → 120k matéria coletável.
    const r = pt.computeTax({ taxableIncome: 400_000, year: 2024, nolOpening: 1_000_000 });
    expect(r.nolUsed).toBe(280_000);
    expect(r.nolClosing).toBe(720_000); // 1,000,000 − 280,000
    // Coleta on 120k at 2024 rate (21%); derramas stay on full 400k lucro tributável.
    expect(r.grossTax).toBeCloseTo(120_000 * 0.21, 4);
    expect(r.surcharges).toBeCloseTo(400_000 * PT_TAX_CONFIG.derramaMunicipal, 4);
  });

  it('uses only what the pool holds when the cap exceeds the pool', () => {
    // Profit 1,000,000 → 70% cap = 700,000, but pool is only 200,000.
    const r = pt.computeTax({ taxableIncome: 1_000_000, year: 2024, nolOpening: 200_000 });
    expect(r.nolUsed).toBe(200_000);
    expect(r.nolClosing).toBe(0);
    expect(r.grossTax).toBeCloseTo(800_000 * 0.21, 4);
  });

  it('a full-offset config (cap = 1) can shelter profit entirely', () => {
    const full = createPortugalProvider({ ...PT_TAX_CONFIG, nolDeductionCapPct: 1 });
    const r = full.computeTax({ taxableIncome: 300_000, year: 2024, nolOpening: 1_000_000 });
    expect(r.nolUsed).toBe(300_000);
    expect(r.grossTax).toBe(0);
    expect(r.nolClosing).toBe(700_000);
  });
});

describe('flat-rate NOL carryforward (full offset)', () => {
  it('carries a loss forward and fully offsets a later profit', () => {
    const loss = usaProvider.computeTax({ taxableIncome: -200_000, year: 2024 });
    expect(loss.totalTax).toBe(0);
    expect(loss.nolClosing).toBe(200_000);

    // Year 2 profit 150k < pool 200k → fully sheltered, tax 0, pool 50k remains.
    const profit = usaProvider.computeTax({ taxableIncome: 150_000, year: 2025, nolOpening: 200_000 });
    expect(profit.nolUsed).toBe(150_000);
    expect(profit.totalTax).toBe(0);
    expect(profit.nolClosing).toBe(50_000);
  });
});

describe('PLAN.md MEDIUM.8 stress test — PT loss then smaller profit', () => {
  it('Year-1 loss carries forward; Year-2 profit is largely sheltered with RFAI', () => {
    // Year 1: large loss. Whole loss carried, nothing taxed.
    const y1 = pt.computeTax({ taxableIncome: -2_000_000, year: 2024 });
    expect(y1.totalTax).toBe(0);
    expect(y1.nolClosing).toBe(2_000_000);

    // Year 2: profit 1,000,000 < carried loss, plus a pending RFAI credit.
    // 70% cap → 700k deducted, 300k matéria coletável; loss partially consumed.
    const y2 = pt.computeTax({
      taxableIncome: 1_000_000,
      year: 2025,
      nolOpening: y1.nolClosing,
      rfaiCredit: 100_000,
    });
    expect(y2.nolUsed).toBe(700_000);
    expect(y2.nolClosing).toBe(1_300_000); // 2,000,000 − 700,000, carried forward

    // Coleta on 300k at 2025 rate (20%) = 60k; RFAI capped at 50% of coleta = 30k.
    expect(y2.grossTax).toBeCloseTo(60_000, 4);
    expect(y2.credits).toBeCloseTo(30_000, 4); // 70k of RFAI is unused this year
    // The unused 70k is no longer silently lost — it carries forward.
    expect(y2.rfaiUsed).toBeCloseTo(30_000, 4);
    expect(y2.rfaiClosing).toBeCloseTo(70_000, 4);
    // IRC after credit = 30k; derramas on full 1,000,000 (below the 1.5M estadual
    // threshold, so municipal only): 1,000,000 × 1.5% = 15k.
    expect(y2.totalTax).toBeCloseTo(30_000 + 15_000, 4);
  });
});
