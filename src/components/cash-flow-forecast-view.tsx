'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  RefreshCw,
  Clock,
  AlertTriangle,
  Target,
  BarChart3,
  Settings,
} from 'lucide-react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { motion, type Variants } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { getForecast, saveForecastAssumptions } from '@/lib/api';
import { formatEUR } from '@/lib/utils';
import { formatMonth } from '@/components/cash-flow-forecast/helpers';
import { DataLoadError } from '@/components/data-load-error';
import { CashFlowForecast, ForecastPeriod } from '@/lib/types';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';

// ============================================================
// DEMO FALLBACK DATA
// ============================================================
function getDemoForecast(): CashFlowForecast {
  const actualMonths = [
    '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
    '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
  ];
  const forecastMonths = [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
  ];

  const actualOperatingCF = [420, 380, 510, 460, 490, 530, 470, 440, 520, 480, 510, 560];
  const actualInvestingCF = [-120, -80, -150, -90, -110, -200, -130, -100, -160, -140, -180, -250];
  const actualFinancingCF = [-200, -180, -220, -190, -200, -210, -195, -185, -210, -200, -220, -240];

  const forecastOperatingCF = [575, 590, 610, 625, 640, 660];
  const forecastInvestingCF = [-250, -210, -280, -230, -260, -290];
  const forecastFinancingCF = [-200, -200, -200, -200, -200, -200];

  const allMonths = [...actualMonths, ...forecastMonths];
  const periods: ForecastPeriod[] = allMonths.map((month, idx) => {
    const isForecast = idx >= actualMonths.length;
    const fi = idx - actualMonths.length;
    const opCF = isForecast ? forecastOperatingCF[fi] : actualOperatingCF[idx];
    const invCF = isForecast ? forecastInvestingCF[fi] : actualInvestingCF[idx];
    const finCF = isForecast ? forecastFinancingCF[fi] : actualFinancingCF[idx];
    const netChange = opCF + invCF + finCF;
    return {
      month,
      isForecast,
      operatingCF: opCF,
      investingCF: invCF,
      financingCF: finCF,
      netChange,
      cumulativeCash: 0,
      operatingCFHigh: isForecast ? Math.round(opCF * 1.05 * (1 + fi * 0.02)) : opCF,
      operatingCFLow: isForecast ? Math.round(opCF * 0.95 * (1 - fi * 0.02)) : opCF,
      investingCFHigh: isForecast ? Math.round(invCF * 1.08 * (1 + fi * 0.02)) : invCF,
      investingCFLow: isForecast ? Math.round(invCF * 0.92 * (1 - fi * 0.02)) : invCF,
      financingCFHigh: isForecast ? Math.round(finCF * 1.03) : finCF,
      financingCFLow: isForecast ? Math.round(finCF * 0.97) : finCF,
      netChangeHigh: 0,
      netChangeLow: 0,
      cumulativeCashHigh: 0,
      cumulativeCashLow: 0,
    };
  });

  // Compute cumulative
  let cumulative = 2400;
  for (const p of periods) {
    cumulative += p.netChange;
    p.cumulativeCash = cumulative;
  }

  // Confidence intervals for cumulative
  let cumHigh = 2400, cumLow = 2400;
  for (const p of periods) {
    p.netChangeHigh = p.operatingCFHigh + p.investingCFHigh + p.financingCFHigh;
    p.netChangeLow = p.operatingCFLow + p.investingCFLow + p.financingCFLow;
    cumHigh += p.netChangeHigh;
    cumLow += p.netChangeLow;
    p.cumulativeCashHigh = cumHigh;
    p.cumulativeCashLow = cumLow;
  }

  const actualPeriods = periods.filter((p) => !p.isForecast);
  const forecastPeriods = periods.filter((p) => p.isForecast);
  const currentCash = actualPeriods[actualPeriods.length - 1].cumulativeCash;
  const lastCash = periods[periods.length - 1].cumulativeCash;
  const totalOpCF = forecastPeriods.reduce((s, p) => s + p.operatingCF, 0);
  const totalInvCF = forecastPeriods.reduce((s, p) => s + p.investingCF, 0);
  const fcf = totalOpCF + totalInvCF;

  let minCash = Infinity, minCashMonth = '';
  for (const p of forecastPeriods) {
    if (p.cumulativeCash < minCash) { minCash = p.cumulativeCash; minCashMonth = p.month; }
  }

  let runway = 0, testCash = currentCash;
  for (const p of forecastPeriods) {
    testCash += p.netChangeLow;
    if (testCash < 0) break;
    runway++;
  }

  let breakevenMonth = '';
  for (const p of forecastPeriods) {
    if (p.netChange > 0) { breakevenMonth = p.month; break; }
  }

  const baseTotal = forecastPeriods.reduce((s, p) => s + p.netChange, 0);

  return {
    periods,
    assumptions: { revenueGrowthRate: 5.0, capexGrowthRate: 3.0, workingCapitalDays: 45, debtRepaymentSchedule: 200 },
    keyMetrics: { currentCashPosition: currentCash, projected6MCash: lastCash, operatingCFForecast: totalOpCF, freeCashFlowForecast: fcf, cashRunwayMonths: runway, breakevenMonth, minCashPosition: minCash, minCashMonth },
    scenarioComparison: {
      optimistic: { totalNetChange: Math.round(baseTotal * 1.25), label: 'Optimistic (+25%)' },
      base: { totalNetChange: baseTotal, label: 'Base Case' },
      pessimistic: { totalNetChange: Math.round(baseTotal * 0.75), label: 'Pessimistic (-25%)' },
    },
  };
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function formatK(value: number): string {
  return formatEUR(value);
}

// formatMonth lives in ./cash-flow-forecast/helpers (golden-tested).

// ============================================================
// ANIMATION VARIANTS
// ============================================================
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// ============================================================
// CUSTOM TOOLTIP
// ============================================================
function ForecastTooltip({ active, payload, label, t, dl }: {
  active?: boolean;
  payload?: Array<{ payload: ForecastPeriod }>;
  label?: string;
  t: (k: string) => string;
  dl: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as ForecastPeriod | undefined;
  if (!data) return null;

  return (
    <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-lg shadow-xl p-3 text-xs border border-slate-700">
      <p className="font-semibold mb-1.5 text-emerald-400">{formatMonth(label ?? '', dl)}</p>
      {data.isForecast && <Badge className="text-[8px] bg-amber-500/20 text-amber-400 mb-1.5 h-4">{t('tooltip.forecast')}</Badge>}
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">{t('tooltip.cumulativeCash')}</span>
          <span className="font-semibold">{formatK(data.cumulativeCash)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">{t('tooltip.operatingCF')}</span>
          <span className={data.operatingCF >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatK(data.operatingCF)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">{t('tooltip.investingCF')}</span>
          <span className={data.investingCF >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatK(data.investingCF)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">{t('tooltip.financingCF')}</span>
          <span className={data.financingCF >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatK(data.financingCF)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-700 pt-1">
          <span className="text-slate-300 font-medium">{t('tooltip.netChange')}</span>
          <span className={data.netChange >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{formatK(data.netChange)}</span>
        </div>
        {data.isForecast && (
          <div className="flex justify-between gap-4 text-[9px] text-slate-500 pt-0.5">
            <span>{t('tooltip.range')}</span>
            <span>{formatK(data.cumulativeCashLow)} – {formatK(data.cumulativeCashHigh)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportCSV(periods: ForecastPeriod[], t: (k: string) => string) {
  const headers = [
    t('csv.month'), t('csv.type'), t('csv.operatingCF'), t('csv.investingCF'),
    t('csv.financingCF'), t('csv.netChange'), t('csv.cumulativeCash'),
  ];
  const rows = periods.map((p) => [
    p.month, p.isForecast ? t('csv.forecastType') : t('csv.actualType'),
    p.operatingCF, p.investingCF, p.financingCF, p.netChange, p.cumulativeCash,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cash_flow_forecast.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function CashFlowForecastView() {
  const t = useTranslations('forecast');
  const loc = useLocale() as Locale;
  const dl = dateLocale(loc);
  const { selectedPeriod, selectedScenario } = useAppStore();
  const [data, setData] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  // Assumptions form state
  const [revenueGrowth, setRevenueGrowth] = useState(5.0);
  const [capexGrowth, setCapexGrowth] = useState(3.0);
  const [workingCapitalDays, setWorkingCapitalDays] = useState(45);
  const [debtRepayment, setDebtRepayment] = useState(200);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await getForecast({ period: selectedPeriod, scenario: selectedScenario });
      setData(result);
      setRevenueGrowth(result.assumptions.revenueGrowthRate);
      setCapexGrowth(result.assumptions.capexGrowthRate);
      setWorkingCapitalDays(result.assumptions.workingCapitalDays);
      setDebtRepayment(result.assumptions.debtRepaymentSchedule);
    } catch (err) {
      console.error('Failed to load cash-flow forecast', err);
      const demo = getDemoForecast();
      setData(demo);
      setRevenueGrowth(demo.assumptions.revenueGrowthRate);
      setCapexGrowth(demo.assumptions.capexGrowthRate);
      setWorkingCapitalDays(demo.assumptions.workingCapitalDays);
      setDebtRepayment(demo.assumptions.debtRepaymentSchedule);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, selectedScenario]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await saveForecastAssumptions({
        revenueGrowthRate: revenueGrowth,
        capexGrowthRate: capexGrowth,
        workingCapitalDays,
        debtRepaymentSchedule: debtRepayment,
      });
      if (result.data) {
        setData(result.data);
      }
    } catch {
      // Silently fail
    } finally {
      setRecalculating(false);
    }
  };

  // ============================================================
  // LOADING STATE
  // ============================================================
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl col-span-2" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ============================================================
  // CHART DATA
  // ============================================================
  const chartData = data.periods.map((p) => ({
    month: p.month,
    monthLabel: formatMonth(p.month, dl),
    isForecast: p.isForecast,
    cumulativeCash: p.cumulativeCash / 1000,
    cumulativeCashHigh: p.cumulativeCashHigh / 1000,
    cumulativeCashLow: p.cumulativeCashLow / 1000,
    netChange: p.netChange / 1000,
  }));

  // Find the forecast start index for the reference line
  const forecastStartMonth = data.periods.find((p) => p.isForecast)?.month || '';

  // Scenario comparison data — keys map to t('scenario.{key}')
  const scenarioData = [
    { key: 'optimistic', value: data.scenarioComparison.optimistic.totalNetChange / 1000, color: '#10b981' },
    { key: 'base', value: data.scenarioComparison.base.totalNetChange / 1000, color: '#14b8a6' },
    { key: 'pessimistic', value: data.scenarioComparison.pessimistic.totalNetChange / 1000, color: '#f59e0b' },
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* ============================================================ */}
      {/* SUMMARY CARDS */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Cash Position */}
        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-950" />
          <CardContent className="relative p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('cards.currentCashPosition')}</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatK(data.keyMetrics.currentCashPosition)}</p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> {t('cards.asOf', { month: formatMonth(selectedPeriod, dl) })}
            </p>
          </CardContent>
        </Card>

        {/* 6M Projected Cash */}
        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/20 dark:to-slate-950" />
          <CardContent className="relative p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('cards.projected6m')}</span>
              <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatK(data.keyMetrics.projected6MCash)}</p>
            <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1 flex items-center gap-1">
              {data.keyMetrics.projected6MCash >= data.keyMetrics.currentCashPosition ? (
                <><ArrowUpRight className="w-3 h-3" /> +{formatK(data.keyMetrics.projected6MCash - data.keyMetrics.currentCashPosition)} {t('cards.growth')}</>
              ) : (
                <><ArrowDownRight className="w-3 h-3" /> {formatK(data.keyMetrics.projected6MCash - data.keyMetrics.currentCashPosition)} {t('cards.decline')}</>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Operating CF Forecast */}
        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-950" />
          <CardContent className="relative p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('cards.operatingCFForecast')}</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatK(data.keyMetrics.operatingCFForecast)}</p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {t('cards.monthTotal')}
            </p>
          </CardContent>
        </Card>

        {/* Free Cash Flow Forecast */}
        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-slate-950" />
          <CardContent className="relative p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('cards.freeCashFlow')}</span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Target className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatK(data.keyMetrics.freeCashFlowForecast)}</p>
            <p className="text-[10px] mt-1 flex items-center gap-1">
              {data.keyMetrics.freeCashFlowForecast >= 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400"><ArrowUpRight className="w-3 h-3 inline" /> {t('cards.positiveFCF')}</span>
              ) : (
                <span className="text-red-600 dark:text-red-400"><ArrowDownRight className="w-3 h-3 inline" /> {t('cards.negativeFCF')}</span>
              )}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ============================================================ */}
      {/* MAIN FORECAST CHART */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                {t('mainChart.title')}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400">
                  <Clock className="w-3 h-3 mr-1" /> {t('mainChart.updatedJustNow')}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v: string) => formatMonth(v, dl)}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `€${v.toFixed(1)}M`}
                  />
                  <Tooltip content={<ForecastTooltip t={t} dl={dl} />} />

                  {/* Confidence band for forecast */}
                  <Area
                    dataKey="cumulativeCashHigh"
                    stroke="none"
                    fill="url(#confidenceGradient)"
                    connectNulls={false}
                  />
                  <Area
                    dataKey="cumulativeCashLow"
                    stroke="none"
                    fill="url(#confidenceGradient)"
                    connectNulls={false}
                  />

                  {/* Actual cumulative cash - solid area + line */}
                  <Area
                    dataKey="cumulativeCash"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#actualGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                    connectNulls={false}
                  />

                  {/* Forecast separator line */}
                  {forecastStartMonth && (
                    <ReferenceLine
                      x={forecastStartMonth}
                      stroke="#f59e0b"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{
                        value: t('mainChart.forecastArrow'),
                        position: 'top',
                        fill: '#f59e0b',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  )}

                  {/* Net Change bars */}
                  <Bar
                    dataKey="netChange"
                    fill="#14b8a6"
                    radius={[2, 2, 0, 0]}
                    barSize={8}
                    opacity={0.4}
                  />

                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => {
                      if (value === 'cumulativeCash') return t('legend.cumulativeCash');
                      if (value === 'cumulativeCashHigh') return t('legend.confidenceHigh');
                      if (value === 'cumulativeCashLow') return t('legend.confidenceLow');
                      if (value === 'netChange') return t('legend.netChange');
                      return value;
                    }}
                    wrapperStyle={{ fontSize: 10 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ============================================================ */}
      {/* KEY METRICS + ASSUMPTIONS PANEL */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Key Metrics */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500" />
              {t('keyMetrics')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/10">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-muted-foreground">{t('metrics.cashRunway')}</span>
              </div>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{t('metrics.runwayMonths', { n: data.keyMetrics.cashRunwayMonths })}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-teal-50/50 dark:bg-teal-950/10">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs text-muted-foreground">{t('metrics.breakevenMonth')}</span>
              </div>
              <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
                {data.keyMetrics.breakevenMonth ? formatMonth(data.keyMetrics.breakevenMonth, dl) : t('metrics.na')}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs text-muted-foreground">{t('metrics.minCashPosition')}</span>
              </div>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                {formatK(data.keyMetrics.minCashPosition)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-xs text-muted-foreground">{t('metrics.minCashMonth')}</span>
              </div>
              <span className="text-sm font-bold text-foreground">
                {data.keyMetrics.minCashMonth ? formatMonth(data.keyMetrics.minCashMonth, dl) : t('metrics.na')}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Forecast Assumptions Panel */}
        <Card className="border-0 shadow-md lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-500" />
                {t('assumptions.title')}
              </CardTitle>
              <Button
                size="sm"
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleRecalculate}
                disabled={recalculating}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${recalculating ? 'animate-spin' : ''}`} />
                {recalculating ? t('assumptions.recalculating') : t('assumptions.recalculate')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">{t('assumptions.revenueGrowth')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    value={revenueGrowth}
                    onChange={(e) => setRevenueGrowth(parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t('assumptions.annual')}</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="30"
                  step="0.5"
                  value={revenueGrowth}
                  onChange={(e) => setRevenueGrowth(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{t('assumptions.capexGrowth')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    value={capexGrowth}
                    onChange={(e) => setCapexGrowth(parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t('assumptions.annual')}</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="30"
                  step="0.5"
                  value={capexGrowth}
                  onChange={(e) => setCapexGrowth(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-teal-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{t('assumptions.workingCapitalDays')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={workingCapitalDays}
                    onChange={(e) => setWorkingCapitalDays(parseInt(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t('assumptions.days')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{t('assumptions.debtRepayment')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="10"
                    value={debtRepayment}
                    onChange={(e) => setDebtRepayment(parseInt(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t('assumptions.perMonth')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-teal-300 dark:via-teal-700 to-transparent" />

      {/* ============================================================ */}
      {/* SCENARIO COMPARISON + MONTHLY BREAKDOWN TABLE */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Scenario Comparison */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-teal-500" />
              {t('scenario.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scenarioData.map((s) => (
                <div key={s.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{t(`scenario.${s.key}`)}</span>
                    <span className="text-sm font-bold" style={{ color: s.color }}>
                      {formatK(s.value * 1000)}
                    </span>
                  </div>
                  <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(5, Math.abs(s.value) / Math.max(...scenarioData.map((x) => Math.abs(x.value))) * 100)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute inset-y-0 left-0 rounded-md"
                      style={{ backgroundColor: s.color, opacity: 0.7 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="text-[10px] text-muted-foreground space-y-1">
              <p>{t('scenario.optimisticDesc')}</p>
              <p>{t('scenario.baseDesc')}</p>
              <p>{t('scenario.pessimisticDesc')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Breakdown Table */}
        <Card className="border-0 shadow-md lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-500" />
                {t('monthlyBreakdown.title')}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400"
                onClick={() => exportCSV(data.periods, t)}
              >
                <Download className="w-3 h-3 mr-1" /> {t('monthlyBreakdown.csv')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto custom-scrollbar rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-emerald-200 dark:border-emerald-800/50">
                  <tr>
                    <th className="text-left p-2.5 font-semibold text-muted-foreground">{t('monthlyBreakdown.headers.month')}</th>
                    <th className="text-right p-2.5 font-semibold text-muted-foreground">{t('monthlyBreakdown.headers.operatingCF')}</th>
                    <th className="text-right p-2.5 font-semibold text-muted-foreground">{t('monthlyBreakdown.headers.investingCF')}</th>
                    <th className="text-right p-2.5 font-semibold text-muted-foreground">{t('monthlyBreakdown.headers.financingCF')}</th>
                    <th className="text-right p-2.5 font-semibold text-muted-foreground">{t('monthlyBreakdown.headers.netChange')}</th>
                    <th className="text-right p-2.5 font-semibold text-muted-foreground">{t('monthlyBreakdown.headers.cumulative')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p, idx) => (
                    <tr
                      key={p.month}
                      className={`
                        ${p.isForecast ? 'bg-amber-50/30 dark:bg-amber-950/10 italic' : ''}
                        ${idx % 2 === 1 && !p.isForecast ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}
                        border-b border-slate-100 dark:border-slate-800/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors
                      `}
                    >
                      <td className="p-2.5 font-medium">
                        <div className="flex items-center gap-1.5">
                          {formatMonth(p.month, dl)}
                          {p.isForecast && (
                            <Badge className="text-[7px] h-3.5 px-1 bg-amber-500/20 text-amber-700 dark:text-amber-400">
                              {t('monthlyBreakdown.fc')}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className={`p-2.5 text-right font-mono ${p.operatingCF >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatK(p.operatingCF)}
                      </td>
                      <td className={`p-2.5 text-right font-mono ${p.investingCF >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatK(p.investingCF)}
                      </td>
                      <td className={`p-2.5 text-right font-mono ${p.financingCF >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatK(p.financingCF)}
                      </td>
                      <td className={`p-2.5 text-right font-mono font-semibold ${p.netChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatK(p.netChange)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-semibold text-foreground">
                        {formatK(p.cumulativeCash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />
    </motion.div>
  );
}
