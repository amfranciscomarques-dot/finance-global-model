'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ArrowUpRight, ArrowDownRight, Loader2, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend,
  LineChart, Line,
} from 'recharts';
import { getVariance } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { VarianceData } from '@/lib/types';
import { demoVarianceData, availablePeriods } from '@/lib/demo-data';
import { formatCompactEUR, formatNumber } from '@/lib/format';
import { DataLoadError } from '@/components/data-load-error';
import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';

function exportVarianceCSV(data: VarianceData[], filename: string, headers: string[]) {
  const rows = data.map(d => [
    d.metric,
    d.actual,
    d.budget,
    d.forecast,
    d.varianceVsBudget,
    d.varianceVsForecast,
    `${d.variancePctBudget.toFixed(1)}%`,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function VarianceTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-semibold">€{formatNumber(entry.value)}K</span>
        </p>
      ))}
    </div>
  );
}

// Variance trend sparkline data (3 months)
const varianceTrendData: Record<string, number[]> = {
  'Revenue': [2.1, 2.5, 2.8],
  'COGS': [-1.8, -2.2, -2.7],
  'EBITDA': [3.2, 3.9, 4.6],
  'OPEX': [-0.5, -0.6, -0.8],
  'Net Income': [4.2, 5.5, 6.7],
};

function VarianceSparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  const chartData = data.map((v, i) => ({ x: i, value: v }));
  return (
    <div className="w-16 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
          <Line type="monotone" dataKey="value" stroke={isPositive ? '#10b981' : '#f59e0b'} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Heatmap cell component
function HeatmapCell({ value, label }: { value: number; label: string }) {
  const absVal = Math.abs(value);
  const intensity = Math.min(absVal / 8, 1); // normalize to 0-1
  const isPositive = value >= 0;
  const bgColor = isPositive
    ? `rgba(16, 185, 129, ${0.1 + intensity * 0.4})`
    : `rgba(245, 158, 11, ${0.1 + intensity * 0.4})`;
  const textColor = isPositive
    ? `rgb(${5 + intensity * 0}, ${150 - intensity * 30}, ${100 + intensity * 20})`
    : `rgb(${180 + intensity * 50}, ${120 - intensity * 30}, ${10})`;

  return (
    <div
      className="rounded-lg p-3 text-center transition-transform hover:scale-105 cursor-default"
      style={{ backgroundColor: bgColor }}
    >
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold" style={{ color: isPositive ? '#059669' : '#d97706' }}>
        {value >= 0 ? '+' : ''}{value.toFixed(1)}%
      </p>
    </div>
  );
}

export function VarianceView() {
  const t = useTranslations('variance');
  const loc = useLocale() as Locale;
  const { selectedPeriod, setSelectedPeriod } = useAppStore();
  const [varianceData, setVarianceData] = useState<VarianceData[]>(demoVarianceData);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadVariance = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getVariance(selectedPeriod);
      if (data && data.length > 0) {
        setVarianceData(data);
      }
    } catch (err) {
      console.error('Failed to load variance data', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadVariance();
  }, [loadVariance]);

  // Proper waterfall: compute running total
  const waterfallItems = varianceData
    .filter((d) => Math.abs(d.varianceVsBudget) > 50)
    .map((d) => ({ name: d.metric, value: d.varianceVsBudget }));

  // Build stacked waterfall data
  let runningTotal = 0;
  const waterfallChartData = waterfallItems.map((item) => {
    const prev = runningTotal;
    runningTotal += item.value;
    if (item.value >= 0) {
      return { name: item.name, base: prev, barValue: item.value, rawValue: item.value, type: 'positive' };
    } else {
      return { name: item.name, base: runningTotal, barValue: Math.abs(item.value), rawValue: item.value, type: 'negative' };
    }
  });

  const revenueVariance = varianceData.find(d => d.metric === 'Revenue');
  const ebitdaVariance = varianceData.find(d => d.metric === 'EBITDA');
  const netIncomeVariance = varianceData.find(d => d.metric === 'Net Income');

  // Heatmap data from variance percentages
  const heatmapItems = varianceData.map(d => ({ label: d.metric, value: d.variancePctBudget }));

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportVarianceCSV(varianceData, `variance-report-${selectedPeriod}.csv`, [
              t('headers.metric'), t('headers.actual'), t('headers.budget'), t('headers.forecast'),
              t('headers.varVsBudget'), t('headers.varVsForecast'), t('headers.pctVarBudget'),
            ])}
          >
            <Download className="w-4 h-4 mr-1" /> {t('export')}
          </Button>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availablePeriods.slice(0, 6).map((p) => (
                <SelectItem key={p} value={p}>
                  {new Date(p + '-01').toLocaleDateString(dateLocale(loc), { year: 'numeric', month: 'short' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Variance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="shadow-sm bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900 hover:shadow-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('cards.revenue')}</p>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <p className={`text-2xl font-bold ${revenueVariance && revenueVariance.varianceVsBudget >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {revenueVariance ? `${revenueVariance.varianceVsBudget >= 0 ? '+' : ''}${formatCompactEUR(Math.abs(revenueVariance.varianceVsBudget))}` : '+€1.4M'}
                  </p>
                  <p className={`text-xs flex items-center gap-0.5 mt-1 ${revenueVariance && revenueVariance.varianceVsBudget >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {revenueVariance && revenueVariance.varianceVsBudget >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {revenueVariance ? `${revenueVariance.variancePctBudget >= 0 ? '+' : ''}${revenueVariance.variancePctBudget.toFixed(1)}% ${t('cards.vsBudgetSuffix')}` : `+2.8% ${t('cards.vsBudgetSuffix')}`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="shadow-sm bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/30 dark:to-slate-900 hover:shadow-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('cards.ebitda')}</p>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <p className={`text-2xl font-bold ${ebitdaVariance && ebitdaVariance.varianceVsBudget >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {ebitdaVariance ? `${ebitdaVariance.varianceVsBudget >= 0 ? '+' : ''}${formatCompactEUR(Math.abs(ebitdaVariance.varianceVsBudget))}` : '+€0.8M'}
                  </p>
                  <p className={`text-xs flex items-center gap-0.5 mt-1 ${ebitdaVariance && ebitdaVariance.varianceVsBudget >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {ebitdaVariance && ebitdaVariance.varianceVsBudget >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {ebitdaVariance ? `${ebitdaVariance.variancePctBudget >= 0 ? '+' : ''}${ebitdaVariance.variancePctBudget.toFixed(1)}% ${t('cards.vsBudgetSuffix')}` : `+4.6% ${t('cards.vsBudgetSuffix')}`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="shadow-sm bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-slate-900 hover:shadow-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('cards.netIncome')}</p>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <p className={`text-2xl font-bold ${netIncomeVariance && netIncomeVariance.varianceVsBudget >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {netIncomeVariance ? `${netIncomeVariance.varianceVsBudget >= 0 ? '+' : ''}${formatCompactEUR(Math.abs(netIncomeVariance.varianceVsBudget))}` : '+€0.6M'}
                  </p>
                  <p className={`text-xs flex items-center gap-0.5 mt-1 ${netIncomeVariance && netIncomeVariance.varianceVsBudget >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {netIncomeVariance && netIncomeVariance.varianceVsBudget >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {netIncomeVariance ? `${netIncomeVariance.variancePctBudget >= 0 ? '+' : ''}${netIncomeVariance.variancePctBudget.toFixed(1)}% ${t('cards.vsBudgetSuffix')}` : `+6.7% ${t('cards.vsBudgetSuffix')}`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Variance Heatmap */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('heatmapTitle')}</CardTitle>
            <CardDescription>{t('heatmapDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {heatmapItems.map((item) => (
                <HeatmapCell key={item.label} value={item.value} label={item.label} />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Proper Waterfall Chart with Running Total */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('waterfallTitle')}</CardTitle>
            <CardDescription>{t('waterfallDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="posVarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="negVarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} stroke="var(--color-muted-foreground)" />
                  <Tooltip content={<VarianceTooltip />} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" name="base" />
                  <Bar dataKey="barValue" stackId="waterfall" radius={[3, 3, 0, 0]} name={t('waterfallBar')}>
                    {waterfallChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.type === 'positive' ? 'url(#posVarGrad)' : 'url(#negVarGrad)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Detailed Variance Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('tableTitle')}</CardTitle>
            <CardDescription>{t('tableDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto">
                <Table className="premium-table">
                  <TableHeader>
                    <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                      <TableHead className="min-w-[160px]">{t('headers.metric')}</TableHead>
                      <TableHead className="text-right">{t('headers.actual')}</TableHead>
                      <TableHead className="text-right">{t('headers.budget')}</TableHead>
                      <TableHead className="text-right">{t('headers.forecast')}</TableHead>
                      <TableHead className="text-right">{t('headers.varVsBudget')}</TableHead>
                      <TableHead className="text-right">{t('headers.varVsForecast')}</TableHead>
                      <TableHead className="text-right">{t('headers.pctVarBudget')}</TableHead>
                      <TableHead className="hidden sm:table-cell text-center">{t('headers.trend')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {varianceData.map((row, index) => {
                      const isFavorableBudget = row.varianceVsBudget >= 0;
                      const isFavorableForecast = row.varianceVsForecast >= 0;
                      const isExpense = row.actual < 0;
                      const budgetFav = isExpense ? row.varianceVsBudget >= 0 : row.varianceVsBudget >= 0;
                      const trendData = varianceTrendData[row.metric];
                      return (
                        <TableRow key={row.metric} className={`cursor-pointer transition-colors duration-150 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                          <TableCell className="font-medium">{row.metric}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.actual)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.budget)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.forecast)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${budgetFav ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            <span className="flex items-center justify-end gap-1">
                              {row.varianceVsBudget >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {formatNumber(Math.abs(row.varianceVsBudget))}
                            </span>
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${isFavorableForecast ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {row.varianceVsForecast >= 0 ? '+' : '-'}{formatNumber(Math.abs(row.varianceVsForecast))}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                              row.variancePctBudget >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {row.variancePctBudget >= 0 ? '+' : ''}{row.variancePctBudget.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {trendData ? (
                              <div className="flex justify-center">
                                <VarianceSparkline data={trendData} isPositive={row.variancePctBudget >= 0} />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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
    </div>
  );
}
