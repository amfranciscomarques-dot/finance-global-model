'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, CircleDollarSign, Percent, Loader2, Play, FileDown, GitBranch, ArrowRight, Activity, Shield, CheckCircle2, AlertTriangle, XCircle, Clock, Building2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/lib/store';
import { runConsolidation, getEntities, getCOA, getExchangeRates, getTrendAnalysis, getConsolidationRuns, getAuditTrail, type ConsolidationRunRecord } from '@/lib/api';
import { KPIs, Entity, ConsolidatedResult, AuditEntry, ExchangeRateInfo } from '@/lib/types';
import { formatCompactEUR } from '@/lib/format';
import {
  COLORS,
  placeholderKPIs,
  monthLabel,
  previousPeriod,
  buildWaterfall,
  buildWaterfallChartData,
  buildCashFlowBridge,
  computeCardDeltas,
  computeHealthIndicators,
  computeOverallScore,
  getTrafficLightColors,
  entityHealthScore,
  buildMarketSnapshot,
  timeAgo,
  ACTIVITY_META,
  type TrafficLight,
} from './dashboard/helpers';
import { AnimatedCounter } from '@/components/animated-counter';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts';

// Custom tooltip component
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => {
        if (entry.name === 'base') return null;
        return (
          <p key={index} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-400">{entry.name}:</span>
            <span className="font-semibold">{typeof entry.value === 'number' ? formatCompactEUR(entry.value) : entry.value}</span>
          </p>
        );
      })}
    </div>
  );
}

function PercentTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">{entry.value.toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

function WaterfallTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; payload?: { rawValue: number; type: string } }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      <p className="font-semibold">
        {data.rawValue >= 0 ? '+' : ''}{formatCompactEUR(data.rawValue)}
      </p>
      <p className="text-slate-400 text-[10px] capitalize">{data.type}</p>
    </div>
  );
}

// KPI Loading Skeleton
function KPISkeleton() {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/30 dark:to-slate-900 border border-white/20 dark:border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 w-full">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

function getTrafficLightIcon(tl: TrafficLight) {
  switch (tl) {
    case 'green': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    case 'amber': return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
    case 'red': return <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
  }
}

function PeerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; payload?: { entity: string; name: string; score: number } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium text-slate-300">{data.name} ({data.entity})</p>
      <p className="font-semibold">Health Score: {data.score}/100</p>
    </div>
  );
}

export function DashboardView() {
  const { selectedPeriod, selectedScenario, setActiveView } = useAppStore();
  const [kpis, setKPIs] = useState<KPIs>(placeholderKPIs);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsolidatedResult | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<{ month: string; revenue: number; ebitda: number }[]>([]);
  const [cardDeltas, setCardDeltas] = useState<Record<string, { trend: string; trendUp: boolean }>>({});
  const [revenueGrowthPct, setRevenueGrowthPct] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('—');
  const [coaCount, setCoaCount] = useState(0);
  const [fxCount, setFxCount] = useState(0);
  const [rates, setRates] = useState<ExchangeRateInfo[]>([]);
  const [runs, setRuns] = useState<ConsolidationRunRecord[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [kpiTrendSeries, setKpiTrendSeries] = useState<{ netIncome: number[]; assets: number[]; leverage: number[] }>({ netIncome: [], assets: [], leverage: [] });

  const ebitdaMarginTrend = revenueTrend.map(r => ({
    month: r.month,
    margin: r.revenue > 0 ? (r.ebitda / r.revenue * 100) : 0
  }));

  // Charts derived straight from the live consolidation result.
  const entityContribution = useMemo(
    () => (result?.entityBreakdown ?? []).map((e) => ({
      name: e.legalName,
      value: e.incomeStatement.revenue,
      code: e.entityCode,
    })),
    [result],
  );
  const waterfallChartData = useMemo(
    () => (result ? buildWaterfallChartData(buildWaterfall(result.incomeStatement)) : []),
    [result],
  );
  const cashFlowBridge = useMemo(
    () => (result ? buildCashFlowBridge(result.cashFlow) : []),
    [result],
  );

  // Entity Health Comparison — real per-entity scores with real codes/names.
  const peerComparisonData = useMemo(
    () => (result?.entityBreakdown ?? []).map((e) => ({
      entity: e.entityCode,
      name: e.legalName,
      score: entityHealthScore(e),
    })),
    [result],
  );

  // FX Market Snapshot tiles from the real exchange-rate rows.
  const marketSnapshot = useMemo(() => buildMarketSnapshot(rates), [rates]);

  // Recent Consolidation Runs — the actual audit rows from the engine.
  const recentConsolidationRuns = useMemo(
    () => runs.slice(0, 3).map((r) => ({
      id: r.id,
      date: new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: r.status,
      revenue: formatCompactEUR(r.totalRevenue ?? 0),
      netIncome: formatCompactEUR(r.totalNetIncome ?? 0),
    })),
    [runs],
  );

  // Recent Activity feed — real synthesized audit entries.
  const recentActivity = useMemo(
    () => activity.slice(0, 5).map((a) => {
      const meta = ACTIVITY_META[a.actionType] ?? { icon: Clock, color: 'text-slate-500' };
      return { action: a.description, time: timeAgo(a.timestamp), icon: meta.icon, color: meta.color };
    }),
    [activity],
  );

  // Per-KPI mini sparklines from the real monthly trend series. ROCE has no
  // trend endpoint, so its card simply shows no sparkline (omitted, not faked).
  const ebitdaMarginSeries = useMemo(
    () => revenueTrend.map((r) => (r.revenue > 0 ? (r.ebitda / r.revenue) * 100 : 0)),
    [revenueTrend],
  );
  const kpiSparklines = useMemo<Record<string, number[]>>(
    () => ({
      'Total Revenue': revenueTrend.map((r) => r.revenue),
      'EBITDA Margin': ebitdaMarginSeries,
      'Net Income': kpiTrendSeries.netIncome,
      'Total Assets': kpiTrendSeries.assets,
      'Net Debt / EBITDA': kpiTrendSeries.leverage,
    }),
    [revenueTrend, ebitdaMarginSeries, kpiTrendSeries],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entitiesData = await getEntities();
      setEntities(entitiesData);

      // Real counts for the quick-stats row + FX snapshot (best-effort).
      try {
        const [coa, fxRates] = await Promise.all([getCOA(), getExchangeRates()]);
        if (Array.isArray(coa)) setCoaCount(coa.length);
        if (Array.isArray(fxRates)) {
          setFxCount(fxRates.length);
          setRates(fxRates);
        }
      } catch {}

      const entityCodes = entitiesData.map((e: Entity) => e.code);
      if (entityCodes.length === 0) {
        setError('No entities found — load a company pack to see live figures.');
        return;
      }

      // Current period drives the KPIs, waterfall, entity contribution and
      // cash-flow bridge; the prior period gives period-over-period deltas; the
      // trend endpoint gives the monthly Revenue/EBITDA series. All real data.
      const [current, prior, revTrend, ebitdaTrend, niTrend, assetTrend, levTrend, runsData, auditData] = await Promise.all([
        runConsolidation({ period: selectedPeriod, entityCodes, scenarioType: selectedScenario }),
        runConsolidation({ period: previousPeriod(selectedPeriod), entityCodes, scenarioType: selectedScenario }).catch(() => null),
        getTrendAnalysis({ metric: 'revenue' }).catch(() => null),
        getTrendAnalysis({ metric: 'ebitda' }).catch(() => null),
        getTrendAnalysis({ metric: 'netincome' }).catch(() => null),
        getTrendAnalysis({ metric: 'assets' }).catch(() => null),
        getTrendAnalysis({ metric: 'leverage' }).catch(() => null),
        getConsolidationRuns().catch(() => [] as ConsolidationRunRecord[]),
        getAuditTrail().catch(() => [] as AuditEntry[]),
      ]);

      setResult(current);
      if (current?.kpis) setKPIs(current.kpis);
      setRuns(runsData);
      setActivity(auditData);
      setKpiTrendSeries({
        netIncome: (niTrend?.periods ?? []).map((p) => p.value),
        assets: (assetTrend?.periods ?? []).map((p) => p.value),
        leverage: (levTrend?.periods ?? []).map((p) => p.value),
      });

      if (revTrend?.periods?.length) {
        const ebitdaByPeriod = new Map((ebitdaTrend?.periods ?? []).map((p) => [p.period, p.value]));
        setRevenueTrend(revTrend.periods.map((p) => ({
          month: monthLabel(p.period),
          revenue: p.value,
          ebitda: ebitdaByPeriod.get(p.period) ?? 0,
        })));
      }

      setCardDeltas(computeCardDeltas(current.kpis, prior?.kpis ?? null));
      const priorRevenue = prior?.kpis?.totalRevenue ?? 0;
      setRevenueGrowthPct(priorRevenue > 0 ? ((current.kpis.totalRevenue - priorRevenue) / priorRevenue) * 100 : 0);

      setLastUpdated(new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setError('Could not load live data from the server. Showing placeholder figures below.');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, selectedScenario]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Health indicators — revenue growth and interest coverage come from the run.
  const healthIndicators = useMemo(
    () => computeHealthIndicators(
      kpis,
      revenueGrowthPct,
      result?.incomeStatement.ebit ?? 0,
      result ? Math.abs(result.incomeStatement.interestExpense) : 0,
    ),
    [kpis, revenueGrowthPct, result],
  );
  const overallScore = useMemo(() => computeOverallScore(healthIndicators), [healthIndicators]);

  // Donut gauge data
  const gaugeData = [
    { name: 'Score', value: overallScore },
    { name: 'Remaining', value: 100 - overallScore },
  ];

  const overallColor = overallScore >= 75 ? '#10b981' : overallScore >= 50 ? '#f59e0b' : '#ef4444';

  // Scale values for display: API data is in full EUR, we show €X.XM
  const kpiCards = [
    {
      title: 'Total Revenue',
      value: kpis.totalRevenue / 1_000_000,
      displayValue: formatCompactEUR(kpis.totalRevenue),
      icon: DollarSign,
      description: 'Consolidated group revenue',
      gradient: 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900',
      accentFrom: 'from-emerald-500',
      accentTo: 'to-teal-500',
      prefix: '€',
      suffix: 'M',
      decimals: 1,
      linkView: 'consolidation' as const,
    },
    {
      title: 'EBITDA Margin',
      value: kpis.ebitdaMargin,
      displayValue: `${kpis.ebitdaMargin.toFixed(1)}%`,
      icon: Percent,
      description: 'Operating profitability',
      gradient: 'from-teal-50/80 to-white dark:from-teal-950/30 dark:to-slate-900',
      accentFrom: 'from-teal-500',
      accentTo: 'to-emerald-500',
      prefix: '',
      suffix: '%',
      decimals: 1,
      linkView: 'scenarios' as const,
    },
    {
      title: 'Net Income',
      value: kpis.netIncome / 1_000_000,
      displayValue: formatCompactEUR(kpis.netIncome),
      icon: BarChart3,
      description: 'Bottom-line earnings',
      gradient: 'from-amber-50/80 to-white dark:from-amber-950/30 dark:to-slate-900',
      accentFrom: 'from-amber-500',
      accentTo: 'to-orange-500',
      prefix: '€',
      suffix: 'M',
      decimals: 1,
      linkView: 'consolidation' as const,
    },
    {
      title: 'Total Assets',
      value: kpis.totalAssets / 1_000_000,
      displayValue: formatCompactEUR(kpis.totalAssets),
      icon: CircleDollarSign,
      description: 'Total group assets',
      gradient: 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900',
      accentFrom: 'from-emerald-500',
      accentTo: 'to-teal-500',
      prefix: '€',
      suffix: 'M',
      decimals: 1,
      linkView: 'entities' as const,
    },
    {
      title: 'Net Debt / EBITDA',
      value: kpis.leverage,
      displayValue: `${kpis.leverage.toFixed(2)}x`,
      icon: TrendingDown,
      description: 'Leverage ratio',
      gradient: 'from-slate-50/80 to-white dark:from-slate-800/30 dark:to-slate-900',
      accentFrom: 'from-slate-500',
      accentTo: 'to-slate-600',
      prefix: '',
      suffix: 'x',
      decimals: 2,
      linkView: 'scenarios' as const,
    },
    {
      title: 'ROCE',
      value: kpis.roce,
      displayValue: `${kpis.roce.toFixed(1)}%`,
      icon: TrendingUp,
      description: 'Return on capital employed',
      gradient: 'from-orange-50/80 to-white dark:from-orange-950/30 dark:to-slate-900',
      accentFrom: 'from-orange-500',
      accentTo: 'to-amber-500',
      prefix: '',
      suffix: '%',
      decimals: 1,
      linkView: 'scenarios' as const,
    },
  ];

  // Current date for greeting
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Quick Stats row data (derived from the loaded group, not hardcoded)
  const countries = Array.from(new Set(entities.map((e) => e.countryCode).filter(Boolean)));
  const currencies = Array.from(new Set(entities.map((e) => e.localCurrency).filter(Boolean)));
  const quickStats = [
    { label: 'Entities Active', value: String(entities.length || '—'), icon: Building2, color: 'text-emerald-600 dark:text-emerald-400', detail: `${entities.length} consolidated entities across ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}${countries.length ? ` (${countries.join(', ')})` : ''}` },
    { label: 'COA Accounts', value: String(coaCount || '—'), icon: BarChart3, color: 'text-teal-600 dark:text-teal-400', detail: `${coaCount} group chart-of-accounts codes with entity mappings` },
    { label: 'FX Rates', value: String(fxCount || '—'), icon: DollarSign, color: 'text-amber-600 dark:text-amber-400', detail: `${fxCount} exchange-rate entries (ECB convention: 1 EUR = X)` },
    { label: 'Currencies', value: String(currencies.length || '—'), icon: Shield, color: 'text-emerald-600 dark:text-emerald-400', detail: `Reporting in EUR; group currencies: ${currencies.join(', ') || '—'}` },
  ];

  // Inline sparkline SVG for KPI cards
  function MiniSparklineSVG({ data, color = '#10b981' }: { data: number[]; color?: string }) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 60;
    const h = 20;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    return (
      <svg width={w} height={h} className="opacity-60">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  function MarketSparklineSVG({ data, color }: { data: number[]; color: string }) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 0.001;
    const w = 48;
    const h = 16;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    return (
      <svg width={w} height={h} className="opacity-70">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Subtle animated gradient background */}
      <div className="absolute inset-0 -z-10 opacity-[0.03] dark:opacity-[0.05] pointer-events-none rounded-xl bg-gradient-to-br from-emerald-400 via-teal-400 to-emerald-300 animate-gradient" />

      {/* Data-load error banner — makes a failed fetch (and the placeholder
          figures shown in its place) explicit rather than silently fabricated. */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {/* Welcome Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
      >
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {greeting}, <span className="gradient-text-premium">Finance Team</span>
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {dateStr}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Last updated: {lastUpdated}
          </span>
        </div>
      </motion.div>

      {/* Quick Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-2"
      >
        {quickStats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <TooltipProvider key={stat.label} delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/50 shadow-sm cursor-default">
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                    <div>
                      <p className="text-sm font-bold tabular-nums">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-900 text-white text-xs border-slate-700 max-w-[220px]">
                  <p>{stat.detail}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </motion.div>

      {/* Quick Actions Row */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center gap-3"
      >
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/10 glass-card-premium !bg-emerald-600 hover:!bg-emerald-700"
          onClick={async () => {
            try {
              const e = entities.length > 0 ? entities : await getEntities();
              await runConsolidation({ period: selectedPeriod, entityCodes: e.map((x: Entity) => x.code), scenarioType: selectedScenario });
            } catch {}
          }}
        >
          <Play className="w-4 h-4 mr-1.5" /> Run Consolidation
        </Button>
        <Button variant="outline" className="shadow-sm glass-card-premium !bg-white/70 dark:!bg-slate-800/70 hover:!bg-white/90 dark:hover:!bg-slate-700/80">
          <FileDown className="w-4 h-4 mr-1.5" /> Export Report
        </Button>
        <Button variant="outline" className="shadow-sm glass-card-premium !bg-white/70 dark:!bg-slate-800/70 hover:!bg-white/90 dark:hover:!bg-slate-700/80" onClick={() => setActiveView('scenarios')}>
          <GitBranch className="w-4 h-4 mr-1.5" /> View Scenarios
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Last updated: {lastUpdated}
        </span>
      </motion.div>

      {/* Market Snapshot */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="grid grid-cols-3 gap-3"
      >
        {marketSnapshot.map((fx) => (
          <div key={fx.pair} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40 shadow-sm micro-shadow">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{fx.pair}</p>
              <p className="text-sm font-bold tabular-nums">{fx.rate}</p>
            </div>
            <MarketSparklineSVG data={fx.sparkline} color={fx.up ? '#10b981' : '#f59e0b'} />
            <span className={`text-[10px] font-medium ${fx.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {fx.change}
            </span>
          </div>
        ))}
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <KPISkeleton />
            </motion.div>
          ))
        ) : (
          kpiCards.map((kpi, index) => {
            const Icon = kpi.icon;
            const delta = cardDeltas[kpi.title];
            return (
              <motion.div
                key={kpi.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <Card className={`relative overflow-hidden glass-card-premium tilt-card shimmer-border shimmer-hover noise-texture kpi-border-hover cursor-default shadow-sm hover:shadow-emerald-500/10 hover:shadow-lg border border-slate-200/60 dark:border-slate-700/40`}>
                  {/* Mini Area Chart Background (Revenue card only) */}
                  {index === 0 && (
                    <div className="absolute inset-0 opacity-[0.07] dark:opacity-[0.1] pointer-events-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueTrend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revenueMiniArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="revenue" fill="url(#revenueMiniArea)" stroke="#10b981" strokeWidth={1} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <CardContent className="p-4 relative z-10">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.title}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold tracking-tight">
                            <AnimatedCounter
                              value={kpi.value}
                              prefix={kpi.prefix}
                              suffix={kpi.suffix}
                              decimals={kpi.decimals}
                              duration={1.5}
                              delay={index * 0.1}
                            />
                          </p>
                          {(kpiSparklines[kpi.title]?.length ?? 0) > 1 && (
                            <MiniSparklineSVG data={kpiSparklines[kpi.title]} color={(delta?.trendUp ?? true) ? '#10b981' : '#f59e0b'} />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{kpi.description}</p>
                          <button
                            onClick={() => setActiveView(kpi.linkView)}
                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Eye className="w-2.5 h-2.5" />
                            View Details
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                          <Icon className="w-4 h-4" />
                        </div>
                        {delta && (
                          <span className={`text-xs font-medium flex items-center gap-0.5 ${delta.trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {delta.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {delta.trend}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${kpi.accentFrom} ${kpi.accentTo}`} />
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* FINANCIAL HEALTH SCORECARD SECTION */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Financial Health Scorecard</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent dark:from-emerald-800 dark:to-transparent" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animated-border rounded-xl p-1">
          {/* Left: 6 Traffic Light Indicators */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {healthIndicators.map((indicator, index) => {
              const colors = getTrafficLightColors(indicator.trafficLight);
              return (
                <motion.div
                  key={indicator.name}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.25 + index * 0.06 }}
                >
                  <Card className="shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300 overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{indicator.name}</p>
                            {getTrafficLightIcon(indicator.trafficLight)}
                          </div>
                          <p className={`text-2xl font-bold ${colors.text}`}>{indicator.displayValue}</p>
                        </div>
                        {/* Traffic Light Circle */}
                        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${colors.bg} ring-2 ${colors.ring} ring-opacity-50`}>
                          <div className={`w-6 h-6 rounded-full ${
                            indicator.trafficLight === 'green' ? 'bg-emerald-500' :
                            indicator.trafficLight === 'amber' ? 'bg-amber-500' : 'bg-red-500'
                          }`} style={{ boxShadow: indicator.trafficLight === 'green' ? '0 0 12px rgba(16,185,129,0.5)' : indicator.trafficLight === 'amber' ? '0 0 12px rgba(245,158,11,0.5)' : '0 0 12px rgba(239,68,68,0.5)' }} />
                        </div>
                      </div>
                      {/* Progress Bar */}
                      <div className="mt-2 mb-1.5">
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${colors.progressBar}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${indicator.progressPct}%` }}
                            transition={{ duration: 1, delay: 0.5 + index * 0.08, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${colors.text}`}>{indicator.label}</span>
                        <span className="text-[10px] text-muted-foreground">{indicator.thresholdNote}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Right: Overall Health Score Donut Gauge */}
          <div className="flex flex-col gap-4">
            <Card className="shadow-sm overflow-hidden flex-1 animate-breathe">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Overall Group Health</p>
                <div className="relative w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gaugeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        stroke="none"
                        animationBegin={300}
                        animationDuration={1200}
                      >
                        <Cell fill={overallColor} />
                        <Cell fill="var(--color-muted)" fillOpacity={0.15} />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center score text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold" style={{ color: overallColor }}>
                      <AnimatedCounter value={overallScore} duration={1.5} delay={0.5} />
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">out of 100</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Strong (≥75)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Moderate (50-74)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> At Risk (&lt;50)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Consolidation Runs mini-table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.55 }}
          className="mt-4"
        >
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Recent Consolidation Runs
                </CardTitle>
                <button onClick={() => setActiveView('consolidation')} className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors duration-150">
                  View All →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <table className="w-full premium-table">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Date</th>
                    <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Status</th>
                    <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Revenue</th>
                    <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-2">Net Income</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConsolidationRuns.map((run, i) => (
                    <tr key={run.id} className={`cursor-pointer transition-colors duration-150 ${i % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''} hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10`}>
                      <td className="text-xs py-2 tabular-nums">{run.date}</td>
                      <td className="py-2">
                        <Badge className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {run.status === 'completed' ? '✓ Completed' : run.status}
                        </Badge>
                      </td>
                      <td className="text-xs py-2 text-right tabular-nums font-medium">{run.revenue}</td>
                      <td className="text-xs py-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{run.netIncome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </motion.div>

        {/* Peer Comparison Horizontal Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="mt-4"
        >
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-600" />
                    Entity Health Comparison
                  </CardTitle>
                  <CardDescription>Each entity&apos;s contribution to the overall group health score</CardDescription>
                </div>
                <span className="text-[10px] text-muted-foreground">{lastUpdated}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peerComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="healthBarGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#0d9488" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} stroke="var(--color-muted-foreground)" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" width={90} />
                    <RechartsTooltip content={<PeerTooltip />} />
                    <ReferenceLine x={75} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Strong', position: 'top', fill: '#10b981', fontSize: 10 }} />
                    <ReferenceLine x={50} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Moderate', position: 'top', fill: '#f59e0b', fontSize: 10 }} />
                    <Bar dataKey="score" radius={[0, 6, 6, 0]} name="Health Score" animationDuration={1000}>
                      {peerComparisonData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.score >= 75 ? '#10b981' : entry.score >= 50 ? '#f59e0b' : '#ef4444'}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Revenue Waterfall Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader className="pb-2 relative overflow-hidden">
            {/* Subtle gradient overlay on header */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-transparent dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-transparent pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
              <div>
                <CardTitle className="text-base">Revenue Waterfall</CardTitle>
                <CardDescription>Income statement walk from Revenue to Net Income (€)</CardDescription>
              </div>
              <span className="text-[10px] text-muted-foreground">{lastUpdated}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactEUR(v, 0)} stroke="var(--color-muted-foreground)" />
                  <RechartsTooltip content={<WaterfallTooltip />} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" name="base" />
                  <Bar dataKey="barValue" stackId="waterfall" radius={[3, 3, 0, 0]} name="Value" label={{ position: 'top', fill: '#64748b', fontSize: 9, formatter: (v: number) => formatCompactEUR(v) }}>
                    {waterfallChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.type === 'positive' ? '#10b981' :
                          entry.type === 'total' ? '#0d9488' :
                          entry.type === 'subtotal' ? '#14b8a6' :
                          '#f59e0b'
                        }
                        fillOpacity={entry.type === 'subtotal' || entry.type === 'total' ? 1 : 0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cash Flow Bridge Mini-Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Cash Flow Bridge</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent dark:from-emerald-800 dark:to-transparent" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cashFlowBridge.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.08 }}
            >
              <Card className="shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    {index < cashFlowBridge.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-emerald-500 animate-flow-arrow hidden sm:block" />
                    )}
                  </div>
                  <p className={`text-lg font-bold ${item.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {item.value >= 0 ? '+' : ''}{formatCompactEUR(item.value)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity Mini-Feed */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="grid grid-cols-1 lg:grid-cols-4 gap-6"
      >
        <div className="lg:col-span-1">
          <Card className="shadow-sm h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold">Recent Activity</h3>
              </div>
              <div className="space-y-3">
                {recentActivity.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.06 }}
                      className="flex items-start gap-2"
                    >
                      <Icon className={`w-3.5 h-3.5 mt-0.5 ${item.color}`} />
                      <div>
                        <p className="text-xs font-medium leading-tight">{item.action}</p>
                        <p className="text-[10px] text-muted-foreground">{item.time}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
      <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Entity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Revenue by Entity</CardTitle>
                  <CardDescription>Annual revenue breakdown (€)</CardDescription>
                </div>
                <span className="text-[10px] text-muted-foreground">{lastUpdated}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityContribution} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      {COLORS.map((color, index) => (
                        <linearGradient key={index} id={`barGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactEUR(v, 0)} stroke="var(--color-muted-foreground)" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Revenue">
                      {entityContribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#barGradient${index % COLORS.length})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* EBITDA Margin Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">EBITDA Margin Trend</CardTitle>
                  <CardDescription>Monthly margin progression (%)</CardDescription>
                </div>
                <span className="text-[10px] text-muted-foreground">{lastUpdated}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ebitdaMarginTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} stroke="var(--color-muted-foreground)" />
                    <RechartsTooltip content={<PercentTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="margin"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                      name="EBITDA Margin"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Revenue & EBITDA Trend</CardTitle>
                  <CardDescription>Monthly progression (€)</CardDescription>
                </div>
                <span className="text-[10px] text-muted-foreground">{lastUpdated}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revenueLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0d9488" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactEUR(v, 0)} stroke="var(--color-muted-foreground)" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2.5} dot={false} name="Revenue" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="ebitda" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="EBITDA" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Entity Contribution Pie */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Entity Revenue Contribution</CardTitle>
                  <CardDescription>Proportional contribution to group revenue</CardDescription>
                </div>
                <span className="text-[10px] text-muted-foreground">{lastUpdated}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={entityContribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: 'var(--color-muted-foreground)', strokeWidth: 1 }}
                    >
                      {entityContribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
