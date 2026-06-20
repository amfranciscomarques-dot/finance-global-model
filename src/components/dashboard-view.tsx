'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, CircleDollarSign, Percent, Loader2, Play, FileDown, GitBranch, ArrowRight, Activity, Shield, CheckCircle2, AlertTriangle, XCircle, Clock, Database, Building2, Zap, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/lib/store';
import { runConsolidation, getEntities } from '@/lib/api';
import { KPIs, Entity } from '@/lib/types';
import { formatEUR } from '@/lib/utils';
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

const COLORS = ['#10b981', '#0d9488', '#f59e0b', '#64748b', '#f97316'];

// Fallback demo data for when API is loading
const fallbackKPIs: KPIs = {
  totalRevenue: 51900,
  totalEBITDA: 17580,
  ebitdaMargin: 33.9,
  netIncome: 8961,
  totalAssets: 48210,
  netDebt: 4152,
  leverage: 0.46,
  roe: 32.6,
  roce: 24.9,
  liquidityRatio: 2.0,
};

const fallbackRevenueTrend = [
  { month: 'Jan', revenue: 38000, ebitda: 12600 },
  { month: 'Feb', revenue: 39500, ebitda: 13200 },
  { month: 'Mar', revenue: 41200, ebitda: 13800 },
  { month: 'Apr', revenue: 40800, ebitda: 13500 },
  { month: 'May', revenue: 42500, ebitda: 14200 },
  { month: 'Jun', revenue: 44000, ebitda: 14800 },
  { month: 'Jul', revenue: 43500, ebitda: 14600 },
  { month: 'Aug', revenue: 42800, ebitda: 14300 },
  { month: 'Sep', revenue: 45000, ebitda: 15200 },
  { month: 'Oct', revenue: 47200, ebitda: 16000 },
  { month: 'Nov', revenue: 49500, ebitda: 16800 },
  { month: 'Dec', revenue: 51900, ebitda: 17580 },
];

const fallbackEntityContribution = [
  { name: 'Portugal', value: 15000, code: 'PT0001' },
  { name: 'España', value: 12000, code: 'ES0002' },
  { name: 'Deutschland', value: 10500, code: 'DE0003' },
  { name: 'UK', value: 8400, code: 'UK0004' },
  { name: 'France', value: 6000, code: 'FR0005' },
];

// Waterfall data: Revenue → COGS → Gross Profit → OPEX → EBITDA → D&A → EBIT → Interest → EBT → Tax → Net Income
const waterfallData = [
  { name: 'Revenue', value: 51900, type: 'positive' },
  { name: 'COGS', value: -18690, type: 'negative' },
  { name: 'Gross Profit', value: 33210, type: 'subtotal' },
  { name: 'OPEX', value: -15630, type: 'negative' },
  { name: 'EBITDA', value: 17580, type: 'subtotal' },
  { name: 'D&A', value: -4080, type: 'negative' },
  { name: 'EBIT', value: 13500, type: 'subtotal' },
  { name: 'Interest', value: -1530, type: 'negative' },
  { name: 'EBT', value: 11970, type: 'subtotal' },
  { name: 'Tax', value: -3009, type: 'negative' },
  { name: 'Net Income', value: 8961, type: 'total' },
];

// Build stacked waterfall chart data with invisible base
function buildWaterfallChartData() {
  let running = 0;
  return waterfallData.map((item) => {
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

const waterfallChartData = buildWaterfallChartData();

// Cash flow bridge data
const cashFlowBridge = [
  { label: 'Operating CF', value: 12003, color: '#10b981' },
  { label: 'Investing CF', value: -6228, color: '#f59e0b' },
  { label: 'Financing CF', value: -5063, color: '#64748b' },
  { label: 'Net Change', value: 712, color: '#0d9488' },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value);
}

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
            <span className="font-semibold">{typeof entry.value === 'number' ? `€${formatNumber(entry.value)}K` : entry.value}</span>
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
        {data.rawValue >= 0 ? '+' : ''}€{formatNumber(Math.abs(data.rawValue))}K
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

// ============================================================
// FINANCIAL HEALTH SCORECARD TYPES & DATA
// ============================================================

type TrafficLight = 'green' | 'amber' | 'red';
type HealthLabel = 'Strong' | 'Moderate' | 'At Risk';

interface HealthIndicator {
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

function computeHealthIndicators(kpis: KPIs): HealthIndicator[] {
  // Revenue Growth: Green >5%, Amber 0-5%, Red <0%
  const revenueGrowth = 5.2; // from demo data trend
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

  // Interest Coverage: Green >5x, Amber 2-5x, Red <2x (EBIT/Interest)
  const ebit = 13500; // from demo data
  const interestExpense = 1530;
  const interestCoverage = ebit / interestExpense;
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

function computeOverallScore(indicators: HealthIndicator[]): number {
  return Math.round(indicators.reduce((sum, ind) => sum + ind.score * ind.weight, 0));
}

function getTrafficLightColors(tl: TrafficLight): { bg: string; fill: string; ring: string; text: string; progressBar: string } {
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

function getTrafficLightIcon(tl: TrafficLight) {
  switch (tl) {
    case 'green': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    case 'amber': return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
    case 'red': return <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
  }
}

// Peer comparison data (entity health scores)
const peerComparisonData = [
  { entity: 'PT0001', name: 'Portugal', score: 82 },
  { entity: 'ES0002', name: 'España', score: 78 },
  { entity: 'DE0003', name: 'Deutschland', score: 75 },
  { entity: 'UK0004', name: 'UK', score: 80 },
  { entity: 'FR0005', name: 'France', score: 62 },
];

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
  const [kpis, setKPIs] = useState<KPIs>(fallbackKPIs);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityContribution, setEntityContribution] = useState(fallbackEntityContribution);
  const [revenueTrend] = useState(fallbackRevenueTrend);
  const [lastUpdated] = useState('Dec 31, 2024 · 14:30');

  const ebitdaMarginTrend = revenueTrend.map(r => ({
    month: r.month,
    margin: r.revenue > 0 ? (r.ebitda / r.revenue * 100) : 0
  }));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const entitiesData = await getEntities();
      setEntities(entitiesData);

      const entityCodes = entitiesData.map((e: Entity) => e.code);
      if (entityCodes.length > 0) {
        try {
          const result = await runConsolidation({
            period: selectedPeriod,
            entityCodes,
            scenarioType: selectedScenario,
          });
          if (result?.kpis) {
            setKPIs(result.kpis);
          }
        } catch (err) {
          console.log('Using fallback KPI data:', err);
        }
      }
    } catch (err) {
      console.log('Using fallback data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, selectedScenario]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute health indicators
  const healthIndicators = useMemo(() => computeHealthIndicators(kpis), [kpis]);
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
      displayValue: formatEUR(kpis.totalRevenue),
      trend: '+5.2%',
      trendUp: true,
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
      trend: '+0.4pp',
      trendUp: true,
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
      displayValue: formatEUR(kpis.netIncome),
      trend: '+8.1%',
      trendUp: true,
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
      displayValue: formatEUR(kpis.totalAssets),
      trend: '+2.3%',
      trendUp: true,
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
      trend: '-0.1x',
      trendUp: true,
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
      trend: '+1.2pp',
      trendUp: true,
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

  // Quick Stats row data
  const quickStats = [
    { label: 'Entities Active', value: '5', icon: Building2, color: 'text-emerald-600 dark:text-emerald-400', detail: '5 subsidiaries across 5 countries (PT, ES, DE, UK, FR)' },
    { label: 'COA Accounts', value: '76', icon: BarChart3, color: 'text-teal-600 dark:text-teal-400', detail: '76 group chart of accounts with entity mappings' },
    { label: 'FX Pairs', value: '14', icon: DollarSign, color: 'text-amber-600 dark:text-amber-400', detail: '14 active exchange rate pairs (ECB + manual)' },
    { label: 'Validation Rules', value: '10', icon: Shield, color: 'text-emerald-600 dark:text-emerald-400', detail: '10 active data validation rules across all entities' },
  ];

  // Recent Activity Feed
  const recentActivity = [
    { action: 'Consolidation completed', time: '2 min ago', icon: CheckCircle2, color: 'text-emerald-500' },
    { action: 'FX rates updated (ECB)', time: '15 min ago', icon: DollarSign, color: 'text-teal-500' },
    { action: 'Data import — PT0001', time: '1 hour ago', icon: Database, color: 'text-amber-500' },
    { action: 'IC elimination run', time: '3 hours ago', icon: Zap, color: 'text-emerald-500' },
    { action: 'Budget entry saved', time: '5 hours ago', icon: Clock, color: 'text-slate-500' },
  ];

  // Inline sparkline SVG for KPI cards
  const kpiSparklines = [
    [38, 40, 41, 42, 44, 52], // Revenue
    [32, 33, 33.5, 34, 34.5, 33.9], // EBITDA Margin
    [7.5, 7.8, 8.1, 8.3, 8.5, 8.96], // Net Income
    [45, 46, 46.5, 47, 47.5, 48.2], // Total Assets
    [0.52, 0.50, 0.48, 0.47, 0.46, 0.46], // Leverage
    [22, 23, 23.5, 24, 24.5, 24.9], // ROCE
  ];

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

  // Market Snapshot data
  const marketSnapshot = [
    { pair: 'EUR/USD', rate: '1.0847', change: '+0.12%', up: true, sparkline: [1.081, 1.082, 1.083, 1.0825, 1.084, 1.0847] },
    { pair: 'EUR/GBP', rate: '0.8564', change: '-0.05%', up: false, sparkline: [0.858, 0.857, 0.8568, 0.8572, 0.8565, 0.8564] },
    { pair: 'EUR/JPY', rate: '162.34', change: '+0.28%', up: true, sparkline: [161.2, 161.5, 161.8, 162.0, 162.1, 162.34] },
  ];

  // Recent Consolidation Runs
  const recentConsolidationRuns = [
    { date: 'Dec 31, 2024', status: 'completed' as const, revenue: '€51.9M', netIncome: '€9.0M' },
    { date: 'Nov 30, 2024', status: 'completed' as const, revenue: '€49.5M', netIncome: '€8.5M' },
    { date: 'Oct 31, 2024', status: 'completed' as const, revenue: '€47.2M', netIncome: '€7.8M' },
  ];

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
                          <MiniSparklineSVG data={kpiSparklines[index]} color={kpi.trendUp ? '#10b981' : '#f59e0b'} />
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
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${kpi.trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {kpi.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {kpi.trend}
                        </span>
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
                    <tr key={run.date} className={`cursor-pointer transition-colors duration-150 ${i % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''} hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10`}>
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
                <CardDescription>Income statement walk from Revenue to Net Income (€K)</CardDescription>
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
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`} stroke="var(--color-muted-foreground)" />
                  <RechartsTooltip content={<WaterfallTooltip />} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" name="base" />
                  <Bar dataKey="barValue" stackId="waterfall" radius={[3, 3, 0, 0]} name="Value" label={{ position: 'top', fill: '#64748b', fontSize: 9, formatter: (v: number) => `${(v / 1000).toFixed(1)}K` }}>
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
                    {item.value >= 0 ? '+' : ''}€{(Math.abs(item.value) / 1000).toFixed(1)}M
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
                  <CardDescription>Annual revenue breakdown (€K)</CardDescription>
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
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`} stroke="var(--color-muted-foreground)" />
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
                    <YAxis domain={[31, 36]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} stroke="var(--color-muted-foreground)" />
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
                  <CardDescription>Monthly progression (€K)</CardDescription>
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
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`} stroke="var(--color-muted-foreground)" />
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
