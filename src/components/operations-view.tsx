'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Factory,
  Package,
  Boxes,
  Coins,
  TrendingUp,
  Globe2,
  Store,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { getOperations } from '@/lib/api';
import { formatEUR } from '@/lib/utils';
import { DataLoadError } from '@/components/data-load-error';
import type { OperationalStatement } from '@/lib/types';
import {
  COLORS,
  costBreakdown,
  productBars,
  materialBars,
  marketMix,
  channelMix,
  summary,
  marginTone,
  type CostKey,
} from '@/components/operations/helpers';
import { useTranslations } from 'next-intl';

// ============================================================
// DEMO FALLBACK — shown only if the live fetch fails or no catalog is seeded.
// A small, self-consistent ceramics-style statement so the view always renders.
// ============================================================
function getDemoStatement(): OperationalStatement {
  return {
    entityCode: 'DEMO',
    revenueTotal: 40_000_000,
    cogs: { materials: 8_170_000, labor: 3_610_000, overhead: 4_220_000, total: 16_000_000 },
    grossProfit: 24_000_000,
    grossMarginPct: 0.6,
    byProduct: [
      { code: 'PRATOS', name: 'Pratos', productType: 'manufactured', volume: 2_000_000, pricePerUnit: 7, unitCost: 2.6, revenue: 14_000_000, cogs: 5_200_000, grossProfit: 8_800_000, grossMarginPct: 0.629 },
      { code: 'TIGELAS', name: 'Tigelas', productType: 'manufactured', volume: 1_600_000, pricePerUnit: 5, unitCost: 1.9, revenue: 8_000_000, cogs: 3_040_000, grossProfit: 4_960_000, grossMarginPct: 0.62 },
      { code: 'CUTELARIA', name: 'Cutelaria (revenda)', productType: 'merchandise', volume: 220_000, pricePerUnit: 15, unitCost: 9, revenue: 3_300_000, cogs: 1_980_000, grossProfit: 1_320_000, grossMarginPct: 0.4 },
    ],
    byMaterial: [
      { code: 'PASTA_GRES', name: 'Pasta de grés', cost: 3_000_000 },
      { code: 'VIDRADOS', name: 'Vidrados', cost: 1_500_000 },
      { code: 'EMBALAGEM', name: 'Embalagem', cost: 490_000 },
    ],
    byMarket: [
      { market: 'PT', revenue: 16_000_000, volume: 2_400_000 },
      { market: 'UE', revenue: 14_000_000, volume: 1_900_000 },
      { market: 'USA', revenue: 7_000_000, volume: 900_000 },
      { market: 'ROW', revenue: 3_000_000, volume: 420_000 },
    ],
    byChannel: [
      { channel: 'Private_Label', revenue: 18_000_000, volume: 2_500_000 },
      { channel: 'Hotelaria', revenue: 10_000_000, volume: 1_400_000 },
      { channel: 'Retalho', revenue: 8_000_000, volume: 1_100_000 },
      { channel: 'E_Commerce', revenue: 4_000_000, volume: 600_000 },
    ],
  };
}

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtUnits = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function OperationsView() {
  const t = useTranslations('operations');
  const [statement, setStatement] = useState<OperationalStatement | null>(null);
  const [entityCodes, setEntityCodes] = useState<string[]>([]);
  const [entityCode, setEntityCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (code?: string) => {
    setLoading(true);
    try {
      const data = await getOperations(code ? { entityCode: code } : undefined);
      setEntityCodes(data.entityCodes);
      if (data.statement) {
        setStatement(data.statement);
        setEntityCode(data.entityCode ?? data.statement.entityCode);
        setLoadError(false);
      } else {
        setStatement(getDemoStatement());
        setLoadError(true);
      }
    } catch {
      setStatement(getDemoStatement());
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !statement) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const s = statement ?? getDemoStatement();
  const sum = summary(s);
  const costData = costBreakdown(s).map((c) => ({ ...c, label: t(`cost.${c.key}` as const) }));
  const products = productBars(s);
  const materials = materialBars(s);
  const markets = marketMix(s);
  const channels = channelMix(s);

  const costLabel = (key: CostKey) => t(`cost.${key}` as const);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Factory className="w-6 h-6 text-signal" /> {t('heading')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
        {entityCodes.length > 0 && (
          <Select value={entityCode} onValueChange={(v) => { setEntityCode(v); load(v); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('selectEntity')} />
            </SelectTrigger>
            <SelectContent>
              {entityCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loadError && <DataLoadError message={t('demoBanner')} />}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard icon={Coins} label={t('kpi.revenue')} value={formatEUR(sum.revenue)} tone="signal" />
        <KpiCard icon={Boxes} label={t('kpi.cogs')} value={formatEUR(sum.cogs)} tone="muted" />
        <KpiCard icon={TrendingUp} label={t('kpi.grossProfit')} value={formatEUR(sum.grossProfit)} tone="gain" />
        <KpiCard icon={Package} label={t('kpi.grossMargin')} value={fmtPct(sum.grossMarginPct)} tone="gain"
          sub={t('kpi.catalogCount', { products: sum.productCount, materials: sum.materialCount })} />
      </div>

      {/* Revenue by product + cost structure */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-signal" />{t('charts.revenueByProduct')}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={products} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, key) => [formatEUR(v), key === 'revenue' ? t('kpi.revenue') : t('kpi.grossProfit')]} />
                <Legend formatter={(val) => (val === 'revenue' ? t('kpi.revenue') : t('kpi.grossProfit'))} />
                <Bar dataKey="revenue" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                <Bar dataKey="grossProfit" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Boxes className="w-4 h-4 text-signal" />{t('charts.costStructure')}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={costData} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {costData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatEUR(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {costData.map((c, i) => (
                <div key={c.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                    {c.label}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">{formatEUR(c.value)} · {fmtPct(c.pct)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market + channel mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MixCard title={t('charts.revenueByMarket')} icon={Globe2} rows={markets} />
        <MixCard title={t('charts.revenueByChannel')} icon={Store} rows={channels} />
      </div>

      {/* Cost by material */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Boxes className="w-4 h-4 text-signal" />{t('charts.costByMaterial')}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(160, materials.length * 38)}>
            <BarChart data={materials} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatEUR(v)} />
              <Bar dataKey="cost" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Product margin table */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-signal" />{t('table.title')}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">{t('table.product')}</th>
                <th className="py-2 px-3 font-medium">{t('table.type')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('table.volume')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('table.price')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('table.unitCost')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('table.revenue')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('table.cogs')}</th>
                <th className="py-2 pl-3 font-medium text-right">{t('table.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const tone = marginTone(p.grossMarginPct);
                const toneClass = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-muted-foreground';
                return (
                  <tr key={p.code} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className="text-[10px]">
                        {p.productType === 'manufactured' ? t('type.manufactured') : t('type.merchandise')}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtUnits(p.volume)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">€{p.pricePerUnit.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">€{p.unitCost.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{formatEUR(p.revenue)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{formatEUR(p.cogs)}</td>
                    <td className={`py-2 pl-3 text-right font-mono tabular-nums font-semibold ${toneClass}`}>{fmtPct(p.grossMarginPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone }: { icon: React.ElementType; label: string; value: string; sub?: string; tone: 'signal' | 'gain' | 'muted' }) {
  const toneClass = tone === 'signal' ? 'text-signal' : tone === 'gain' ? 'text-gain' : 'text-muted-foreground';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <Icon className={`w-4 h-4 ${toneClass}`} />
          </div>
          <p className="text-2xl font-semibold mt-1 font-mono tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MixCard({ title, icon: Icon, rows }: { title: string; icon: React.ElementType; rows: Array<{ key: string; label: string; revenue: number; pct: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-signal" />{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={rows} dataKey="revenue" nameKey="label" cx="50%" cy="50%" outerRadius={75} paddingAngle={2}>
                {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatEUR(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  {r.label}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">{formatEUR(r.revenue)} · {fmtPct(r.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
