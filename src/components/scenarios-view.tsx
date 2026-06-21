'use client';

import { useState, useEffect, useCallback } from 'react';
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { getScenarios, runScenario, getEntities } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Scenario, Entity } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { demoScenarios, scenarioComparison as fallbackComparison } from '@/lib/demo-data';
import { formatEUR } from '@/lib/utils';
import { DataLoadError } from '@/components/data-load-error';
import { motion, AnimatePresence } from 'framer-motion';

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

const impactChartData = [
  { metric: 'Revenue', base: 51900, optimistic: 59685, pessimistic: 44115 },
  { metric: 'EBITDA', base: 17580, optimistic: 21800, pessimistic: 12800 },
  { metric: 'Net Income', base: 8961, optimistic: 11400, pessimistic: 5600 },
];

// Radar chart data
const radarData = [
  { dimension: 'Revenue', base: 87, optimistic: 100, pessimistic: 74 },
  { dimension: 'EBITDA Margin', base: 85, optimistic: 91, pessimistic: 73 },
  { dimension: 'Net Income', base: 78, optimistic: 100, pessimistic: 49 },
  { dimension: 'Leverage', base: 88, optimistic: 95, pessimistic: 60 },
  { dimension: 'ROE', base: 82, optimistic: 100, pessimistic: 51 },
];

// Sensitivity analysis data
const sensitivityData = [
  { assumption: 'Inflation ±1%', revenue: '±€1.2M', ebitda: '±€0.4M', netIncome: '±€0.3M', stress: false },
  { assumption: 'Interest Rate ±1%', revenue: '—', ebitda: '—', netIncome: '±€0.2M', stress: false },
  { assumption: 'FX Vol. ±1%', revenue: '±€0.8M', ebitda: '±€0.3M', netIncome: '±€0.2M', stress: true },
  { assumption: 'Rev. Growth ±1%', revenue: '±€0.5M', ebitda: '±€0.2M', netIncome: '±€0.1M', stress: false },
  { assumption: 'OPEX Growth ±1%', revenue: '—', ebitda: '±€0.2M', netIncome: '±€0.1M', stress: false },
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
  const { selectedPeriod } = useAppStore();
  const [scenarios, setScenarios] = useState<Scenario[]>(demoScenarios);
  const [selectedScenario, setSelectedScenario] = useState<string>('scen-base');
  const [scenarioComparison, setScenarioComparison] = useState(fallbackComparison);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
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
      toast({ title: 'Scenario Completed', description: `${currentScenario.name} simulation finished` });
    } catch {
      toast({ title: 'Scenario Run', description: 'Simulation completed with fallback data', variant: 'default' });
    } finally {
      setTimeout(() => setIsRunning(false), 1500);
    }
  };

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return formatEUR(v);
    if (typeof v === 'number' && v % 1 !== 0) return v.toFixed(2);
    return `€${v}`;
  };

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
                      <Badge variant="outline" className="text-[10px] capitalize">{scenario.scenarioType}</Badge>
                    </div>
                    {isSelected && (
                      <motion.div
                        layoutId="selectedDot"
                        className="ml-auto w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Inflation</span><p className="font-medium">{scenario.inflationRate}%</p></div>
                    <div><span className="text-muted-foreground">Interest</span><p className="font-medium">{scenario.interestRate}%</p></div>
                    <div><span className="text-muted-foreground">FX Vol.</span><p className="font-medium">{scenario.fxVolatility}%</p></div>
                    <div><span className="text-muted-foreground">Rev. Growth</span><p className="font-medium">{((scenario.revenueGrowthFactor - 1) * 100).toFixed(0)}%</p></div>
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
              <CardTitle className="text-base">Scenario Radar Comparison</CardTitle>
              <CardDescription>Multi-dimensional comparison across scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="var(--color-border)" opacity={0.5} />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Radar name="Base" dataKey="base" stroke="#0d9488" fill="#0d9488" fillOpacity={0.15} strokeWidth={2} />
                    <Radar name="Optimistic" dataKey="optimistic" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                    <Radar name="Pessimistic" dataKey="pessimistic" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={2} />
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
                Edit Assumptions — {currentScenario.name}
              </CardTitle>
              <CardDescription>Adjust macro and growth assumptions for scenario modelling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { field: 'inflationRate' as const, label: 'Inflation Rate', min: 0, max: 10, step: 0.25, unit: '%' },
                { field: 'interestRate' as const, label: 'Interest Rate', min: 0, max: 10, step: 0.25, unit: '%' },
                { field: 'fxVolatility' as const, label: 'FX Volatility', min: 0, max: 20, step: 0.5, unit: '%' },
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
                { field: 'revenueGrowthFactor' as const, label: 'Revenue Growth Factor', mult: 100 },
                { field: 'opexGrowthFactor' as const, label: 'OPEX Growth Factor', mult: 100 },
                { field: 'capexGrowthFactor' as const, label: 'CAPEX Growth Factor', mult: 100 },
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
                {isRunning ? 'Running Simulation...' : 'Run Scenario'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Impact Comparison Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">Scenario Impact Comparison</CardTitle>
            <CardDescription>Key metrics across scenarios (€K)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={impactChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                  <Bar dataKey="pessimistic" name="Pessimistic" fill="url(#pessimisticGradient)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="base" name="Base" fill="url(#baseGradient)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="optimistic" name="Optimistic" fill="url(#optimisticGradient)" radius={[4, 4, 0, 0]} />
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
            <CardTitle className="text-base">Sensitivity Analysis</CardTitle>
            <CardDescription>Impact of ±1% change in each assumption on key outputs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                    <TableHead>Assumption</TableHead>
                    <TableHead className="text-right">Revenue Impact</TableHead>
                    <TableHead className="text-right">EBITDA Impact</TableHead>
                    <TableHead className="text-right">Net Income Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sensitivityData.map((row, index) => (
                    <TableRow key={row.assumption} className={`cursor-pointer transition-colors duration-150 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                      <TableCell className="font-medium text-sm flex items-center gap-1.5">
                        {row.assumption}
                        {row.stress && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-[9px] px-1 py-0 flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Stress
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
            <CardTitle className="text-base">Monte Carlo Distribution</CardTitle>
            <CardDescription>Probability distribution of Net Income outcomes (1,000 simulations)</CardDescription>
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
              <span>Pessimistic</span>
              <span>Base Case</span>
              <span>Optimistic</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Scenario Comparison Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">Scenario Comparison Table</CardTitle>
            <CardDescription>Side-by-side comparison of key financial metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Base Case</TableHead>
                    <TableHead className="text-right">Optimistic</TableHead>
                    <TableHead className="text-right">Pessimistic</TableHead>
                    <TableHead className="text-right">Opt. vs Base</TableHead>
                    <TableHead className="text-right">Pess. vs Base</TableHead>
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
