'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Target, ArrowUpRight, ArrowDownRight, Loader2, Download, Plus, Search,
  ChevronRight, X, Wallet, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Line, ComposedChart,
} from 'recharts';
import { getBudgetVsActual, getBudgetVariance, saveBudgetEntry } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { BudgetVsActualSummary, BudgetVarianceDetail } from '@/lib/types';
import { formatCompactEUR, formatNumber } from '@/lib/format';
import { DataLoadError } from '@/components/data-load-error';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';

// ============================================================
// DEMO DATA
// ============================================================
const demoSummary: BudgetVsActualSummary = {
  totalBudget: 51900000,
  totalActual: 52480000,
  totalVariance: 580000,
  variancePct: 1.1,
  entityBreakdown: [
    { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', totalBudget: 15000000, totalActual: 15250000, variance: 250000, variancePct: 1.7 },
    { entityCode: 'ES0002', entityName: 'TechNova España S.A.', totalBudget: 12500000, totalActual: 12800000, variance: 300000, variancePct: 2.4 },
    { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', totalBudget: 11000000, totalActual: 10800000, variance: -200000, variancePct: -1.8 },
    { entityCode: 'FR0004', entityName: 'TechNova France SAS', totalBudget: 8400000, totalActual: 8620000, variance: 220000, variancePct: 2.6 },
    { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', totalBudget: 5000000, totalActual: 5010000, variance: 10000, variancePct: 0.2 },
  ],
  categoryBreakdown: [
    { category: 'Revenue', totalBudget: 51900000, totalActual: 53500000, variance: 1600000, variancePct: 3.1 },
    { category: 'COGS', totalBudget: 20760000, totalActual: 21120000, variance: -360000, variancePct: -1.7 },
    { category: 'OPEX', totalBudget: 10380000, totalActual: 10580000, variance: -200000, variancePct: -1.9 },
    { category: 'D&A', totalBudget: 2595000, totalActual: 2640000, variance: -45000, variancePct: -1.7 },
    { category: 'Interest', totalBudget: 1557000, totalActual: 1520000, variance: 37000, variancePct: 2.4 },
    { category: 'Tax', totalBudget: 2595000, totalActual: 2560000, variance: 35000, variancePct: 1.3 },
  ],
};

const demoVarianceData: BudgetVarianceDetail[] = [
  // PT0001
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'REV-001', accountName: 'Product Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 8500000, actualAmount: 8700000, variance: 200000, variancePct: 2.4 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'REV-002', accountName: 'Service Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 4000000, actualAmount: 4050000, variance: 50000, variancePct: 1.3 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'REV-003', accountName: 'IC Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 2500000, actualAmount: 2500000, variance: 0, variancePct: 0 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'COGS-001', accountName: 'Direct Materials', accountType: 'expense', category: 'COGS', budgetAmount: 3200000, actualAmount: 3300000, variance: -100000, variancePct: -3.1 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'COGS-002', accountName: 'Direct Labor', accountType: 'expense', category: 'COGS', budgetAmount: 2000000, actualAmount: 2050000, variance: -50000, variancePct: -2.5 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'OPX-001', accountName: 'Rent & Utilities', accountType: 'expense', category: 'OPEX', budgetAmount: 800000, actualAmount: 820000, variance: -20000, variancePct: -2.5 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'PAY-001', accountName: 'Salaries & Benefits', accountType: 'expense', category: 'OPEX', budgetAmount: 2200000, actualAmount: 2250000, variance: -50000, variancePct: -2.3 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'DEP-001', accountName: 'Depreciation - PPE', accountType: 'expense', category: 'D&A', budgetAmount: 600000, actualAmount: 620000, variance: -20000, variancePct: -3.3 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'INT-001', accountName: 'Interest Expense', accountType: 'expense', category: 'Interest', budgetAmount: 350000, actualAmount: 340000, variance: 10000, variancePct: 2.9 },
  { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', groupCOACode: 'TAX-001', accountName: 'Corporate Tax', accountType: 'expense', category: 'Tax', budgetAmount: 750000, actualAmount: 735000, variance: 15000, variancePct: 2.0 },
  // ES0002
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'REV-001', accountName: 'Product Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 7000000, actualAmount: 7250000, variance: 250000, variancePct: 3.6 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'REV-002', accountName: 'Service Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 3500000, actualAmount: 3550000, variance: 50000, variancePct: 1.4 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'REV-003', accountName: 'IC Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 2000000, actualAmount: 2000000, variance: 0, variancePct: 0 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'COGS-001', accountName: 'Direct Materials', accountType: 'expense', category: 'COGS', budgetAmount: 2800000, actualAmount: 2900000, variance: -100000, variancePct: -3.6 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'COGS-002', accountName: 'Direct Labor', accountType: 'expense', category: 'COGS', budgetAmount: 1700000, actualAmount: 1740000, variance: -40000, variancePct: -2.4 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'OPX-001', accountName: 'Rent & Utilities', accountType: 'expense', category: 'OPEX', budgetAmount: 650000, actualAmount: 670000, variance: -20000, variancePct: -3.1 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'PAY-001', accountName: 'Salaries & Benefits', accountType: 'expense', category: 'OPEX', budgetAmount: 1800000, actualAmount: 1840000, variance: -40000, variancePct: -2.2 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'DEP-001', accountName: 'Depreciation - PPE', accountType: 'expense', category: 'D&A', budgetAmount: 500000, actualAmount: 510000, variance: -10000, variancePct: -2.0 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'INT-001', accountName: 'Interest Expense', accountType: 'expense', category: 'Interest', budgetAmount: 300000, actualAmount: 290000, variance: 10000, variancePct: 3.3 },
  { entityCode: 'ES0002', entityName: 'TechNova España S.A.', groupCOACode: 'TAX-001', accountName: 'Corporate Tax', accountType: 'expense', category: 'Tax', budgetAmount: 625000, actualAmount: 610000, variance: 15000, variancePct: 2.4 },
  // DE0003
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'REV-001', accountName: 'Product Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 6000000, actualAmount: 5800000, variance: -200000, variancePct: -3.3 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'REV-002', accountName: 'Service Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 3500000, actualAmount: 3500000, variance: 0, variancePct: 0 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'REV-003', accountName: 'IC Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 1500000, actualAmount: 1500000, variance: 0, variancePct: 0 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'COGS-001', accountName: 'Direct Materials', accountType: 'expense', category: 'COGS', budgetAmount: 2400000, actualAmount: 2380000, variance: 20000, variancePct: 0.8 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'COGS-002', accountName: 'Direct Labor', accountType: 'expense', category: 'COGS', budgetAmount: 1500000, actualAmount: 1490000, variance: 10000, variancePct: 0.7 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'OPX-001', accountName: 'Rent & Utilities', accountType: 'expense', category: 'OPEX', budgetAmount: 550000, actualAmount: 560000, variance: -10000, variancePct: -1.8 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'PAY-001', accountName: 'Salaries & Benefits', accountType: 'expense', category: 'OPEX', budgetAmount: 1600000, actualAmount: 1620000, variance: -20000, variancePct: -1.3 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'DEP-001', accountName: 'Depreciation - PPE', accountType: 'expense', category: 'D&A', budgetAmount: 450000, actualAmount: 460000, variance: -10000, variancePct: -2.2 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'INT-001', accountName: 'Interest Expense', accountType: 'expense', category: 'Interest', budgetAmount: 280000, actualAmount: 275000, variance: 5000, variancePct: 1.8 },
  { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', groupCOACode: 'TAX-001', accountName: 'Corporate Tax', accountType: 'expense', category: 'Tax', budgetAmount: 550000, actualAmount: 540000, variance: 10000, variancePct: 1.8 },
  // FR0004
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'REV-001', accountName: 'Product Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 4800000, actualAmount: 5000000, variance: 200000, variancePct: 4.2 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'REV-002', accountName: 'Service Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 2400000, actualAmount: 2420000, variance: 20000, variancePct: 0.8 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'COGS-001', accountName: 'Direct Materials', accountType: 'expense', category: 'COGS', budgetAmount: 1900000, actualAmount: 1950000, variance: -50000, variancePct: -2.6 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'COGS-002', accountName: 'Direct Labor', accountType: 'expense', category: 'COGS', budgetAmount: 1200000, actualAmount: 1240000, variance: -40000, variancePct: -3.3 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'OPX-001', accountName: 'Rent & Utilities', accountType: 'expense', category: 'OPEX', budgetAmount: 400000, actualAmount: 410000, variance: -10000, variancePct: -2.5 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'PAY-001', accountName: 'Salaries & Benefits', accountType: 'expense', category: 'OPEX', budgetAmount: 1100000, actualAmount: 1130000, variance: -30000, variancePct: -2.7 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'DEP-001', accountName: 'Depreciation - PPE', accountType: 'expense', category: 'D&A', budgetAmount: 320000, actualAmount: 330000, variance: -10000, variancePct: -3.1 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'INT-001', accountName: 'Interest Expense', accountType: 'expense', category: 'Interest', budgetAmount: 220000, actualAmount: 215000, variance: 5000, variancePct: 2.3 },
  { entityCode: 'FR0004', entityName: 'TechNova France SAS', groupCOACode: 'TAX-001', accountName: 'Corporate Tax', accountType: 'expense', category: 'Tax', budgetAmount: 420000, actualAmount: 410000, variance: 10000, variancePct: 2.4 },
  // UK0005
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'REV-001', accountName: 'Product Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 3000000, actualAmount: 3010000, variance: 10000, variancePct: 0.3 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'REV-002', accountName: 'Service Revenue', accountType: 'revenue', category: 'Revenue', budgetAmount: 1200000, actualAmount: 1200000, variance: 0, variancePct: 0 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'COGS-001', accountName: 'Direct Materials', accountType: 'expense', category: 'COGS', budgetAmount: 900000, actualAmount: 910000, variance: -10000, variancePct: -1.1 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'COGS-002', accountName: 'Direct Labor', accountType: 'expense', category: 'COGS', budgetAmount: 600000, actualAmount: 605000, variance: -5000, variancePct: -0.8 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'OPX-001', accountName: 'Rent & Utilities', accountType: 'expense', category: 'OPEX', budgetAmount: 250000, actualAmount: 255000, variance: -5000, variancePct: -2.0 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'PAY-001', accountName: 'Salaries & Benefits', accountType: 'expense', category: 'OPEX', budgetAmount: 700000, actualAmount: 705000, variance: -5000, variancePct: -0.7 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'DEP-001', accountName: 'Depreciation - PPE', accountType: 'expense', category: 'D&A', budgetAmount: 200000, actualAmount: 205000, variance: -5000, variancePct: -2.5 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'INT-001', accountName: 'Interest Expense', accountType: 'expense', category: 'Interest', budgetAmount: 150000, actualAmount: 148000, variance: 2000, variancePct: 1.3 },
  { entityCode: 'UK0005', entityName: 'TechNova UK Ltd', groupCOACode: 'TAX-001', accountName: 'Corporate Tax', accountType: 'expense', category: 'Tax', budgetAmount: 250000, actualAmount: 248000, variance: 2000, variancePct: 0.8 },
];

// ============================================================
// HELPERS
// ============================================================
function getVarianceColor(pct: number): string {
  if (pct >= 2) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 0) return 'text-emerald-500 dark:text-emerald-400';
  if (pct >= -3) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getVarianceBg(pct: number): string {
  if (pct >= 2) return 'bg-emerald-50 dark:bg-emerald-950/30';
  if (pct >= 0) return 'bg-emerald-50/50 dark:bg-emerald-950/20';
  if (pct >= -3) return 'bg-amber-50/50 dark:bg-amber-950/20';
  return 'bg-red-50/50 dark:bg-red-950/20';
}

function getStatusIcon(pct: number) {
  if (pct >= 0) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (pct >= -3) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function exportCSV(data: BudgetVarianceDetail[], filename: string, headers: string[]) {
  const rows = data.map(d => [
    d.entityCode, d.entityName, d.groupCOACode, d.accountName, d.category,
    d.budgetAmount, d.actualAmount, d.variance, `${d.variancePct.toFixed(1)}%`,
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================================
// CUSTOM TOOLTIP
// ============================================================
function BudgetTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">{formatCompactEUR(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ============================================================
// INLINE BAR CHART
// ============================================================
function InlineBarChart({ budget, actual }: { budget: number; actual: number }) {
  const maxVal = Math.max(Math.abs(budget), Math.abs(actual), 1);
  const budgetWidth = (Math.abs(budget) / maxVal) * 100;
  const actualWidth = (Math.abs(actual) / maxVal) * 100;
  return (
    <div className="w-24 space-y-0.5">
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-teal-400 rounded-full" style={{ width: `${budgetWidth}%` }} />
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${actualWidth}%` }} />
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function BudgetVsActualView() {
  const t = useTranslations('budget');
  const loc = useLocale() as Locale;
  const { selectedPeriod, setSelectedPeriod } = useAppStore();
  const csvHeaders = [t('csv.entityCode'), t('csv.entityName'), t('csv.accountCode'), t('csv.accountName'), t('csv.category'), t('csv.budget'), t('csv.actual'), t('csv.variance'), t('csv.variancePct')];
  const [summary, setSummary] = useState<BudgetVsActualSummary>(demoSummary);
  const [varianceData, setVarianceData] = useState<BudgetVarianceDetail[]>(demoVarianceData);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogEntity, setDialogEntity] = useState('');
  const [dialogAccount, setDialogAccount] = useState('');
  const [dialogAmount, setDialogAmount] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [budgetData, varianceResult] = await Promise.all([
        getBudgetVsActual({ period: selectedPeriod }),
        getBudgetVariance({ period: selectedPeriod }),
      ]);
      if (budgetData?.summary?.totalBudget > 0) {
        setSummary(budgetData.summary);
      }
      if (varianceResult?.varianceData?.length > 0) {
        setVarianceData(varianceResult.varianceData);
      }
    } catch (err) {
      console.error('Failed to load budget data', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered entity breakdown
  const filteredEntities = summary.entityBreakdown.filter((e) =>
    e.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.entityCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Selected entity drill-down
  const selectedEntityDetails = selectedEntity
    ? varianceData.filter((d) => d.entityCode === selectedEntity)
    : [];

  // Chart data from category breakdown
  const chartData = summary.categoryBreakdown.map((c) => ({
    category: t(`categories.${c.category}`),
    Budget: c.totalBudget,
    Actual: c.totalActual,
    VariancePct: c.variancePct,
  }));

  // Handle save budget entry
  const handleSaveBudget = async () => {
    if (!dialogEntity || !dialogAccount || !dialogAmount) return;
    setSaving(true);
    try {
      await saveBudgetEntry({
        entityCode: dialogEntity,
        period: selectedPeriod,
        entries: [{ groupCOACode: dialogAccount, budgetAmount: parseFloat(dialogAmount) }],
      });
      setDialogOpen(false);
      setDialogEntity('');
      setDialogAccount('');
      setDialogAmount('');
      loadData();
    } catch (err) {
      console.error('Failed to save budget entry', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600" />
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(varianceData, `budget-vs-actual-${selectedPeriod}.csv`, csvHeaders)}
          >
            <Download className="w-4 h-4 mr-1" /> {t('export')}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-1" /> {t('addBudget')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('dialog.title')}</DialogTitle>
                <DialogDescription>{t('dialog.desc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t('dialog.entity')}</label>
                  <Select value={dialogEntity} onValueChange={setDialogEntity}>
                    <SelectTrigger><SelectValue placeholder={t('dialog.selectEntity')} /></SelectTrigger>
                    <SelectContent>
                      {summary.entityBreakdown.map((e) => (
                        <SelectItem key={e.entityCode} value={e.entityCode}>{e.entityName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t('dialog.accountCode')}</label>
                  <Input value={dialogAccount} onChange={(e) => setDialogAccount(e.target.value)} placeholder="e.g., REV-001" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{t('dialog.budgetAmount')}</label>
                  <Input type="number" value={dialogAmount} onChange={(e) => setDialogAmount(e.target.value)} placeholder="0" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('dialog.cancel')}</Button>
                <Button onClick={handleSaveBudget} disabled={saving || !dialogEntity || !dialogAccount || !dialogAmount} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  {t('dialog.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['2024-12', '2024-11', '2024-10', '2024-09', '2024-08', '2024-07'].map((p) => (
                <SelectItem key={p} value={p}>
                  {new Date(p + '-01').toLocaleDateString(dateLocale(loc), { year: 'numeric', month: 'short' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: t('cards.totalBudget'), value: summary.totalBudget, icon: Wallet, color: 'from-teal-50/80 to-white dark:from-teal-950/30 dark:to-slate-900', iconColor: 'text-teal-600 dark:text-teal-400', trend: 3.1, trendLabel: t('trendLabels.priorPeriod') },
          { title: t('cards.totalActual'), value: summary.totalActual, icon: Target, color: 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900', iconColor: 'text-emerald-600 dark:text-emerald-400', trend: 1.1, trendLabel: t('trendLabels.vsBudget') },
          { title: t('cards.totalVariance'), value: summary.totalVariance, icon: summary.totalVariance >= 0 ? TrendingUp : TrendingDown, color: `${summary.totalVariance >= 0 ? 'from-emerald-50/80 to-white dark:from-emerald-950/30' : 'from-red-50/80 to-white dark:from-red-950/30'} dark:to-slate-900`, iconColor: summary.totalVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400', trend: summary.variancePct, trendLabel: t('trendLabels.variancePct') },
          { title: t('cards.variancePct'), value: summary.variancePct, icon: summary.variancePct >= 0 ? ArrowUpRight : ArrowDownRight, color: `${summary.variancePct >= 0 ? 'from-emerald-50/80 to-white dark:from-emerald-950/30' : 'from-amber-50/80 to-white dark:from-amber-950/20'} dark:to-slate-900`, iconColor: summary.variancePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400', isPercent: true, trend: null, trendLabel: '' },
        ].map((card, i) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className={`shadow-sm border border-slate-200/60 dark:border-slate-700/40 bg-gradient-to-br ${card.color} hover:shadow-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{card.title}</p>
                    {loading ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      <p className={`text-2xl font-bold ${card.isPercent ? (card.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400') : ''}`}>
                        {card.isPercent ? `${card.value >= 0 ? '+' : ''}${card.value.toFixed(1)}%` : formatCompactEUR(card.value)}
                      </p>
                    )}
                    {!card.isPercent && card.trend !== null && (
                      <p className={`text-xs flex items-center gap-0.5 mt-1 ${card.trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {card.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {card.trend >= 0 ? '+' : ''}{card.trend}% {card.trendLabel}
                      </p>
                    )}
                  </div>
                  <div className={`p-2 rounded-lg bg-white/50 dark:bg-slate-800/50 ${card.iconColor}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Entity Budget Overview */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t('overviewTitle')}</CardTitle>
                <CardDescription>{t('overviewDesc')}</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('searchEntities')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <Table className="premium-table">
                  <TableHeader>
                    <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                      <TableHead>{t('entityHeaders.entity')}</TableHead>
                      <TableHead className="text-right">{t('entityHeaders.budget')}</TableHead>
                      <TableHead className="text-right">{t('entityHeaders.actual')}</TableHead>
                      <TableHead className="text-right">{t('entityHeaders.varianceEur')}</TableHead>
                      <TableHead className="text-right">{t('entityHeaders.variancePct')}</TableHead>
                      <TableHead className="text-center">{t('entityHeaders.status')}</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntities.map((entity, index) => {
                      const isOverBudget = entity.variance < 0;
                      return (
                        <TableRow
                          key={entity.entityCode}
                          className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''} ${selectedEntity === entity.entityCode ? 'bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30' : ''}`}
                          onClick={() => setSelectedEntity(selectedEntity === entity.entityCode ? null : entity.entityCode)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{entity.entityName}</p>
                              <p className="text-xs text-muted-foreground">{entity.entityCode}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatCompactEUR(entity.totalBudget)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatCompactEUR(entity.totalActual)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            <span className="flex items-center justify-end gap-1">
                              {isOverBudget ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              {isOverBudget ? '-' : '+'}{formatCompactEUR(Math.abs(entity.variance))}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                              entity.variancePct >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {entity.variancePct >= 0 ? '+' : ''}{entity.variancePct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{getStatusIcon(entity.variancePct)}</TableCell>
                          <TableCell>
                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedEntity === entity.entityCode ? 'rotate-90' : ''}`} />
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

      {/* Variance Analysis Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <CardTitle className="text-base">{t('chartTitle')}</CardTitle>
            <CardDescription>{t('chartDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="budgetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis yAxisId="amount" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactEUR(v)} stroke="var(--color-muted-foreground)" />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} stroke="var(--color-muted-foreground)" domain={[-10, 10]} />
                  <Tooltip content={<BudgetTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="pct" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Bar yAxisId="amount" dataKey="Budget" name={t('budgetSeries')} fill="url(#budgetGrad)" radius={[3, 3, 0, 0]} barSize={24} />
                  <Bar yAxisId="amount" dataKey="Actual" name={t('actualSeries')} fill="url(#actualGrad)" radius={[3, 3, 0, 0]} barSize={24} />
                  <Line yAxisId="pct" dataKey="VariancePct" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} name={t('variancePctSeries')} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Drill-Down Detail */}
      <AnimatePresence>
        {selectedEntity && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="shadow-sm border-emerald-200 dark:border-emerald-800/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-600" />
                      {t('accountDetail', { name: filteredEntities.find(e => e.entityCode === selectedEntity)?.entityName || selectedEntity })}
                    </CardTitle>
                    <CardDescription>{t('accountDetailDesc')}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportCSV(selectedEntityDetails, `budget-detail-${selectedEntity}-${selectedPeriod}.csv`, csvHeaders)}
                    >
                      <Download className="w-4 h-4 mr-1" /> {t('csvBtn')}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedEntity(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto">
                  <Table className="premium-table">
                    <TableHeader>
                      <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                        <TableHead>{t('detailHeaders.accountCode')}</TableHead>
                        <TableHead>{t('detailHeaders.accountName')}</TableHead>
                        <TableHead>{t('detailHeaders.category')}</TableHead>
                        <TableHead className="text-right">{t('detailHeaders.budgetEur')}</TableHead>
                        <TableHead className="text-right">{t('detailHeaders.actualEur')}</TableHead>
                        <TableHead className="text-right">{t('detailHeaders.varianceEur')}</TableHead>
                        <TableHead className="text-right">{t('detailHeaders.variancePct')}</TableHead>
                        <TableHead className="text-center">{t('detailHeaders.budgetVsActual')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEntityDetails.map((row, index) => {
                        const isFavorable = row.variance >= 0;
                        return (
                          <TableRow
                            key={`${row.groupCOACode}-${index}`}
                            className={`${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''} ${getVarianceBg(row.variancePct)}`}
                          >
                            <TableCell className="font-mono text-xs font-medium">{row.groupCOACode}</TableCell>
                            <TableCell className="font-medium text-sm">{row.accountName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{t(`categories.${row.category}`)}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(row.budgetAmount)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(row.actualAmount)}</TableCell>
                            <TableCell className={`text-right tabular-nums font-medium ${getVarianceColor(row.variancePct)}`}>
                              <span className="flex items-center justify-end gap-1">
                                {isFavorable ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {isFavorable ? '+' : '-'}{formatNumber(Math.abs(row.variance))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                                row.variancePct >= 0
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : row.variancePct >= -3
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {row.variancePct >= 0 ? '+' : ''}{row.variancePct.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <InlineBarChart budget={row.budgetAmount} actual={row.actualAmount} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Drill-down Summary */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {(() => {
                    const totalBudget = selectedEntityDetails.reduce((s, d) => s + d.budgetAmount, 0);
                    const totalActual = selectedEntityDetails.reduce((s, d) => s + d.actualAmount, 0);
                    const totalVariance = totalActual - totalBudget;
                    const favorableCount = selectedEntityDetails.filter(d => d.variance >= 0).length;
                    return (
                      <>
                        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground">{t('favorable')}</p>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{favorableCount}/{selectedEntityDetails.length}</p>
                        </div>
                        <div className="bg-teal-50/80 dark:bg-teal-950/30 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground">{t('totalBudgetLabel')}</p>
                          <p className="text-lg font-bold text-teal-600 dark:text-teal-400">{formatCompactEUR(totalBudget)}</p>
                        </div>
                        <div className={`${totalVariance >= 0 ? 'bg-emerald-50/80 dark:bg-emerald-950/30' : 'bg-amber-50/80 dark:bg-amber-950/30'} rounded-lg p-3 text-center`}>
                          <p className="text-xs text-muted-foreground">{t('netVariance')}</p>
                          <p className={`text-lg font-bold ${totalVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {totalVariance >= 0 ? '+' : '-'}{formatCompactEUR(Math.abs(totalVariance))}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
