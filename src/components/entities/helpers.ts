// Pure, dependency-free helpers for the entities view: the comparison-metric
// model, ownership math, ratio/CSV builders, and the small presentation-data
// maps. Extracted from entities-view.tsx so the component is JSX/wiring only and
// this logic is independently testable.
import type { Entity, IncomeStatement, BalanceSheet } from '@/lib/types';

export const PIE_COLORS = ['#10b981', '#f59e0b', '#64748b'];

// Ratio divide that returns 0 (not NaN/Infinity) when the denominator is 0 —
// mirrors the finance engine's `x !== 0 ? a / x : 0` convention so an entity
// with no statements yet (e.g. an entity created empty, with zero revenue/
// equity/assets) renders 0.0%, not "NaN%"/"Infinityx".
function safeDiv(numerator: number, denominator: number): number {
  return denominator !== 0 ? numerator / denominator : 0;
}

export const countryFlags: Record<string, string> = {
  PT: '🇵🇹', ES: '🇪🇸', DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷',
  IT: '🇮🇹', NL: '🇳🇱', US: '🇺🇸', CH: '🇨🇭', JP: '🇯🇵',
};

export const countryNames: Record<string, string> = {
  PT: 'Portugal', ES: 'Spain', DE: 'Germany', GB: 'United Kingdom', FR: 'France',
  IT: 'Italy', NL: 'Netherlands', US: 'United States', CH: 'Switzerland', JP: 'Japan',
};

// Revenue sparkline data per entity (last 6 months trend) — presentation decoration.
export const sparklineData: Record<string, number[]> = {
  PT0001: [12500, 13200, 13800, 14200, 14600, 15000],
  ES0002: [10200, 10800, 11200, 11500, 11800, 12000],
  DE0003: [8800, 9200, 9600, 10000, 10200, 10500],
  UK0004: [6800, 7200, 7500, 7800, 8100, 8400],
  FR0005: [5000, 5200, 5400, 5600, 5800, 6000],
};

// Geographic map data shown as the country cards above the table.
export const geoData = [
  { code: 'PT', flag: '🇵🇹', name: 'Portugal', entity: 'PT0001', revenue: '€15.0M', method: 'Full', ownership: 100 },
  { code: 'ES', flag: '🇪🇸', name: 'Spain', entity: 'ES0002', revenue: '€12.0M', method: 'Full', ownership: 100 },
  { code: 'DE', flag: '🇩🇪', name: 'Germany', entity: 'DE0003', revenue: '€10.5M', method: 'Full', ownership: 80 },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom', entity: 'UK0004', revenue: '€8.4M', method: 'Full', ownership: 100 },
  { code: 'FR', flag: '🇫🇷', name: 'France', entity: 'FR0005', revenue: '€6.0M', method: 'Proportional', ownership: 50 },
];

// Ownership is stored either as a fraction (0–1) or a percentage (0–100);
// normalise to a percentage (0–100) regardless of how it was entered.
export function normalizeOwnership(ownershipPercentage: number): number {
  return ownershipPercentage <= 1 ? ownershipPercentage * 100 : ownershipPercentage;
}

// Pure part of the CSV export: build the file contents. The component owns the
// Blob/anchor download (browser-only) so this stays testable.
export function toEntityCSV(entities: Entity[]): string {
  const headers = ['Code', 'Legal Name', 'Country', 'Currency', 'Method', 'Ownership %', 'Sector', 'Status'];
  const rows = entities.map(e => [
    e.code,
    e.legalName,
    e.countryCode,
    e.localCurrency,
    e.consolidationMethod,
    Math.round(normalizeOwnership(e.ownershipPercentage)),
    e.sector || '',
    e.isActive ? 'Active' : 'Inactive',
  ]);
  return [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
}

// ============================================================
// ENTITY COMPARISON
// ============================================================

export interface ComparisonMetric {
  label: string;
  entityA: number;
  entityB: number;
  format: 'currency' | 'percent' | 'ratio';
  higherIsBetter: boolean;
}

export function buildComparisonMetrics(isA: IncomeStatement, bsA: BalanceSheet, isB: IncomeStatement, bsB: BalanceSheet): ComparisonMetric[] {
  return [
    // Income Statement
    { label: 'Revenue', entityA: isA.revenue, entityB: isB.revenue, format: 'currency', higherIsBetter: true },
    { label: 'COGS', entityA: Math.abs(isA.cogs), entityB: Math.abs(isB.cogs), format: 'currency', higherIsBetter: false },
    { label: 'Gross Profit', entityA: isA.grossProfit, entityB: isB.grossProfit, format: 'currency', higherIsBetter: true },
    { label: 'EBITDA', entityA: isA.ebitda, entityB: isB.ebitda, format: 'currency', higherIsBetter: true },
    { label: 'EBIT', entityA: isA.ebit, entityB: isB.ebit, format: 'currency', higherIsBetter: true },
    { label: 'Net Income', entityA: isA.netIncome, entityB: isB.netIncome, format: 'currency', higherIsBetter: true },
    // Balance Sheet
    { label: 'Total Assets', entityA: bsA.totalAssets, entityB: bsB.totalAssets, format: 'currency', higherIsBetter: true },
    { label: 'Current Assets', entityA: bsA.currentAssets, entityB: bsB.currentAssets, format: 'currency', higherIsBetter: true },
    { label: 'Total Liabilities', entityA: bsA.totalLiabilities, entityB: bsB.totalLiabilities, format: 'currency', higherIsBetter: false },
    { label: 'Total Equity', entityA: bsA.totalEquity, entityB: bsB.totalEquity, format: 'currency', higherIsBetter: true },
    // Key Ratios
    { label: 'ROE', entityA: safeDiv(isA.netIncome, bsA.totalEquity) * 100, entityB: safeDiv(isB.netIncome, bsB.totalEquity) * 100, format: 'percent', higherIsBetter: true },
    { label: 'ROA', entityA: safeDiv(isA.netIncome, bsA.totalAssets) * 100, entityB: safeDiv(isB.netIncome, bsB.totalAssets) * 100, format: 'percent', higherIsBetter: true },
    { label: 'EBITDA Margin', entityA: safeDiv(isA.ebitda, isA.revenue) * 100, entityB: safeDiv(isB.ebitda, isB.revenue) * 100, format: 'percent', higherIsBetter: true },
    { label: 'Current Ratio', entityA: safeDiv(bsA.currentAssets, bsA.currentLiabilities), entityB: safeDiv(bsB.currentAssets, bsB.currentLiabilities), format: 'ratio', higherIsBetter: true },
    { label: 'Debt/Equity', entityA: safeDiv(bsA.totalLiabilities, bsA.totalEquity), entityB: safeDiv(bsB.totalLiabilities, bsB.totalEquity), format: 'ratio', higherIsBetter: false },
  ];
}

// KNOWN DEVIATION from the shared src/lib/format.ts formatters: the comparison
// metrics fed here are stored in EUR-thousands (€K), so the currency branch
// divides by 1_000 and labels "€M". The shared `formatCompactEUR` expects full
// euros and would render these values 1000× too small. Do NOT swap in
// `formatCompactEUR` without first rescaling the inputs to full euros.
export function formatMetricValue(value: number, format: 'currency' | 'percent' | 'ratio'): string {
  switch (format) {
    case 'currency':
      return `€${(value / 1000).toFixed(1)}M`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return `${value.toFixed(2)}x`;
  }
}

// A − B delta for a metric, with the "good direction" resolved via higherIsBetter.
export function computeMetricDelta(metric: ComparisonMetric): { diff: number; pctDiff: number; isPositive: boolean } {
  const diff = metric.entityA - metric.entityB;
  const pctDiff = metric.entityB !== 0 ? (diff / Math.abs(metric.entityB)) * 100 : 0;
  const isPositive = metric.higherIsBetter ? diff > 0 : diff < 0;
  return { diff, pctDiff, isPositive };
}

// How many metrics each entity "leads" (is better on, per higherIsBetter).
export function countMetricLeads(metrics: ComparisonMetric[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const m of metrics) {
    if (m.higherIsBetter ? m.entityA > m.entityB : m.entityA < m.entityB) a++;
    if (m.higherIsBetter ? m.entityB > m.entityA : m.entityB < m.entityA) b++;
  }
  return { a, b };
}

// Grouped bar-chart series for the visual comparison (keyed by entity code).
export function buildEntityBarChartData(isA: IncomeStatement, bsA: BalanceSheet, isB: IncomeStatement, bsB: BalanceSheet, entityA: Entity, entityB: Entity): Array<Record<string, string | number>> {
  return [
    { metric: 'Revenue', [entityA.code]: isA.revenue, [entityB.code]: isB.revenue },
    { metric: 'EBITDA', [entityA.code]: isA.ebitda, [entityB.code]: isB.ebitda },
    { metric: 'Net Income', [entityA.code]: isA.netIncome, [entityB.code]: isB.netIncome },
    { metric: 'Total Assets', [entityA.code]: bsA.totalAssets, [entityB.code]: bsB.totalAssets },
  ];
}

// ============================================================
// OWNERSHIP / MINORITY INTEREST
// ============================================================

export interface OwnershipWaterfallBar {
  name: string;
  value: number;
  fill: string;
}

// Splits net income into the minority and group shares for the impact waterfall.
export function buildOwnershipWaterfall(is: IncomeStatement, entity: Entity): OwnershipWaterfallBar[] {
  const ownership = normalizeOwnership(entity.ownershipPercentage);
  const minorityPct = 100 - ownership;
  const netIncome = is.netIncome;
  const minorityShare = netIncome * (minorityPct / 100);
  const groupShare = netIncome - minorityShare;
  return [
    { name: 'Net Income', value: netIncome, fill: '#10b981' },
    { name: 'Minority Share', value: -minorityShare, fill: '#f59e0b' },
    { name: 'Group Share', value: groupShare, fill: '#0d9488' },
  ];
}

// Group/minority split for the ownership-structure pie.
export function buildOwnershipData(entity: Entity): Array<{ name: string; value: number }> {
  const group = normalizeOwnership(entity.ownershipPercentage);
  return [
    { name: 'Group Share', value: group },
    { name: 'Minority', value: 100 - group },
  ];
}

// The four headline ratios shown in the entity detail drawer.
export function buildFinancialRatios(is: IncomeStatement, bs: BalanceSheet): Array<{ label: string; value: string; color: string }> {
  return [
    { label: 'ROE', value: (safeDiv(is.netIncome, bs.totalEquity) * 100).toFixed(1) + '%', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'ROA', value: (safeDiv(is.netIncome, bs.totalAssets) * 100).toFixed(1) + '%', color: 'text-teal-600 dark:text-teal-400' },
    { label: 'Current Ratio', value: safeDiv(bs.currentAssets, bs.currentLiabilities).toFixed(2) + 'x', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Debt/Equity', value: safeDiv(bs.totalLiabilities, bs.totalEquity).toFixed(2) + 'x', color: 'text-amber-600 dark:text-amber-400' },
  ];
}
