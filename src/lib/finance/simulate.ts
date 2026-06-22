// ============================================================
// FINANCE DOMAIN — pure Monte-Carlo simulation kernel (LOW.1)
//
// Fans the MEDIUM.10 projection kernel (projectPeriod) out over many driver
// draws, in memory, with NO database and NO I/O. Given a fully-derived opening
// state, a per-period base assumption set and a set of driver distributions, it
// runs `draws` independent multi-period paths, sampling each driver around its
// base, and aggregates the per-period metric distribution into percentile bands.
//
// This is the single basis for scenarios / Monte-Carlo: callers anchor ONCE
// (e.g. the consolidation engine builds the opening consolidated state), then
// fan the kernel here — there are no per-iteration DB round trips and nothing is
// persisted. The draws are reproducible: a seeded RNG makes the same seed yield
// the same bands, so the tests can pin exact percentiles.
// ============================================================

import { projectPeriod, type ProjectionAssumptions } from './project';
import type { FinancialStatements } from './statements';

/**
 * Deterministic, seedable PRNG (mulberry32). Returns a function yielding
 * uniform draws in [0, 1). Reproducible across platforms so simulation output
 * is stable for a given seed — the property the golden tests rely on.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal draw via Box–Muller, consuming two uniforms from `rng`. */
function gaussian(rng: () => number): number {
  // Guard the log against an exact 0 draw (mulberry32 can return 0).
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Dispersion applied to a single numeric driver. The base value is the mean; the
 * draw is `base + sigma · N(0,1)`, where sigma combines an ABSOLUTE term (in the
 * driver's own units — the right choice for rates, e.g. ±2pp on a growth rate)
 * and a RELATIVE term scaled by |base| (the right choice for levels, e.g. ±15%
 * of capex). Bounds clamp the post-draw value (e.g. a margin into [0, 1]).
 */
export interface DriverNoise {
  /** Standard deviation added in the driver's own units (e.g. 0.02 = ±2pp). */
  absoluteSigma?: number;
  /** Standard deviation as a fraction of |base| (e.g. 0.15 = ±15% of the base). */
  relativeSigma?: number;
  /** Lower clamp applied after the draw. */
  min?: number;
  /** Upper clamp applied after the draw. */
  max?: number;
}

/** Per-driver dispersion. Only the numeric kernel drivers are perturbed. */
export type DriverDistributions = Partial<Record<keyof ProjectionAssumptions, DriverNoise>>;

/** A metric read off a projected period's statements (e.g. ending cash). */
export type MetricSelector = (state: FinancialStatements) => number;

/** Percentile band + moments for one metric over the Monte-Carlo draws. */
export interface MetricSummary {
  mean: number;
  min: number;
  max: number;
  /** Percentile values, keyed by the requested percentile (e.g. p5, p50, p95). */
  percentiles: Record<string, number>;
}

export interface SimulationSummary {
  draws: number;
  /** The percentiles computed, in ascending order (e.g. [5, 50, 95]). */
  percentilePoints: number[];
  /** One entry per projected period; each maps a metric name → its summary. */
  periods: Array<Record<string, MetricSummary>>;
}

export interface SimulationOptions {
  /** Number of Monte-Carlo paths. */
  draws: number;
  /** RNG seed (reproducible output). Defaults to a fixed constant. */
  seed?: number;
  /** Percentiles to report (0–100). Defaults to [5, 50, 95]. */
  percentiles?: number[];
}

const DEFAULT_SEED = 0x9e3779b9; // golden-ratio constant; arbitrary but fixed

/** Draw one perturbed assumption set around `base`. Non-perturbed keys pass through. */
function drawAssumptions(
  base: ProjectionAssumptions,
  distributions: DriverDistributions,
  rng: () => number,
): ProjectionAssumptions {
  const out: ProjectionAssumptions = { ...base };
  for (const key of Object.keys(distributions) as Array<keyof ProjectionAssumptions>) {
    const noise = distributions[key];
    if (!noise) continue;
    const baseVal = base[key];
    if (typeof baseVal !== 'number') continue; // skip non-numeric (e.g. debtSweep)
    const sigma = (noise.absoluteSigma ?? 0) + (noise.relativeSigma ?? 0) * Math.abs(baseVal);
    let v = baseVal + sigma * gaussian(rng);
    if (noise.min != null) v = Math.max(noise.min, v);
    if (noise.max != null) v = Math.min(noise.max, v);
    (out[key] as number) = v;
  }
  return out;
}

/** Linear-interpolated percentile (R-7) over an already-sorted ascending array. */
export function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function summarize(values: number[], pts: number[]): MetricSummary {
  const sorted = [...values].sort((x, y) => x - y);
  const percentiles: Record<string, number> = {};
  for (const p of pts) percentiles[`p${p}`] = percentile(sorted, p);
  let sum = 0;
  for (const v of values) sum += v;
  return {
    mean: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    percentiles,
  };
}

/**
 * Run a Monte-Carlo simulation over the projection kernel.
 *
 * For each of `options.draws` paths the kernel is chained `periods` forward;
 * every period's base driver set (from `baseAssumptionsFor`, typically
 * `deriveDefaultAssumptions` + overrides) is perturbed by `distributions`, and
 * the requested `metrics` are read off each projected period. The per-period,
 * per-metric distributions are then reduced to percentile bands.
 *
 * Pure and in-memory: no DB, nothing persisted. Reproducible for a given seed.
 */
export function simulateProjection(
  opening: FinancialStatements,
  periods: number,
  baseAssumptionsFor: (periodIndex: number, openingForPeriod: FinancialStatements) => ProjectionAssumptions,
  distributions: DriverDistributions,
  metrics: Record<string, MetricSelector>,
  options: SimulationOptions,
): SimulationSummary {
  const { draws } = options;
  const pts = options.percentiles ?? [5, 50, 95];
  const metricNames = Object.keys(metrics);

  if (draws < 1) {
    return {
      draws,
      percentilePoints: [...pts].sort((a, b) => a - b),
      periods: Array.from({ length: periods }, () => {
        const summary: Record<string, MetricSummary> = {};
        for (const m of metricNames) {
          const percentiles: Record<string, number> = {};
          for (const p of pts) percentiles[`p${p}`] = 0;
          summary[m] = { mean: 0, min: 0, max: 0, percentiles };
        }
        return summary;
      }),
    };
  }

  const rng = makeRng(options.seed ?? DEFAULT_SEED);

  // samples[periodIndex][metricIndex] = number[draws]
  const samples: number[][][] = Array.from({ length: periods }, () =>
    metricNames.map(() => new Array<number>(draws)),
  );

  for (let d = 0; d < draws; d++) {
    let state = opening;
    for (let p = 0; p < periods; p++) {
      const a = drawAssumptions(baseAssumptionsFor(p, state), distributions, rng);
      state = projectPeriod(state, a);
      for (let m = 0; m < metricNames.length; m++) {
        samples[p][m][d] = metrics[metricNames[m]](state);
      }
    }
  }

  const periodSummaries = samples.map((perMetric) => {
    const summary: Record<string, MetricSummary> = {};
    perMetric.forEach((vals, m) => {
      summary[metricNames[m]] = summarize(vals, pts);
    });
    return summary;
  });

  return { draws, percentilePoints: [...pts].sort((a, b) => a - b), periods: periodSummaries };
}

/**
 * The standard cash-flow / earnings metrics read off a projected period. Exposed
 * so the forecast route and the engine simulation report the same band lines.
 */
export const CASH_FLOW_METRICS: Record<string, MetricSelector> = {
  revenue: (s) => s.incomeStatement.revenue,
  netIncome: (s) => s.incomeStatement.netIncome,
  operatingCashFlow: (s) => s.cashFlow.operatingCashFlow,
  investingCashFlow: (s) => s.cashFlow.investingCashFlow,
  financingCashFlow: (s) => s.cashFlow.financingCashFlow,
  netChangeInCash: (s) => s.cashFlow.netChangeInCash,
  endingCash: (s) => s.balanceSheet.cash,
};

/**
 * Default driver dispersion for forecast uncertainty bands (LOW.6). Absolute
 * sigmas on the rates (growth/margin/opex in percentage points, interest in
 * points), relative on the capex level. These replace the old hardcoded
 * ±5/8/3%-per-month fan: the band now comes from perturbing the model's own
 * drivers and running them through the kernel, not from a flat % on the mean.
 */
export const DEFAULT_FORECAST_DISPERSION: DriverDistributions = {
  revenueGrowthRate: { absoluteSigma: 0.02 },
  grossMarginRate: { absoluteSigma: 0.02, min: 0, max: 1 },
  opexGrowthRate: { absoluteSigma: 0.02 },
  interestRate: { absoluteSigma: 0.005, min: 0 },
  capex: { relativeSigma: 0.15, min: 0 },
};
