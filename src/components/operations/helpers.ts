// Pure, dependency-free helpers for the Operations view: chart-data builders and
// classifiers over an OperationalStatement. Extracted so operations-view.tsx is
// JSX/wiring only and this logic is independently testable (helpers.test.ts).
//
// Helpers return stable `key`s (not display strings) so the component can attach
// i18n labels; humanizeChannel is the one cosmetic transform of an enum value.
import type { OperationalStatement } from '@/lib/types';

// Shared recharts palette (mirrors dashboard COLORS / --chart-1..5).
export const COLORS = ['#E8A33D', '#3E8E9E', '#2E9E6B', '#7C8AA0', '#C9606F'];

// Channel enum 'Private_Label' → 'Private Label' (markets stay as ISO-ish codes).
export function humanizeChannel(channel: string): string {
  return channel.replace(/_/g, ' ');
}

const pctOf = (part: number, whole: number): number => (whole !== 0 ? part / whole : 0);

export type CostKey = 'materials' | 'labor' | 'overhead';

export interface CostSlice {
  key: CostKey;
  value: number;
  pct: number; // share of total COGS, 0..1
}

// Cost of sales split into its three drivers (MP / MOD / GGF), each with its
// share of total COGS. Order is stable: materials, labor, overhead.
export function costBreakdown(s: OperationalStatement): CostSlice[] {
  const total = s.cogs.total;
  return [
    { key: 'materials', value: s.cogs.materials, pct: pctOf(s.cogs.materials, total) },
    { key: 'labor', value: s.cogs.labor, pct: pctOf(s.cogs.labor, total) },
    { key: 'overhead', value: s.cogs.overhead, pct: pctOf(s.cogs.overhead, total) },
  ];
}

export interface ProductBar {
  code: string;
  name: string;
  productType: 'manufactured' | 'merchandise';
  volume: number;
  pricePerUnit: number;
  unitCost: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

// Products as bars, highest revenue first (recharts renders top-to-bottom).
export function productBars(s: OperationalStatement): ProductBar[] {
  return s.byProduct
    .map((p) => ({
      code: p.code,
      name: p.name,
      productType: p.productType,
      volume: p.volume,
      pricePerUnit: p.pricePerUnit,
      unitCost: p.unitCost,
      revenue: p.revenue,
      cogs: p.cogs,
      grossProfit: p.grossProfit,
      grossMarginPct: p.grossMarginPct,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface MaterialBar {
  code: string;
  name: string;
  cost: number;
  pct: number; // share of materials cost, 0..1
}

// Raw materials by total consumed cost, highest first.
export function materialBars(s: OperationalStatement): MaterialBar[] {
  const total = s.byMaterial.reduce((acc, m) => acc + m.cost, 0);
  return s.byMaterial
    .map((m) => ({ code: m.code, name: m.name, cost: m.cost, pct: pctOf(m.cost, total) }))
    .sort((a, b) => b.cost - a.cost);
}

export interface MixSlice {
  key: string;   // raw market/channel key
  label: string; // display label (humanized for channels)
  revenue: number;
  volume: number;
  pct: number;   // share of total revenue, 0..1
}

export function marketMix(s: OperationalStatement): MixSlice[] {
  return s.byMarket
    .map((m) => ({ key: m.market, label: m.market, revenue: m.revenue, volume: m.volume, pct: pctOf(m.revenue, s.revenueTotal) }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function channelMix(s: OperationalStatement): MixSlice[] {
  return s.byChannel
    .map((c) => ({ key: c.channel, label: humanizeChannel(c.channel), revenue: c.revenue, volume: c.volume, pct: pctOf(c.revenue, s.revenueTotal) }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface OperationsSummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  productCount: number;
  manufacturedCount: number;
  merchandiseCount: number;
  materialCount: number;
}

export function summary(s: OperationalStatement): OperationsSummary {
  return {
    revenue: s.revenueTotal,
    cogs: s.cogs.total,
    grossProfit: s.grossProfit,
    grossMarginPct: s.grossMarginPct,
    productCount: s.byProduct.length,
    manufacturedCount: s.byProduct.filter((p) => p.productType === 'manufactured').length,
    merchandiseCount: s.byProduct.filter((p) => p.productType === 'merchandise').length,
    materialCount: s.byMaterial.length,
  };
}

// Gross-margin colour band for the product table (pct is 0..1).
export type MarginTone = 'gain' | 'neutral' | 'loss';
export function marginTone(pct: number): MarginTone {
  if (pct >= 0.4) return 'gain';
  if (pct < 0.2) return 'loss';
  return 'neutral';
}
