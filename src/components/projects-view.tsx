'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Rocket, TrendingUp, Clock, Banknote, Landmark, Loader2, RefreshCw, Database, Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface Project {
  id: string;
  code: string;
  name: string;
  entityCode: string;
  countryCode: string;
  projectType: string;
  currency: string;
  status: string;
  startYear: number;
  horizonYears: number;
  capexTotal: number;
  debtAmount: number;
  debtRate: number;
  equityAmount: number;
  discountRate: number;
  terminalGrowth: number;
  taxRate: number;
  description: string | null;
  npv: number | null;
  irr: number | null;
  paybackYears: number | null;
  assumptions: Record<string, unknown> | null;
  cashFlows: { years: number[]; cashFlows: number[] } | null;
}

function fmtMoney(n: number, currency: string): string {
  const abs = Math.abs(n);
  const unit = abs >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : abs >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : n.toFixed(0);
  return `${currency === 'USD' ? '$' : '€'}${unit}`;
}

export function ProjectsView() {
  const t = useTranslations('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects ?? []);
      setError(null);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedDemo = async () => {
    setSeeding(true);
    try {
      await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: 'template', reset: true }),
      });
      await load();
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> {t('refresh')}
          </Button>
          <Button size="sm" onClick={seedDemo} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700">
            {seeding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
            {t('seedDemo')}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-amber-600">{error}</p>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" /><Skeleton className="h-64" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Rocket className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <Button size="sm" onClick={seedDemo} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700">
              {seeding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
              {t('seedDemo')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {projects.map((p, idx) => {
            const chartData = (p.cashFlows?.years ?? []).map((y, i) => ({ year: String(y), cf: p.cashFlows!.cashFlows[i] }));
            const npvPositive = (p.npv ?? 0) >= 0;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {p.name}
                          <Badge variant="outline" className="text-[10px] font-mono">{p.code}</Badge>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Building2 className="w-3 h-3" /> {p.entityCode} · {p.countryCode} · {p.startYear}–{p.startYear + p.horizonYears - 1}
                        </CardDescription>
                      </div>
                      <Badge className={npvPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}>
                        {npvPositive ? t('valueAccretive') : t('review')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Headline metrics */}
                    <div className="grid grid-cols-3 gap-3">
                      <Metric icon={TrendingUp} label={t('npv')} value={p.npv != null ? fmtMoney(p.npv, p.currency) : '—'} accent={npvPositive} />
                      <Metric icon={Rocket} label={t('irr')} value={p.irr != null ? `${(p.irr * 100).toFixed(1)}%` : '—'} accent={p.irr != null && p.irr > p.discountRate} />
                      <Metric icon={Clock} label={t('payback')} value={p.paybackYears != null ? t('paybackYears', { years: p.paybackYears.toFixed(1) }) : '—'} />
                    </div>

                    {/* Capital structure */}
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <KV icon={Banknote} label={t('capex')} value={fmtMoney(p.capexTotal, p.currency)} />
                      <KV icon={Landmark} label={t('debtLabel', { rate: (p.debtRate * 100).toFixed(2) })} value={fmtMoney(p.debtAmount, p.currency)} />
                      <KV icon={Banknote} label={t('equity')} value={fmtMoney(p.equityAmount, p.currency)} />
                    </div>

                    {/* Assumptions */}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">WACC {(p.discountRate * 100).toFixed(2)}%</Badge>
                      <Badge variant="secondary" className="text-[10px]">g {(p.terminalGrowth * 100).toFixed(1)}%</Badge>
                      <Badge variant="secondary" className="text-[10px]">IRC {(p.taxRate * 100).toFixed(1)}%</Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{p.projectType.replace('_', ' ')}</Badge>
                    </div>

                    {/* Cash flow chart */}
                    {chartData.length > 0 && (
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtMoney(v, p.currency)} />
                            <RechartsTooltip formatter={(v: number) => fmtMoney(v, p.currency)} />
                            <ReferenceLine y={0} stroke="currentColor" className="stroke-muted-foreground/40" />
                            <Bar dataKey="cf" radius={[3, 3, 0, 0]}>
                              {chartData.map((d, i) => (
                                <Cell key={i} fill={d.cf >= 0 ? '#10b981' : '#f59e0b'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {p.description && <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-lg font-bold ${accent ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{value}</div>
    </div>
  );
}

function KV({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground"><Icon className="w-2.5 h-2.5" /> {label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
