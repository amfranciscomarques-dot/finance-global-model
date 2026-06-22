// ============================================================
// DEFERRED TAX (IAS 12) — book-vs-tax timing differences → DTA / DTL
//
// The engine carries a STORED Deferred Tax Asset on AST-010 (mapped to
// otherNonCurrentAssets). Nothing computes it from the actual book-vs-tax
// timing differences, so it can only ever be whatever was imported. This module
// derives the deferred-tax balance from first principles:
//
//   * A temporary difference is the gap between an item's BOOK carrying amount
//     and its TAX base. It reverses in future periods, creating a future tax
//     consequence measured at the enacted rate (IAS 12.47):
//       - Deductible temporary difference  → Deferred Tax ASSET  (future relief)
//       - Taxable temporary difference      → Deferred Tax LIABILITY (future charge)
//   * A tax-LOSS carryforward (NOL) is a deductible difference too: it shelters
//     future profit, so it is a DTA of lossCarryforward × rate (IAS 12.34).
//   * An unused tax-CREDIT carryforward (e.g. RFAI capped this year) is a DTA at
//     FACE value — it offsets tax 1:1, not the base, so it is NOT multiplied by
//     the rate.
//
// The period's deferred-tax expense/benefit in the P&L is the MOVEMENT in the
// net DTA: a rise in the net asset is a benefit (negative expense).
//
// Like reconcile.ts this module is ADDITIVE and pure — it imports nothing from
// finance and has no DB dependency. Feeding the computed AST-010 balance back
// into the consolidation run is a separate product decision (see PLAN.md).
// ============================================================

import type { TaxResult } from './types';

/** One book-vs-tax timing difference on an asset or liability. */
export interface TemporaryDifference {
  /** Human-readable source, e.g. "Accelerated tax depreciation (AST-002)". */
  label: string;
  /** Carrying amount in the financial statements. */
  bookBase: number;
  /** Amount attributed to the item for tax purposes. */
  taxBase: number;
  /**
   * Whether the item is an asset or a liability — it flips the sign of the
   * difference. For an asset, book > tax ⇒ taxable difference (DTL); for a
   * liability the reverse. Defaults to 'asset'.
   */
  nature?: 'asset' | 'liability';
}

export interface DeferredTaxInput {
  /** Enacted tax rate used to measure the differences (IAS 12.47). */
  rate: number;
  /** Book-vs-tax timing differences. */
  differences?: TemporaryDifference[];
  /** Tax-loss (NOL) pool carried forward — a DTA of `× rate`. */
  lossCarryforward?: number;
  /** Unused tax-credit carryforward (e.g. RFAI) — a DTA at FACE value. */
  creditCarryforward?: number;
  /**
   * Opening net DTA (the AST-010 balance brought forward). Used only to compute
   * the period movement / P&L deferred-tax expense. Omit ⇒ treated as 0.
   */
  openingNetDTA?: number;
}

export interface DeferredTaxLine {
  label: string;
  /** Signed temporary difference: positive = deductible (DTA), negative = taxable (DTL). */
  temporaryDifference: number;
  /** Deferred tax on the line: positive = DTA, negative = DTL. */
  deferredTax: number;
}

export interface DeferredTaxResult {
  /** Gross deferred tax asset (deductible differences + carryforwards). */
  dta: number;
  /** Gross deferred tax liability (taxable differences). */
  dtl: number;
  /**
   * Net DTA = dta − dtl. When positive this is the AST-010 balance; when
   * negative the group has a net deferred tax LIABILITY (see netDeferredTaxLiability).
   */
  netDeferredTaxAsset: number;
  /** Net DTA carried on AST-010 (= max(0, netDeferredTaxAsset)). */
  ast010Balance: number;
  /** Net DTL presented as a liability (= max(0, −netDeferredTaxAsset)). */
  netDeferredTaxLiability: number;
  /**
   * P&L deferred-tax expense (+) / benefit (−) for the period = the DECREASE in
   * the net DTA (openingNetDTA − closing net DTA). A growing DTA is a benefit.
   */
  deferredTaxExpense: number;
  lines: DeferredTaxLine[];
}

/** Signed deductible(+)/taxable(−) temporary difference for one item. */
function signedDifference(d: TemporaryDifference): number {
  const assetDeductible = d.taxBase - d.bookBase; // asset: tax > book ⇒ DTA
  return (d.nature ?? 'asset') === 'asset' ? assetDeductible : -assetDeductible;
}

/**
 * Compute the deferred-tax balance and the period movement from timing
 * differences and loss/credit carryforwards.
 */
export function computeDeferredTax(input: DeferredTaxInput): DeferredTaxResult {
  const rate = input.rate;
  const lines: DeferredTaxLine[] = [];
  let dta = 0;
  let dtl = 0;

  for (const d of input.differences ?? []) {
    const temporaryDifference = signedDifference(d);
    const deferredTax = temporaryDifference * rate;
    if (deferredTax >= 0) dta += deferredTax;
    else dtl += -deferredTax;
    lines.push({ label: d.label, temporaryDifference, deferredTax });
  }

  // Tax-loss carryforward: a DTA at the enacted rate.
  const loss = input.lossCarryforward ?? 0;
  if (loss > 0) {
    const deferredTax = loss * rate;
    dta += deferredTax;
    lines.push({ label: 'Tax-loss carryforward (NOL)', temporaryDifference: loss, deferredTax });
  }

  // Unused tax-credit carryforward: a DTA at FACE value (offsets tax 1:1).
  const credit = input.creditCarryforward ?? 0;
  if (credit > 0) {
    dta += credit;
    lines.push({ label: 'Tax-credit carryforward (e.g. RFAI)', temporaryDifference: credit, deferredTax: credit });
  }

  const netDeferredTaxAsset = dta - dtl;
  const openingNetDTA = input.openingNetDTA ?? 0;

  return {
    dta,
    dtl,
    netDeferredTaxAsset,
    ast010Balance: Math.max(0, netDeferredTaxAsset),
    netDeferredTaxLiability: Math.max(0, -netDeferredTaxAsset),
    deferredTaxExpense: openingNetDTA - netDeferredTaxAsset,
    lines,
  };
}

/**
 * Sum a set of per-entity deferred-tax results into one group position. DTA and
 * DTL are gross-summed (a net asset in one entity does NOT offset a net liability
 * in another — they sit on opposite sides of the consolidated sheet), the net is
 * re-derived, and the period deferred-tax expense is the sum of the entities'
 * movements. Lines are concatenated so the group breakdown stays auditable.
 */
export function aggregateDeferredTax(results: DeferredTaxResult[]): DeferredTaxResult {
  const dta = results.reduce((s, r) => s + r.dta, 0);
  const dtl = results.reduce((s, r) => s + r.dtl, 0);
  const netDeferredTaxAsset = dta - dtl;
  return {
    dta,
    dtl,
    netDeferredTaxAsset,
    ast010Balance: Math.max(0, netDeferredTaxAsset),
    netDeferredTaxLiability: Math.max(0, -netDeferredTaxAsset),
    deferredTaxExpense: results.reduce((s, r) => s + r.deferredTaxExpense, 0),
    lines: results.flatMap((r) => r.lines),
  };
}

/**
 * Convenience bridge from a TaxResult: turn the loss (nolClosing) and unused
 * credit (rfaiClosing) a provider carried forward into the deferred-tax asset
 * they represent. This is the concrete link between the NOL/RFAI carryforwards
 * and AST-010 — the year a loss/credit is generated, the relief is recognised
 * as a DTA rather than disappearing.
 */
export function deferredTaxFromTaxResult(
  result: Pick<TaxResult, 'nolClosing' | 'rfaiClosing' | 'baseRate'>,
  opts?: { differences?: TemporaryDifference[]; openingNetDTA?: number; rate?: number },
): DeferredTaxResult {
  return computeDeferredTax({
    rate: opts?.rate ?? result.baseRate,
    differences: opts?.differences,
    lossCarryforward: result.nolClosing,
    creditCarryforward: result.rfaiClosing,
    openingNetDTA: opts?.openingNetDTA,
  });
}
