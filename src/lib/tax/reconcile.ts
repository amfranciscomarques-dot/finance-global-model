// ============================================================
// TAX RECONCILIATION — engine (stored IRC) vs standalone tax module
//
// The consolidation engine treats income tax as a STORED trial-balance line
// (TAX-001..003 → IncomeStatementData.taxExpense, booked NEGATIVE). The tax
// module computes IRC from taxable income and returns a POSITIVE totalTax.
// Nothing in the engine reconciles the two, so the booked tax can silently
// drift from the modelled liability. These helpers expose that drift and bridge
// the two sign conventions in exactly one place.
//
// This module is ADDITIVE: it imports finance only as a *type* (no runtime
// dependency, so the existing finance-has-no-tax-dependency layering is kept).
// Wiring it into runConsolidation is a separate product decision.
//
// CAVEATS — do NOT treat the modelled figure as ground truth blindly:
//   * Base: EBT (RAI) is used as the taxable base. Real lucro tributável differs
//     by book-tax adjustments; pass `taxInput.taxableIncome`/`deductions` when
//     the fiscal base is known.
//   * Jurisdiction: only PT/ES/US are modelled. getTaxProvider() returns a 0%
//     fallback for everything else — a 0 modelled tax there means "unmodelled",
//     NOT "no tax due". `comparable` is false for those; ignore their drift.
//   * Per-entity: IRC (and the progressive derrama estadual) is assessed per
//     legal entity. Reconcile each entity and SUM — never run the provider on
//     consolidated taxable income (see reconcileGroupTax).
// ============================================================

import type { TaxInput, TaxProvider } from './types';

/** Minimal income-statement shape needed to reconcile tax (avoids a finance import). */
export interface TaxableIS {
  /** Earnings before tax (used as the approximate taxable base). */
  ebt: number;
  /** Booked income tax — NEGATIVE in the engine's sign convention. */
  taxExpense: number;
}

export interface TaxReconciliation {
  jurisdiction: string;
  year: number;
  /** Taxable base fed to the provider (max(0, EBT) unless overridden). */
  taxableIncome: number;
  /** Engine: positive magnitude of the booked IRC (= -taxExpense). */
  storedTax: number;
  /** Tax module: provider.computeTax(...).totalTax (positive). */
  modelledTax: number;
  /** storedTax − modelledTax. Positive ⇒ engine OVER-taxes (net income understated). */
  drift: number;
  /** drift / modelledTax (0 when modelled tax is 0). */
  driftPct: number;
  /** Headline statutory rate the provider applied — used to measure deferred tax. */
  baseRate: number;
  /** |drift| within tolerance. */
  withinTolerance: boolean;
  /** False for the unmodelled 0% fallback provider — drift is not meaningful then. */
  comparable: boolean;
  /** Loss pool carried forward by the provider — feed as next year's nolOpening. */
  nolClosing: number;
  /** Unused RFAI credit carried forward — feed as next year's rfaiOpening. */
  rfaiClosing: number;
}

const DEFAULT_TOLERANCE_EUR = 1;

/**
 * The single place that bridges sign conventions: the engine books tax NEGATIVE
 * (taxExpense = -500_000), the tax module returns it POSITIVE (totalTax). Any
 * code that pushes a modelled figure back into the IS must negate it — assigning
 * `is.taxExpense = result.totalTax` would flip net income above EBT.
 */
export function storedTaxFromIS(is: TaxableIS): number {
  return -is.taxExpense;
}

export interface ReconcileOptions {
  year: number;
  toleranceEUR?: number;
  /** Override / extend the provider input (credits, deductions, explicit base, …). */
  taxInput?: Partial<TaxInput>;
}

/** Compare one entity's stored IRC against what its jurisdiction provider models. */
export function reconcileEntityTax(
  is: TaxableIS,
  provider: TaxProvider,
  opts: ReconcileOptions,
): TaxReconciliation {
  const tolerance = opts.toleranceEUR ?? DEFAULT_TOLERANCE_EUR;
  const taxableIncome = opts.taxInput?.taxableIncome ?? Math.max(0, is.ebt);

  const result = provider.computeTax({ taxableIncome, year: opts.year, ...opts.taxInput });

  const storedTax = storedTaxFromIS(is);
  const modelledTax = result.totalTax;
  const drift = storedTax - modelledTax;

  // The unmodelled-jurisdiction fallback is named "<CODE> — unmodelled" and
  // taxes everything at 0%. Its 0 is "no model", not "no liability".
  const comparable = !/unmodelled/i.test(provider.name);

  return {
    jurisdiction: result.jurisdiction,
    year: opts.year,
    taxableIncome,
    storedTax,
    modelledTax,
    drift,
    driftPct: modelledTax !== 0 ? drift / modelledTax : 0,
    baseRate: result.baseRate,
    withinTolerance: Math.abs(drift) <= tolerance,
    comparable,
    nolClosing: result.nolClosing,
    rfaiClosing: result.rfaiClosing,
  };
}

export interface GroupTaxEntity {
  is: TaxableIS;
  provider: TaxProvider;
  year: number;
  taxInput?: Partial<TaxInput>;
}

export interface GroupTaxReconciliation {
  perEntity: TaxReconciliation[];
  storedTotal: number;
  modelledTotal: number;
  drift: number;
  driftPct: number;
  withinTolerance: boolean;
  /** True only if EVERY entity is comparable (no unmodelled jurisdiction). */
  comparable: boolean;
}

/**
 * Reconcile a group by reconciling each entity and SUMMING. This is the correct
 * basis: IRC is per-entity and the derrama estadual is progressive, so running
 * a provider on consolidated taxable income over-states the surcharge.
 */
export function reconcileGroupTax(
  entities: GroupTaxEntity[],
  opts?: { toleranceEUR?: number },
): GroupTaxReconciliation {
  const tolerance = opts?.toleranceEUR ?? DEFAULT_TOLERANCE_EUR;
  const perEntity = entities.map((e) =>
    reconcileEntityTax(e.is, e.provider, { year: e.year, toleranceEUR: tolerance, taxInput: e.taxInput }),
  );
  const storedTotal = perEntity.reduce((s, r) => s + r.storedTax, 0);
  const modelledTotal = perEntity.reduce((s, r) => s + r.modelledTax, 0);
  const drift = storedTotal - modelledTotal;
  return {
    perEntity,
    storedTotal,
    modelledTotal,
    drift,
    driftPct: modelledTotal !== 0 ? drift / modelledTotal : 0,
    withinTolerance: Math.abs(drift) <= tolerance,
    comparable: perEntity.every((r) => r.comparable),
  };
}
