'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Download, Loader2,
  DollarSign, BarChart3, PiggyBank, Building2, Percent, Activity, ChevronRight,
  Calendar, Target, LineChart as LineChartIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, ReferenceLine, Cell, Legend,
} from 'recharts';
import { getTrendAnalysis } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { TrendData, TrendPeriod } from '@/lib/types';
import { formatCompactEUR } from '@/lib/format';
import { DataLoadError } from '@/components/data-load-error';
import { motion } from 'framer-motion';

// ============================================================
// DEMO DATA — 12 months, 5 entities
// ============================================================

const DEMO_ENTITIES = [
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', color: '#10b981' },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', color: '#14b8a6' },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', color: '#f59e0b' },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', color: '#06b6d4' },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', color: '#8b5cf6' },
];

const MONTHS = ['2024-01','2024-02','2024-03','2024-04','2024-05','2024-06','2024-07','2024-08','2024-09','2024-10','2024-11','2024-12'];

function generateDemoData(metric: string): TrendData {
  const baseValues: Record<string, Record<string, number[]>> = {
    revenue: {
      PT0001: [3800, 3900, 4100, 4050, 4200, 4300, 4350, 4400, 4500, 4550, 4600, 4700],
      ES0002: [3100, 3150, 3300, 3250, 3400, 3450, 3500, 3550, 3600, 3650, 3700, 3800],
      DE0003: [2700, 2750, 2850, 2800, 2900, 3000, 2950, 3050, 3100, 3150, 3200, 3300],
      FR0004: [2000, 2050, 2150, 2100, 2200, 2250, 2300, 2350, 2400, 2450, 2500, 2600],
      UK0005: [1200, 1220, 1280, 1250, 1300, 1320, 1340, 1360, 1400, 1420, 1450, 1500],
    },
    ebitda: {
      PT0001: [1280, 1320, 1390, 1370, 1430, 1470, 1480, 1500, 1540, 1550, 1570, 1600],
      ES0002: [1050, 1070, 1120, 1100, 1160, 1170, 1190, 1210, 1230, 1240, 1260, 1290],
      DE0003: [910, 930, 970, 950, 990, 1020, 1000, 1040, 1050, 1070, 1090, 1120],
      FR0004: [680, 700, 730, 710, 750, 770, 780, 800, 820, 830, 850, 880],
      UK0005: [410, 420, 440, 430, 450, 460, 465, 475, 480, 490, 500, 510],
    },
    netIncome: {
      PT0001: [760, 790, 830, 820, 860, 880, 890, 900, 920, 930, 940, 960],
      ES0002: [620, 630, 670, 650, 690, 700, 710, 720, 730, 740, 750, 770],
      DE0003: [540, 550, 580, 570, 590, 610, 600, 620, 630, 640, 650, 670],
      FR0004: [400, 410, 430, 420, 440, 450, 460, 470, 480, 490, 500, 520],
      UK0005: [240, 250, 260, 255, 270, 275, 280, 285, 290, 295, 300, 310],
    },
    assets: {
      PT0001: [28000, 28200, 28500, 28600, 28800, 29000, 29100, 29300, 29500, 29600, 29800, 30000],
      ES0002: [22000, 22100, 22300, 22400, 22600, 22800, 22900, 23100, 23300, 23400, 23600, 23800],
      DE0003: [19000, 19100, 19300, 19400, 19600, 19800, 19900, 20100, 20300, 20400, 20600, 20800],
      FR0004: [14000, 14100, 14200, 14300, 14400, 14500, 14600, 14700, 14800, 14900, 15000, 15200],
      UK0005: [8500, 8550, 8600, 8650, 8700, 8750, 8800, 8850, 8900, 8950, 9000, 9100],
    },
    leverage: {
      PT0001: [0.42, 0.41, 0.40, 0.40, 0.39, 0.38, 0.38, 0.37, 0.37, 0.36, 0.36, 0.35],
      ES0002: [0.48, 0.47, 0.46, 0.46, 0.45, 0.44, 0.44, 0.43, 0.43, 0.42, 0.42, 0.41],
      DE0003: [0.52, 0.51, 0.50, 0.50, 0.49, 0.48, 0.48, 0.47, 0.47, 0.46, 0.46, 0.45],
      FR0004: [0.55, 0.54, 0.53, 0.53, 0.52, 0.51, 0.51, 0.50, 0.50, 0.49, 0.49, 0.48],
      UK0005: [0.38, 0.37, 0.36, 0.36, 0.35, 0.35, 0.34, 0.34, 0.33, 0.33, 0.32, 0.32],
    },
    ebitdaMargin: {
      PT0001: [33.7, 33.8, 33.9, 33.8, 34.0, 34.2, 34.0, 34.1, 34.2, 34.1, 34.1, 34.0],
      ES0002: [33.9, 34.0, 33.9, 33.8, 34.1, 33.9, 34.0, 34.1, 34.2, 34.0, 34.1, 33.9],
      DE0003: [33.7, 33.8, 34.0, 33.9, 34.1, 34.0, 33.9, 34.1, 33.9, 34.0, 34.1, 33.9],
      FR0004: [34.0, 34.1, 34.0, 33.8, 34.1, 34.2, 33.9, 34.0, 34.2, 33.9, 34.0, 33.8],
      UK0005: [34.2, 34.4, 34.4, 34.4, 34.6, 34.8, 34.7, 34.9, 34.3, 34.5, 34.5, 34.0],
    },
  };

  const values = baseValues[metric] || baseValues.revenue;

  const periods: TrendPeriod[] = MONTHS.map((month, idx) => ({
    period: month,
    value: DEMO_ENTITIES.reduce((sum, e) => sum + (values[e.entityCode]?.[idx] || 0), 0),
    entityBreakdown: DEMO_ENTITIES.map((e) => ({
      entityCode: e.entityCode,
      entityName: e.entityName,
      value: (values[e.entityCode]?.[idx] || 0) * (metric === 'revenue' || metric === 'ebitda' || metric === 'netIncome' ? 1000 : metric === 'assets' ? 1000 : 1),
    })),
  }));

  // QoQ
  const qoqChanges = periods.slice(1).map((p, i) => {
    const prev = periods[i].value;
    return {
      fromPeriod: periods[i].period,
      toPeriod: p.period,
      change: p.value - prev,
      changePct: prev !== 0 ? ((p.value - prev) / Math.abs(prev)) * 100 : 0,
    };
  });

  // YoY (offset 3 for demo purposes since we only have 12 months)
  const yoyOffset = 3;
  const yoyChanges = periods.slice(yoyOffset).map((p, i) => {
    const prev = periods[i].value;
    return {
      fromPeriod: periods[i].period,
      toPeriod: p.period,
      change: p.value - prev,
      changePct: prev !== 0 ? ((p.value - prev) / Math.abs(prev)) * 100 : 0,
    };
  });

  // Entity trends
  const entityTrends = DEMO_ENTITIES.map((e) => {
    const entityPeriods = periods.slice(-6);
    const sparkline = entityPeriods.map((p) => {
      const eb = p.entityBreakdown.find((b) => b.entityCode === e.entityCode);
      return eb?.value || 0;
    });
    const last = periods[periods.length - 1];
    const prev = periods[periods.length - 2];
    const currentVal = last.entityBreakdown.find((b) => b.entityCode === e.entityCode)?.value || 0;
    const prevVal = prev.entityBreakdown.find((b) => b.entityCode === e.entityCode)?.value || 0;
    return {
      entityCode: e.entityCode,
      entityName: e.entityName,
      currentPeriod: last.period,
      currentValue: currentVal,
      previousValue: prevVal,
      change: currentVal - prevVal,
      changePct: prevVal !== 0 ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100 : 0,
      sparklineData: sparkline,
    };
  });

  return { metric, periods, qoqChanges, yoyChanges, entityTrends };
}

// ============================================================
// METRICS CONFIG
// ============================================================
const METRICS = [
  { key: 'revenue', label: 'Revenue', icon: DollarSign, budgetTarget: 55000000 },
  { key: 'ebitda', label: 'EBITDA', icon: BarChart3, budgetTarget: 19000000 },
  { key: 'netIncome', label: 'Net Income', icon: PiggyBank, budgetTarget: 11000000 },
  { key: 'assets', label: 'Total Assets', icon: Building2, budgetTarget: 100000000 },
  { key: 'leverage', label: 'Leverage', icon: Activity, budgetTarget: 0.4 },
  { key: 'ebitdaMargin', label: 'EBITDA Margin', icon: Percent, budgetTarget: 34.5 },
];

// ============================================================
// HELPERS
// ============================================================
function fmtMetric(v: number, metric: string): string {
  if (metric === 'leverage') return `${v.toFixed(2)}x`;
  if (metric === 'ebitdaMargin') return `${v.toFixed(1)}%`;
  return formatCompactEUR(v);
}

function fmtChangePct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function periodLabel(period: string): string {
  return new Date(period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function periodShort(period: string): string {
  return new Date(period + '-01').toLocaleDateString('en-US', { month: 'short' });
}

// ============================================================
// CUSTOM DARK TOOLTIP
// ============================================================
function TrendTooltip({ active, payload, label, metric }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>;
  label?: string;
  metric: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-700 text-xs max-w-xs">
      <p className="font-semibold mb-2 text-slate-300">{label ? periodLabel(label) : ''}</p>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <p key={idx} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-400">{entry.name}</span>
            </span>
            <span className="font-semibold tabular-nums">{fmtMetric(entry.value, metric)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function ChangeTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label ? periodLabel(label) : ''}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">{fmtChangePct(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ============================================================
// MINI SPARKLINE
// ============================================================
function MiniSparkline({ data, color, improving }: { data: number[]; color: string; improving: boolean }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={improving ? '#10b981' : '#f59e0b'} stopOpacity={0.3} />
          <stop offset="100%" stopColor={improving ? '#10b981' : '#f59e0b'} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#spark-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={improving ? '#10b981' : '#f59e0b'} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================================
// FORECAST HELPER — Simple linear regression
// ============================================================
function linearForecast(values: number[], numFuture: number): number[] {
  const n = values.length;
  if (n < 2) return Array(numFuture).fill(values[0] || 0);

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: numFuture }, (_, i) => intercept + slope * (n + i));
}

function forecastConfidenceBand(values: number[], forecasts: number[]): { upper: number[]; lower: number[] } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const expansionFactor = stdDev * 0.5;

  return {
    upper: forecasts.map((v, i) => v + expansionFactor * (1 + i * 0.3)),
    lower: forecasts.map((v, i) => v - expansionFactor * (1 + i * 0.3)),
  };
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function TrendAnalysisView() {
  const { selectedPeriod } = useAppStore();
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [changeView, setChangeView] = useState<'qoq' | 'yoy'>('qoq');
  const [comparePeriod1, setComparePeriod1] = useState('2024-09');
  const [comparePeriod2, setComparePeriod2] = useState('2024-12');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getTrendAnalysis({
        metric: selectedMetric,
        periods: MONTHS.join(','),
      });
      if (data?.periods?.length > 0) {
        setTrendData(data);
      } else {
        setTrendData(generateDemoData(selectedMetric));
      }
    } catch (err) {
      console.error('Failed to load trend data', err);
      setTrendData(generateDemoData(selectedMetric));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedMetric]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If API returns insufficient data, use demo
  const data = useMemo(() => {
    if (trendData && trendData.periods.length >= 6) return trendData;
    return generateDemoData(selectedMetric);
  }, [trendData, selectedMetric]);

  const metricConfig = METRICS.find((m) => m.key === selectedMetric) || METRICS[0];

  // Build chart data for main trend line
  const chartData = useMemo(() => {
    return data.periods.map((p) => {
      const row: Record<string, string | number> = { period: p.period, name: periodShort(p.period) };
      row['Group Consolidated'] = p.value;
      for (const eb of p.entityBreakdown) {
        row[eb.entityName] = eb.value;
      }
      return row;
    });
  }, [data]);

  // Build forecast data
  const forecastData = useMemo(() => {
    const consolidatedValues = data.periods.map((p) => p.value);
    const forecasts = linearForecast(consolidatedValues, 3);
    const band = forecastConfidenceBand(consolidatedValues, forecasts);

    const futureMonths = ['2025-01', '2025-02', '2025-03'];
    const extendedChart: Record<string, string | number | boolean>[] = [...chartData];

    // Add the last real period to connect the line
    const lastPeriod = data.periods[data.periods.length - 1];

    for (let i = 0; i < 3; i++) {
      extendedChart.push({
        period: futureMonths[i],
        name: periodShort(futureMonths[i]),
        'Group Consolidated': forecasts[i],
        'Forecast Upper': band.upper[i],
        'Forecast Lower': band.lower[i],
        forecastOnly: true,
      });
    }

    return { extendedChart, forecasts, band, futureMonths, lastPeriod };
  }, [chartData, data.periods]);

  // Change chart data
  const changeChartData = useMemo(() => {
    const changes = changeView === 'qoq' ? data.qoqChanges : data.yoyChanges;
    return changes.map((c) => ({
      period: c.toPeriod,
      name: periodShort(c.toPeriod),
      changePct: c.changePct,
      change: c.change,
    }));
  }, [data, changeView]);

  // Period comparison table
  const comparisonTableData = useMemo(() => {
    const p1Data = data.periods.find((p) => p.period === comparePeriod1);
    const p2Data = data.periods.find((p) => p.period === comparePeriod2);
    if (!p1Data || !p2Data) return [];

    const metrics = [
      { name: 'Revenue', p1: p1Data.entityBreakdown.reduce((s, e) => s + e.value, 0), p2: p2Data.entityBreakdown.reduce((s, e) => s + e.value, 0) },
      { name: 'EBITDA', p1: p1Data.entityBreakdown.reduce((s, e) => s + e.value * 0.34, 0), p2: p2Data.entityBreakdown.reduce((s, e) => s + e.value * 0.34, 0) },
      { name: 'Net Income', p1: p1Data.entityBreakdown.reduce((s, e) => s + e.value * 0.2, 0), p2: p2Data.entityBreakdown.reduce((s, e) => s + e.value * 0.2, 0) },
      { name: 'Total Assets', p1: p1Data.entityBreakdown.reduce((s, e) => s + e.value * 6, 0), p2: p2Data.entityBreakdown.reduce((s, e) => s + e.value * 6, 0) },
      { name: 'Leverage', p1: p1Data.entityBreakdown.reduce((s, e) => s + e.value, 0) > 0 ? 0.44 : 0, p2: p2Data.entityBreakdown.reduce((s, e) => s + e.value, 0) > 0 ? 0.41 : 0 },
      { name: 'EBITDA Margin', p1: 33.8, p2: 34.1 },
    ];

    return metrics.map((m) => ({
      metric: m.name,
      period1: m.p1,
      period2: m.p2,
      change: m.p2 - m.p1,
      changePct: m.p1 !== 0 ? ((m.p2 - m.p1) / Math.abs(m.p1)) * 100 : 0,
    }));
  }, [data, comparePeriod1, comparePeriod2]);

  // CSV export
  const exportCSV = () => {
    const headers = ['Period', 'Group Consolidated', ...DEMO_ENTITIES.map((e) => e.entityName)];
    const rows = data.periods.map((p) => [
      p.period,
      p.value,
      ...DEMO_ENTITIES.map((e) => p.entityBreakdown.find((b) => b.entityCode === e.entityCode)?.value || 0),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `trend-analysis-${selectedMetric}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const isRatioMetric = selectedMetric === 'leverage' || selectedMetric === 'ebitdaMargin';

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Multi-Period Trend Analysis
          </h2>
          <p className="text-sm text-muted-foreground">Track financial metrics across periods with QoQ/YoY changes, forecasts, and entity breakdowns</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Badge variant="outline" className="text-[10px] font-mono gap-1">
            <Calendar className="w-3 h-3" />
            Jan 2024 — Dec 2024
          </Badge>
        </div>
      </div>

      {/* Metric Selector Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {METRICS.map((m, i) => {
          const Icon = m.icon;
          const isActive = selectedMetric === m.key;
          // Get trend direction from demo data
          const trendValues = generateDemoData(m.key).periods;
          const lastVal = trendValues[trendValues.length - 1]?.value || 0;
          const prevVal = trendValues[trendValues.length - 2]?.value || 0;
          const trendUp = lastVal >= prevVal;

          return (
            <motion.button
              key={m.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedMetric(m.key)}
              className={`relative p-3 rounded-xl text-left transition-all duration-200 border-2 ${
                isActive
                  ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 border-emerald-400 dark:border-emerald-600 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                {trendUp ? (
                  <ArrowUpRight className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-500' : 'text-emerald-400'}`} />
                ) : (
                  <ArrowDownRight className={`w-3.5 h-3.5 ${isActive ? 'text-amber-500' : 'text-amber-400'}`} />
                )}
              </div>
              <p className={`text-xs font-medium ${isActive ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                {m.label}
              </p>
              <p className={`text-sm font-bold mt-0.5 ${isActive ? 'text-emerald-800 dark:text-emerald-200' : 'text-foreground'}`}>
                {fmtMetric(lastVal, m.key)}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Main Trend Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <LineChartIcon className="w-4 h-4 text-emerald-600" />
                  {metricConfig.label} Trend — Multi-Entity
                </CardTitle>
                <CardDescription>12-month trend with entity breakdown and consolidated total</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500 inline-block rounded" /> Consolidated</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 border border-dashed border-amber-400 inline-block" /> Budget</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 border border-dashed border-slate-400 inline-block" /> Forecast</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastData.extendedChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="consolidatedArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.1} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMetric(v, selectedMetric)} stroke="var(--color-muted-foreground)" width={70} />
                    <Tooltip content={<TrendTooltip metric={selectedMetric} />} />

                    {/* Confidence band for forecast */}
                    <Area
                      dataKey="Forecast Upper"
                      stroke="none"
                      fill="url(#forecastBand)"
                      connectNulls={false}
                    />

                    {/* Entity lines */}
                    {DEMO_ENTITIES.map((e) => (
                      <Line
                        key={e.entityCode}
                        type="monotone"
                        dataKey={e.entityName}
                        stroke={e.color}
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray=""
                        activeDot={{ r: 3, strokeWidth: 0 }}
                      />
                    ))}

                    {/* Consolidated line - bold */}
                    <Line
                      type="monotone"
                      dataKey="Group Consolidated"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                    />

                    {/* Area under consolidated */}
                    <Area
                      type="monotone"
                      dataKey="Group Consolidated"
                      stroke="none"
                      fill="url(#consolidatedArea)"
                    />

                    {/* Budget target reference line */}
                    {!isRatioMetric ? (
                      <ReferenceLine y={metricConfig.budgetTarget} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: 'Budget', position: 'right', fill: '#f59e0b', fontSize: 10 }} />
                    ) : (
                      <ReferenceLine y={metricConfig.budgetTarget} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: 'Budget', position: 'right', fill: '#f59e0b', fontSize: 10 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* QoQ / YoY Toggle + Bar Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  Period-over-Period Changes
                </CardTitle>
                <CardDescription>
                  {changeView === 'qoq' ? 'Quarter-over-Quarter' : 'Year-over-Year'} change in {metricConfig.label}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setChangeView('qoq')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    changeView === 'qoq'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  QoQ
                </button>
                <button
                  onClick={() => setChangeView('yoy')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    changeView === 'yoy'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  YoY
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={changeChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} stroke="var(--color-muted-foreground)" />
                    <Tooltip content={<ChangeTooltip />} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                    <Bar dataKey="changePct" name="Change %" radius={[4, 4, 0, 0]} barSize={28}>
                      {changeChartData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.changePct >= 0 ? '#10b981' : '#f59e0b'}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Period Comparison Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600" />
                  Period Comparison
                </CardTitle>
                <CardDescription>Side-by-side metric comparison between two periods</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={comparePeriod1}
                  onChange={(e) => setComparePeriod1(e.target.value)}
                  className="h-8 text-xs rounded-md border bg-white dark:bg-slate-900 px-2"
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{periodLabel(m)}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">vs</span>
                <select
                  value={comparePeriod2}
                  onChange={(e) => setComparePeriod2(e.target.value)}
                  className="h-8 text-xs rounded-md border bg-white dark:bg-slate-900 px-2"
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{periodLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <Table className="premium-table">
                  <TableHeader>
                    <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">{periodShort(comparePeriod1)} 2024</TableHead>
                      <TableHead className="text-right">{periodShort(comparePeriod2)} 2024</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Change %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonTableData.map((row, index) => {
                      const isPositive = row.change >= 0;
                      return (
                        <TableRow key={row.metric} className={`cursor-pointer transition-colors duration-150 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                          <TableCell className="font-medium text-sm">{row.metric}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMetric(row.period1, selectedMetric)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtMetric(row.period2, selectedMetric)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            <span className="flex items-center justify-end gap-0.5">
                              {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {fmtMetric(Math.abs(row.change), selectedMetric)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={`text-[10px] ${isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                              {fmtChangePct(row.changePct)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Entity Trend Sparklines */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-emerald-600" />
            Entity Trend Sparklines
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {data.entityTrends.map((et, i) => {
              const isImproving = et.change >= 0;
              const entityColor = DEMO_ENTITIES.find((e) => e.entityCode === et.entityCode)?.color || '#10b981';
              return (
                <motion.div
                  key={et.entityCode}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                >
                  <Card className={`shadow-sm border border-slate-200/60 dark:border-slate-700/40 border-2 transition-all hover:shadow-md ${
                    isImproving
                      ? 'border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-slate-900'
                      : 'border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-slate-900'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">{et.entityCode}</p>
                          <p className="text-sm font-semibold truncate max-w-[120px]">{et.entityName.split(' ').slice(1).join(' ')}</p>
                        </div>
                        <div className={`p-1.5 rounded-lg ${isImproving ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                          {isImproving ? (
                            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-lg font-bold">{fmtMetric(et.currentValue, selectedMetric)}</p>
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${isImproving ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {isImproving ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {fmtChangePct(et.changePct)}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        <MiniSparkline data={et.sparklineData} color={entityColor} improving={isImproving} />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Trend Forecast */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Trend Forecast — Linear Projection
                </CardTitle>
                <CardDescription>3-period forward projection with confidence band based on historical trend</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500 inline-block rounded" /> Actual</span>
                <span className="flex items-center gap-1"><span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-400 inline-block" /> Forecast</span>
                <span className="flex items-center gap-1"><span className="w-4 h-3 bg-emerald-100 dark:bg-emerald-900/30 inline-block rounded" /> Confidence</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastData.extendedChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="confBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMetric(v, selectedMetric)} stroke="var(--color-muted-foreground)" width={70} />
                    <Tooltip content={<TrendTooltip metric={selectedMetric} />} />

                    {/* Confidence band */}
                    <Area
                      type="monotone"
                      dataKey="Forecast Upper"
                      stroke="none"
                      fill="url(#confBand)"
                      connectNulls={false}
                    />

                    {/* Actual data - solid line */}
                    <Line
                      type="monotone"
                      dataKey="Group Consolidated"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#10b981' }}
                      connectNulls={false}
                    />

                    {/* Forecast reference line separator */}
                    <ReferenceLine x="Dec" stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Forecast →', position: 'top', fill: '#94a3b8', fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Forecast values summary */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {forecastData.forecasts.map((f, i) => (
                <div key={i} className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    {periodLabel(forecastData.futureMonths[i])}
                  </p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {fmtMetric(f, selectedMetric)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Range: {fmtMetric(forecastData.band.lower[i], selectedMetric)} — {fmtMetric(forecastData.band.upper[i], selectedMetric)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Trend Forecast Legend */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-emerald-600" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider mb-2">Latest QoQ</p>
                {data.qoqChanges.length > 0 ? (
                  <>
                    <p className={`text-xl font-bold ${data.qoqChanges[data.qoqChanges.length - 1].changePct >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-400'}`}>
                      {fmtChangePct(data.qoqChanges[data.qoqChanges.length - 1].changePct)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {periodLabel(data.qoqChanges[data.qoqChanges.length - 1].fromPeriod)} → {periodLabel(data.qoqChanges[data.qoqChanges.length - 1].toPeriod)}
                    </p>
                  </>
                ) : <p className="text-muted-foreground text-sm">No data</p>}
              </div>

              <div className="p-4 bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/20 dark:to-slate-900 rounded-xl border border-teal-200 dark:border-teal-800/40">
                <p className="text-xs text-teal-600 dark:text-teal-400 font-medium uppercase tracking-wider mb-2">Latest YoY</p>
                {data.yoyChanges.length > 0 ? (
                  <>
                    <p className={`text-xl font-bold ${data.yoyChanges[data.yoyChanges.length - 1].changePct >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-400'}`}>
                      {fmtChangePct(data.yoyChanges[data.yoyChanges.length - 1].changePct)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {periodLabel(data.yoyChanges[data.yoyChanges.length - 1].fromPeriod)} → {periodLabel(data.yoyChanges[data.yoyChanges.length - 1].toPeriod)}
                    </p>
                  </>
                ) : <p className="text-muted-foreground text-sm">No data</p>}
              </div>

              <div className="p-4 bg-gradient-to-br from-cyan-50/80 to-white dark:from-cyan-950/20 dark:to-slate-900 rounded-xl border border-cyan-200 dark:border-cyan-800/40">
                <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium uppercase tracking-wider mb-2">3M Forecast</p>
                {forecastData.forecasts.length > 0 ? (
                  <>
                    <p className="text-xl font-bold text-cyan-700 dark:text-cyan-300">
                      {fmtMetric(forecastData.forecasts[forecastData.forecasts.length - 1], selectedMetric)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      by {periodLabel(forecastData.futureMonths[forecastData.futureMonths.length - 1])}
                    </p>
                  </>
                ) : <p className="text-muted-foreground text-sm">No data</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
