// Pure, dependency-free helpers for the dashboard view: number/period
// transforms, chart-data builders, the financial-health scorecard model, and
// the small data maps. Extracted from dashboard-view.tsx so the component is
// JSX/wiring only and this logic is independently testable.
import { CheckCircle2, DollarSign, Database, Building2 } from 'lucide-react';
import type { KPIs, IncomeStatement, CashFlowStatement, EntityBreakdown, AuditEntry, ExchangeRateInfo } from '@/lib/types';

// Recharts categorical palette for the dashboard charts.
export const COLORS = ['#10b981', '#0d9488', '#f59e0b', '#64748b', '#f97316'];

// Placeholder figures shown only before the first consolidation resolves, or if
// it fails (in which case a visible banner makes clear the data is not live).
// Real KPIs, charts and trends are all derived from the consolidation run.
export const placeholderKPIs: KPIs = {
  totalRevenue: 52_000_000,
  totalEBITDA: 4_530_000,
  ebitdaMargin: 8.7,
  netIncome: 1_390_000,
  totalAssets: 48_210_000,
  netDebt: 4_152_000,
  leverage: 0.92,
  roe: 12.0,
  roce: 9.5,
  liquidityRatio: 1.8,
};

export type WaterfallRow = { name: string; value: number; type: 'positive' | 'negative' | 'subtotal' | 'total' };

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2024-03' → 'Mar'
export function monthLabel(period: string): string {
  const m = parseInt(period.split('-')[1] || '', 10);
  return MONTH_LABELS[m - 1] ?? period;
}

// '2024-12' → '2024-11'; '2024-01' → '2023-12' (for period-over-period deltas)
export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Income statement → waterfall rows. COGS/OPEX/D&A/Interest/Tax are stored
// negative by the engine, so they flow straight in as the descending steps.
export function buildWaterfall(is: IncomeStatement): WaterfallRow[] {
  return [
    { name: 'Revenue', value: is.revenue, type: 'positive' },
    { name: 'COGS', value: is.cogs, type: 'negative' },
    { name: 'Gross Profit', value: is.grossProfit, type: 'subtotal' },
    { name: 'OPEX', value: is.opex, type: 'negative' },
    { name: 'EBITDA', value: is.ebitda, type: 'subtotal' },
    { name: 'D&A', value: is.depreciation, type: 'negative' },
    { name: 'EBIT', value: is.ebit, type: 'subtotal' },
    { name: 'Interest', value: is.interestExpense, type: 'negative' },
    { name: 'EBT', value: is.ebt, type: 'subtotal' },
    { name: 'Tax', value: is.taxExpense, type: 'negative' },
    { name: 'Net Income', value: is.netIncome, type: 'total' },
  ];
}

// Build stacked waterfall chart data with an invisible base bar.
export function buildWaterfallChartData(rows: WaterfallRow[]) {
  let running = 0;
  return rows.map((item) => {
    let base: number;
    let barValue: number;
    if (item.type === 'positive' || item.type === 'total') {
      base = 0;
      barValue = item.value;
    } else if (item.type === 'negative') {
      running += item.value;
      base = running;
      barValue = Math.abs(item.value);
    } else {
      running = item.value;
      base = 0;
      barValue = item.value;
    }
    if (item.type === 'positive') running = item.value;
    return { name: item.name, base, barValue, type: item.type, rawValue: item.value };
  });
}

// Cash-flow statement → bridge cards.
export function buildCashFlowBridge(cf: CashFlowStatement) {
  return [
    { label: 'Operating CF', value: cf.operatingCashFlow, color: '#10b981' },
    { label: 'Investing CF', value: cf.investingCashFlow, color: '#f59e0b' },
    { label: 'Financing CF', value: cf.financingCashFlow, color: '#64748b' },
    { label: 'Net Change', value: cf.netChangeInCash, color: '#0d9488' },
  ];
}

// Period-over-period KPI deltas for the card trend badges. Returns an empty map
// when there is no prior-period data, so badges are simply omitted rather than
// fabricated. Keyed by KPI card title.
export function computeCardDeltas(curr: KPIs, prev: KPIs | null): Record<string, { trend: string; trendUp: boolean }> {
  if (!prev || prev.totalRevenue <= 0) return {};
  const out: Record<string, { trend: string; trendUp: boolean }> = {};
  const pct = (c: number, p: number) => (p !== 0 ? ((c - p) / Math.abs(p)) * 100 : 0);
  const signedPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const signedPp = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`;

  const rev = pct(curr.totalRevenue, prev.totalRevenue);
  out['Total Revenue'] = { trend: signedPct(rev), trendUp: rev >= 0 };
  const ni = pct(curr.netIncome, prev.netIncome);
  out['Net Income'] = { trend: signedPct(ni), trendUp: ni >= 0 };
  const ta = pct(curr.totalAssets, prev.totalAssets);
  out['Total Assets'] = { trend: signedPct(ta), trendUp: ta >= 0 };
  const margPp = curr.ebitdaMargin - prev.ebitdaMargin;
  out['EBITDA Margin'] = { trend: signedPp(margPp), trendUp: margPp >= 0 };
  const rocePp = curr.roce - prev.roce;
  out['ROCE'] = { trend: signedPp(rocePp), trendUp: rocePp >= 0 };
  const lev = curr.leverage - prev.leverage; // lower leverage is better
  out['Net Debt / EBITDA'] = { trend: `${lev >= 0 ? '+' : ''}${lev.toFixed(2)}x`, trendUp: lev <= 0 };
  return out;
}

// ============================================================
// FINANCIAL HEALTH SCORECARD MODEL
// ============================================================

export type TrafficLight = 'green' | 'amber' | 'red';
export type HealthLabel = 'Strong' | 'Moderate' | 'At Risk';

export interface HealthIndicator {
  name: string;
  value: number;
  displayValue: string;
  trafficLight: TrafficLight;
  label: HealthLabel;
  progressPct: number; // 0-100 representing where in the range
  thresholdNote: string;
  weight: number; // weight for overall score calculation
  score: number; // 0-100 score for this indicator
}

export function computeHealthIndicators(kpis: KPIs, revenueGrowth: number, ebit: number, interestExpenseAbs: number): HealthIndicator[] {
  // Revenue Growth: Green >5%, Amber 0-5%, Red <0% (period-over-period, from the consolidation runs)
  const revenueGrowthScore = revenueGrowth > 5 ? 100 : revenueGrowth > 0 ? (revenueGrowth / 5) * 70 + 30 : Math.max(0, (revenueGrowth / 0) * 30);
  const revenueGrowthTL: TrafficLight = revenueGrowth > 5 ? 'green' : revenueGrowth >= 0 ? 'amber' : 'red';
  const revenueGrowthLabel: HealthLabel = revenueGrowth > 5 ? 'Strong' : revenueGrowth >= 0 ? 'Moderate' : 'At Risk';

  // EBITDA Margin: Green >25%, Amber 15-25%, Red <15%
  const ebitdaMargin = kpis.ebitdaMargin;
  const ebitdaMarginScore = ebitdaMargin > 25 ? 100 : ebitdaMargin >= 15 ? ((ebitdaMargin - 15) / 10) * 70 + 30 : Math.max(0, (ebitdaMargin / 15) * 30);
  const ebitdaMarginTL: TrafficLight = ebitdaMargin > 25 ? 'green' : ebitdaMargin >= 15 ? 'amber' : 'red';
  const ebitdaMarginLabel: HealthLabel = ebitdaMargin > 25 ? 'Strong' : ebitdaMargin >= 15 ? 'Moderate' : 'At Risk';

  // Leverage Ratio: Green <2x, Amber 2-4x, Red >4x
  const leverage = kpis.leverage;
  const leverageScore = leverage < 2 ? 100 : leverage <= 4 ? 100 - ((leverage - 2) / 2) * 70 : Math.max(0, 30 - ((leverage - 4) / 2) * 30);
  const leverageTL: TrafficLight = leverage < 2 ? 'green' : leverage <= 4 ? 'amber' : 'red';
  const leverageLabel: HealthLabel = leverage < 2 ? 'Strong' : leverage <= 4 ? 'Moderate' : 'At Risk';

  // Liquidity Ratio: Green >1.5, Amber 1.0-1.5, Red <1.0
  const liquidity = kpis.liquidityRatio;
  const liquidityScore = liquidity > 1.5 ? 100 : liquidity >= 1.0 ? ((liquidity - 1.0) / 0.5) * 70 + 30 : Math.max(0, (liquidity / 1.0) * 30);
  const liquidityTL: TrafficLight = liquidity > 1.5 ? 'green' : liquidity >= 1.0 ? 'amber' : 'red';
  const liquidityLabel: HealthLabel = liquidity > 1.5 ? 'Strong' : liquidity >= 1.0 ? 'Moderate' : 'At Risk';

  // ROE: Green >15%, Amber 8-15%, Red <8%
  const roe = kpis.roe;
  const roeScore = roe > 15 ? 100 : roe >= 8 ? ((roe - 8) / 7) * 70 + 30 : Math.max(0, (roe / 8) * 30);
  const roeTL: TrafficLight = roe > 15 ? 'green' : roe >= 8 ? 'amber' : 'red';
  const roeLabel: HealthLabel = roe > 15 ? 'Strong' : roe >= 8 ? 'Moderate' : 'At Risk';

  // Interest Coverage: Green >5x, Amber 2-5x, Red <2x (EBIT/Interest, from the live run)
  const interestCoverage = interestExpenseAbs > 0 ? ebit / interestExpenseAbs : 25;
  const interestCoverageScore = interestCoverage > 5 ? 100 : interestCoverage >= 2 ? ((interestCoverage - 2) / 3) * 70 + 30 : Math.max(0, (interestCoverage / 2) * 30);
  const interestCoverageTL: TrafficLight = interestCoverage > 5 ? 'green' : interestCoverage >= 2 ? 'amber' : 'red';
  const interestCoverageLabel: HealthLabel = interestCoverage > 5 ? 'Strong' : interestCoverage >= 2 ? 'Moderate' : 'At Risk';

  return [
    {
      name: 'Revenue Growth',
      value: revenueGrowth,
      displayValue: `+${revenueGrowth}%`,
      trafficLight: revenueGrowthTL,
      label: revenueGrowthLabel,
      progressPct: Math.min(100, Math.max(0, revenueGrowthScore)),
      thresholdNote: 'Green >5% | Amber 0-5% | Red <0%',
      weight: 0.15,
      score: revenueGrowthScore,
    },
    {
      name: 'EBITDA Margin',
      value: ebitdaMargin,
      displayValue: `${ebitdaMargin.toFixed(1)}%`,
      trafficLight: ebitdaMarginTL,
      label: ebitdaMarginLabel,
      progressPct: Math.min(100, Math.max(0, ebitdaMarginScore)),
      thresholdNote: 'Green >25% | Amber 15-25% | Red <15%',
      weight: 0.20,
      score: ebitdaMarginScore,
    },
    {
      name: 'Leverage Ratio',
      value: leverage,
      displayValue: `${leverage.toFixed(2)}x`,
      trafficLight: leverageTL,
      label: leverageLabel,
      progressPct: Math.min(100, Math.max(0, leverageScore)),
      thresholdNote: 'Green <2x | Amber 2-4x | Red >4x',
      weight: 0.20,
      score: leverageScore,
    },
    {
      name: 'Liquidity Ratio',
      value: liquidity,
      displayValue: `${liquidity.toFixed(1)}x`,
      trafficLight: liquidityTL,
      label: liquidityLabel,
      progressPct: Math.min(100, Math.max(0, liquidityScore)),
      thresholdNote: 'Green >1.5 | Amber 1.0-1.5 | Red <1.0',
      weight: 0.15,
      score: liquidityScore,
    },
    {
      name: 'ROE',
      value: roe,
      displayValue: `${roe.toFixed(1)}%`,
      trafficLight: roeTL,
      label: roeLabel,
      progressPct: Math.min(100, Math.max(0, roeScore)),
      thresholdNote: 'Green >15% | Amber 8-15% | Red <8%',
      weight: 0.15,
      score: roeScore,
    },
    {
      name: 'Interest Coverage',
      value: interestCoverage,
      displayValue: `${interestCoverage.toFixed(1)}x`,
      trafficLight: interestCoverageTL,
      label: interestCoverageLabel,
      progressPct: Math.min(100, Math.max(0, interestCoverageScore)),
      thresholdNote: 'Green >5x | Amber 2-5x | Red <2x',
      weight: 0.15,
      score: interestCoverageScore,
    },
  ];
}

export function computeOverallScore(indicators: HealthIndicator[]): number {
  return Math.round(indicators.reduce((sum, ind) => sum + ind.score * ind.weight, 0));
}

export function getTrafficLightColors(tl: TrafficLight): { bg: string; fill: string; ring: string; text: string; progressBar: string } {
  switch (tl) {
    case 'green':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        fill: 'fill-emerald-500',
        ring: 'ring-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-400',
        progressBar: 'bg-emerald-500',
      };
    case 'amber':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        fill: 'fill-amber-500',
        ring: 'ring-amber-400',
        text: 'text-amber-700 dark:text-amber-400',
        progressBar: 'bg-amber-500',
      };
    case 'red':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        fill: 'fill-red-500',
        ring: 'ring-red-400',
        text: 'text-red-700 dark:text-red-400',
        progressBar: 'bg-red-500',
      };
  }
}

// ============================================================
// ACTIVITY FEED / HEALTH SCORE / FX SNAPSHOT
// ============================================================

// Map a synthesized audit actionType → display icon + accent colour.
export const ACTIVITY_META: Record<AuditEntry['actionType'], { icon: typeof CheckCircle2; color: string }> = {
  consolidation: { icon: CheckCircle2, color: 'text-emerald-500' },
  fx: { icon: DollarSign, color: 'text-teal-500' },
  import: { icon: Database, color: 'text-amber-500' },
  entity: { icon: Building2, color: 'text-slate-500' },
};

// ISO timestamp → "2 min ago" / "3 hours ago" / "1 day ago".
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Entity health 0–100 derived from real per-entity figures: rewards EBITDA
// margin, penalises leverage. A heuristic, but driven entirely by the run data
// (no hardcoded scores or placeholder entity codes).
export function entityHealthScore(e: EntityBreakdown): number {
  const rev = e.incomeStatement.revenue;
  const ebitda = e.incomeStatement.ebitda;
  const margin = rev > 0 ? (ebitda / rev) * 100 : 0;
  const netDebt = (e.balanceSheet.shortTermDebt + e.balanceSheet.longTermDebt) - e.balanceSheet.cash;
  const leverage = ebitda > 0 ? netDebt / ebitda : 0;
  const marginPts = Math.max(0, Math.min(70, margin * 2));          // 35% margin → 70 pts
  const leveragePts = Math.max(0, Math.min(30, 30 - leverage * 10)); // 0x → 30 pts, 3x → 0
  return Math.round(Math.max(0, Math.min(100, marginPts + leveragePts)));
}

// Build the FX "Market Snapshot" tiles from real exchange-rate rows. The DB
// stores "1 EUR = X currency", so each row is the EUR/X quote directly. Change
// is the closing-vs-historical (YTD) move; the sparkline uses whatever dated
// points exist (historical → average → closing).
export function buildMarketSnapshot(rates: ExchangeRateInfo[]): Array<{ pair: string; rate: string; change: string; up: boolean; sparkline: number[] }> {
  const byCurrency = new Map<string, ExchangeRateInfo[]>();
  for (const r of rates) {
    if (r.currency === 'EUR') continue;
    const list = byCurrency.get(r.currency) ?? [];
    list.push(r);
    byCurrency.set(r.currency, list);
  }
  const preferred = ['USD', 'GBP', 'JPY', 'CHF'];
  const currencies = [...byCurrency.keys()]
    .sort((a, b) => {
      const ia = preferred.indexOf(a);
      const ib = preferred.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    })
    .slice(0, 3);

  return currencies.map((cur) => {
    const list = byCurrency.get(cur)!;
    const closing = list.find((r) => r.rateType === 'closing') ?? list[list.length - 1];
    const historical = list.find((r) => r.rateType === 'historical');
    const average = list.find((r) => r.rateType === 'average');
    const rateVal = closing.rate;
    let change = '';
    let up = true;
    if (historical && historical.rate > 0) {
      const pct = ((rateVal - historical.rate) / historical.rate) * 100;
      up = pct >= 0;
      change = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% YTD`;
    }
    const series = [historical?.rate, average?.rate, rateVal].filter((v): v is number => typeof v === 'number');
    return {
      pair: `EUR/${cur}`,
      rate: rateVal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
      change,
      up,
      sparkline: series.length >= 2 ? series : [rateVal, rateVal],
    };
  });
}
