'use client';

import { useState, useEffect } from 'react';
import { GitBranch, Play, TrendingUp, TrendingDown, Minus, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { getScenarios, runScenario, getEntities } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Scenario, Entity } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { demoScenarios, scenarioComparison as fallbackComparison } from '@/lib/demo-data';
import { formatEUR } from '@/lib/utils';
import { DataLoadError } from '@/components/data-load-error';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

const scenarioColors: Record<string, string> = {
  base: '#0d9488', optimistic: '#10b981', pessimistic: '#f59e0b',
};

const scenarioGradientBg: Record<string, string> = {
  base: 'bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/30 dark:to-slate-900',
  optimistic: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900',
  pessimistic: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900',
};

const scenarioIcons: Record<string, React.ElementType> = {
  base: Minus, optimistic: TrendingUp, pessimistic: TrendingDown,
};

// Keyed chart/table data — display labels are resolved from the `scenarios`
// message namespace at render time so both languages stay in sync.
const impactChartData = [
  { key: 'revenue', base: 51900, optimistic: 59685, pessimistic: 44115 },
  { key: 'ebitda', base: 17580, optimistic: 21800, pessimistic: 12800 },
  { key: 'netIncome', base: 8961, optimistic: 11400, pessimistic: 5600 },
];

// Radar chart data
const radarData = [
  { key: 'revenue', base: 87, optimistic: 100, pessimistic: 74 },
  { key: 'ebitdaMargin', base: 85, optimistic: 91, pessimistic: 73 },
  { key: 'netIncome', base: 78, optimistic: 100, pessimistic: 49 },
  { key: 'leverage', base: 88, optimistic: 95, pessimistic: 60 },
  { key: 'roe', base: 82, optimistic: 100, pessimistic: 51 },
];

// Sensitivity analysis data
const sensitivityData = [
  { key: 'inflation', revenue: '±€1.2M', ebitda: '±€0.4M', netIncome: '±€0.3M', stress: false },
  { key: 'interest', revenue: '—', ebitda: '—', netIncome: '±€0.2M', stress: false },
  { key: 'fxVol', revenue: '±€0.8M', ebitda: '±€0.3M', netIncome: '±€0.2M', stress: true },
  { key: 'revGrowth', revenue: '±€0.5M', ebitda: '±€0.2M', netIncome: '±€0.1M', stress: false },
  { key: 'opexGrowth', revenue: '—', ebitda: '±€0.2M', netIncome: '±€0.1M', stress: false },
];

function ScenarioTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">{formatEUR(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function RadarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function ScenariosView() {
  const t = useTranslations('scenarios');
  const { selectedPeriod } = useAppStore();
  const [scenarios, setScenarios] = useState<Scenario[]>(demoScenarios);
  const [selectedScenario, setSelectedScenario] = useState<string>('scen-base');
  const [scenarioComparison] = useState(fallbackComparison);
  const [isRunning, setIsRunning] = useState(false);
  const [, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function loadScenarios() {
      setLoadError(false);
      try {
        const data = await getScenarios();
        if (data && data.length > 0) {
          setScenarios(data);
          if (data[0].id) setSelectedScenario(data[0].id);
        }
      } catch (err) {
        console.error('Failed to load scenarios', err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    loadScenarios();
  }, []);

  const currentScenario = scenarios.find((s) => s.id === selectedScenario) || scenarios[0];

  const handleSliderChange = (field: keyof Scenario, value: number[]) => {
    setScenarios(scenarios.map((s) =>
      s.id === selectedScenario ? { ...s, [field]: value[0] } : s
    ));
  };

  const handleRunScenario = async () => {
    setIsRunning(true);
    try {
      const entities = await getEntities();
      const entityCodes = entities.map((e: Entity) => e.code);
      await runScenario(currentScenario.id, selectedPeriod, entityCodes);
      toast({ title: t('toast.completedTitle'), description: t('toast.completedDesc', { name: currentScenario.name }) });
    } catch {
      toast({ title: t('toast.fallbackTitle'), description: t('toast.fallbackDesc'), variant: 'default' });
    } finally {
      setTimeout(() => setIsRunning(false), 1500);
    }
  };

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return formatEUR(v);
    if (typeof v === 'number' && v % 1 !== 0) return v.toFixed(2);
    return `€${v}`;
  };

  // Resolve display labels for keyed chart/table data.
  const impactData = impactChartData.map((d) => ({ ...d, metric: t(`metrics.${d.key}`) }));
  const radarChartData = radarData.map((d) => ({ ...d, dimension: t(`metrics.${d.key}`) }));

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Scenario Cards with Gradient Backgrounds */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {scenarios.map((scenario, index) => {
          const Icon = scenarioIcons[scenario.scenarioType] || Minus;
          const isSelected = selectedScenario === scenario.id;
          return (
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className={`cursor-pointer transition-all duration-200 shadow-sm ${scenarioGradientBg[scenario.scenarioType]} ${
                  isSelected
                    ? 'ring-2 ring-emerald-500 border-emerald-300 dark:border-emerald-700 shadow-emerald-500/10'
                    : 'hover:border-slate-300 dark:hover:border-slate-600'
                }`}
                onClick={() => setSelectedScenario(scenario.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform duration-200" style={{ backgroundColor: `${scenarioColors[scenario.scenarioType]}20` }}>
                      <Icon className="w-4 h-4" style={{ color: scenarioColors[scenario.scenarioType] }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{scenario.name}</h3>
                      <Badge variant="outline" className="text-[10px] capitalize">{t(`scenarioType.${scenario.scenarioType}`)}</Badge>
                    </div>
                    {isSelected && (
                      <motion.div
                        layoutId="selectedDot"
                        className="ml-auto w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">{t('cardFields.inflation')}</span><p className="font-medium">{scenario.inflationRate}%</p></div>
                    <div><span className="text-muted-foreground">{t('cardFields.interest')}</span><p className="font-medium">{scenario.interestRate}%</p></div>
                    <div><span className="text-muted-foreground">{t('cardFields.fxVol')}</span><p className="font-medium">{scenario.fxVolatility}%</p></div>
                    <div><span className="text-muted-foreground">{t('cardFields.revGrowth')}</span><p className="font-medium">{((scenario.revenueGrowthFactor - 1) * 100).toFixed(0)}%</p></div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Radar Chart + Assumption Editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader>
              <CardTitle className="text-base">{t('radarTitle')}</CardTitle>
              <CardDescription>{t('radarDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarChartData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="var(--color-border)" opacity={0.5} />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar name={t('names.base')} dataKey="base" stroke="#0d9488" fill="#0d9488" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name={t('names.optimistic')} dataKey="optimistic" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                    <Radar name={t('names.pessimistic')} dataKey="pessimistic" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={2} />
                    <Tooltip content={<RadarTooltip />} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-emerald-600" />
                {t('editAssumptions', { name: currentScenario.name })}
              </CardTitle>
              <CardDescription>{t('editAssumptionsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { field: 'inflationRate' as const, label: t('assumptions.inflationRate'), min: 0, max: 10, step: 0.25, unit: '%' },
                { field: 'interestRate' as const, label: t('assumptions.interestRate'), min: 0, max: 10, step: 0.25, unit: '%' },
                { field: 'fxVolatility' as const, label: t('assumptions.fxVolatility'), min: 0, max: 20, step: 0.5, unit: '%' },
              ].map(({ field, label, min, max, step, unit }) => (
                <div key={field} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>{label}</Label>
                    <span className="font-medium tabular-nums">{(currentScenario[field] as number)}{unit}</span>
                  </div>
                  <Slider value={[currentScenario[field] as number]} onValueChange={(v) => handleSliderChange(field, v)} min={min} max={max} step={step} />
                </div>
              ))}
              {[
                { field: 'revenueGrowthFactor' as const, label: t('assumptions.revenueGrowthFactor'), mult: 100 },
                { field: 'opexGrowthFactor' as const, label: t('assumptions.opexGrowthFactor'), mult: 100 },
                { field: 'capexGrowthFactor' as const, label: t('assumptions.capexGrowthFactor'), mult: 100 },
              ].map(({ field, label, mult }) => (
                <div key={field} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>{label}</Label>
                    <span className="font-medium tabular-nums">{((currentScenario[field] as number) * mult).toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={[(currentScenario[field] as number) * mult]}
                    onValueChange={(v) => handleSliderChange(field, v.map((x) => x / mult))}
                    min={50} max={150} step={1}
                  />
                </div>
              ))}
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors" onClick={handleRunScenario} disabled={isRunning}>
                {isRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                {isRunning ? t('running') : t('runScenario')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Impact Comparison Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('impactTitle')}</CardTitle>
            <CardDescription>{t('impactDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={impactData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="pessimisticGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="baseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d9488" />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="optimisticGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                  <XAxis dataKey="metric" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatEUR(v, 0)} stroke="var(--color-muted-foreground)" />
                  <Tooltip content={<ScenarioTooltip />} />
                  <Legend />
                  <Bar dataKey="pessimistic" name={t('names.pessimistic')} fill="url(#pessimisticGradient)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="base" name={t('names.base')} fill="url(#baseGradient)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="optimistic" name={t('names.optimistic')} fill="url(#optimisticGradient)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Sensitivity Analysis */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('sensitivityTitle')}</CardTitle>
            <CardDescription>{t('sensitivityDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                    <TableHead>{t('sensitivityHeaders.assumption')}</TableHead>
                    <TableHead className="text-right">{t('sensitivityHeaders.revenue')}</TableHead>
                    <TableHead className="text-right">{t('sensitivityHeaders.ebitda')}</TableHead>
                    <TableHead className="text-right">{t('sensitivityHeaders.netIncome')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sensitivityData.map((row, index) => (
                    <TableRow key={row.key} className={`cursor-pointer transition-colors duration-150 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                      <TableCell className="font-medium text-sm flex items-center gap-1.5">
                        {t(`sensitivityRows.${row.key}`)}
                        {row.stress && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-[9px] px-1 py-0 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> {t('stress')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.revenue}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.ebitda}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.netIncome}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Monte Carlo Simulation Mini-Visualization */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('monteCarloTitle')}</CardTitle>
            <CardDescription>{t('monteCarloDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-px h-32">
              {Array.from({ length: 40 }, (_, i) => {
                const x = (i - 20) / 20;
                const height = Math.exp(-x * x * 2) * 100;
                const isPessimistic = i < 8;
                const isOptimistic = i > 32;
                return (
                  <div
                    key={i}
                    className={`w-2 rounded-t-sm transition-all duration-200 ${
                      isPessimistic ? 'bg-amber-400/70' :
                      isOptimistic ? 'bg-emerald-400/70' :
                      'bg-teal-500/70'
                    }`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{t('distLabels.pessimistic')}</span>
              <span>{t('distLabels.base')}</span>
              <span>{t('distLabels.optimistic')}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Scenario Comparison Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('comparisonTitle')}</CardTitle>
            <CardDescription>{t('comparisonDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                    <TableHead>{t('comparisonHeaders.metric')}</TableHead>
                    <TableHead className="text-right">{t('comparisonHeaders.base')}</TableHead>
                    <TableHead className="text-right">{t('comparisonHeaders.optimistic')}</TableHead>
                    <TableHead className="text-right">{t('comparisonHeaders.pessimistic')}</TableHead>
                    <TableHead className="text-right">{t('comparisonHeaders.optVsBase')}</TableHead>
                    <TableHead className="text-right">{t('comparisonHeaders.pessVsBase')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenarioComparison.map((row, index) => {
                    const optVsBase = row.optimistic - row.base;
                    const pessVsBase = row.pessimistic - row.base;
                    const isPercent = row.metric.includes('%') || row.metric.includes('Leverage');
                    return (
                      <TableRow key={row.metric} className={`cursor-pointer transition-colors duration-150 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                        <TableCell className="font-medium">{row.metric}</TableCell>
                        <TableCell className="text-right font-semibold">{isPercent ? `${row.base}%` : fmt(row.base)}</TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{isPercent ? `${row.optimistic}%` : fmt(row.optimistic)}</TableCell>
                        <TableCell className="text-right text-amber-600 dark:text-amber-400">{isPercent ? `${row.pessimistic}%` : fmt(row.pessimistic)}</TableCell>
                        <TableCell className="text-right">
                          <span className={optVsBase >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            {optVsBase >= 0 ? '↑ ' : '↓ '}{isPercent ? `${Math.abs(optVsBase).toFixed(1)}pp` : fmt(Math.abs(optVsBase))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={pessVsBase >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            {pessVsBase >= 0 ? '↑ ' : '↓ '}{isPercent ? `${Math.abs(pessVsBase).toFixed(1)}pp` : fmt(Math.abs(pessVsBase))}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
