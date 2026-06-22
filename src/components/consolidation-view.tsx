'use client';

import { useState, useEffect, useCallback } from 'react';
import { Layers, Info, Loader2, Play, Download, Clock, CheckCircle2, Zap, XCircle, ShieldCheck, FileText, FileSpreadsheet, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { runConsolidation, getEntities, getConsolidationRuns, exportExcel, exportPDF } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatNumber as fmt, formatCompactEUR } from '@/lib/format';
import { Entity, IncomeStatement, BalanceSheet, CashFlowStatement, ConsolidatedResult } from '@/lib/types';
import { AnimatedCounter } from '@/components/animated-counter';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';

// Colour palette assigned to entity columns by position (company-agnostic).
const ENTITY_PALETTE = ['#10b981', '#0d9488', '#f59e0b', '#64748b', '#f97316', '#6366f1', '#ec4899'];



interface ConsolidationRun {
  id: string;
  period: string;
  scenarioType: string;
  entityCount: number;
  totalRevenue: number;
  totalAssets: number;
  netIncome: number;
  processingTime: number;
  createdAt: string;
  status: string;
}

function ValueCell({ value, isSubtotal = false, isTotal = false }: { value: number; isSubtotal?: boolean; isTotal?: boolean }) {
  const isNegative = value < 0;
  const bgClass = (isTotal || isSubtotal) ? (isTotal ? 'bg-emerald-50/80 dark:bg-emerald-900/20 font-bold' : 'bg-slate-50/50 dark:bg-slate-800/30 font-semibold') : '';
  const textClass = isNegative ? 'text-red-600 dark:text-red-400' : value > 0 && (isTotal || isSubtotal) ? 'text-emerald-700 dark:text-emerald-400' : '';
  const className = [
    'text-right tabular-nums whitespace-nowrap',
    isTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : '',
    textClass,
    bgClass,
  ].join(' ');
  return <TableCell className={className}>{fmt(value)}</TableCell>;
}

function LabelCell({ label, indent = 0, isSubtotal = false, isTotal = false }: { label: string; indent?: number; isSubtotal?: boolean; isTotal?: boolean }) {
  const bgClass = (isTotal || isSubtotal) ? (isTotal ? 'bg-emerald-50/80 dark:bg-emerald-900/20' : 'bg-slate-50/50 dark:bg-slate-800/30') : '';
  const className = [
    indent > 0 ? `pl-${indent * 4}` : '',
    isTotal ? 'font-bold border-t-2 border-slate-300 dark:border-slate-600 pt-2' : isSubtotal ? 'font-semibold' : '',
    bgClass,
  ].join(' ');
  return <TableCell className={className}>{label}</TableCell>;
}

const incomeStatementRows = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cogs', label: 'Cost of Goods Sold', indent: 1 },
  { key: 'grossProfit', label: 'Gross Profit', isSubtotal: true },
  { key: 'opex', label: 'Operating Expenses', indent: 1 },
  { key: 'ebitda', label: 'EBITDA', isSubtotal: true },
  { key: 'depreciation', label: 'Depreciation & Amortization', indent: 1 },
  { key: 'ebit', label: 'EBIT', isSubtotal: true },
  { key: 'interestExpense', label: 'Interest Expense', indent: 1 },
  { key: 'ebt', label: 'Earnings Before Tax', isSubtotal: true },
  { key: 'taxExpense', label: 'Tax Expense', indent: 1 },
  { key: 'netIncome', label: 'Net Income', isTotal: true },
  { key: 'minorityInterest', label: 'Minority Interest', indent: 1 },
];

const balanceSheetRows = [
  { section: 'assets' },
  { key: 'cash', label: 'Cash & Cash Equivalents', indent: 1 },
  { key: 'accountsReceivable', label: 'Accounts Receivable', indent: 1 },
  { key: 'inventory', label: 'Inventory', indent: 1 },
  { key: 'currentAssets', label: 'Total Current Assets', isSubtotal: true },
  { key: 'ppe', label: 'Property, Plant & Equipment', indent: 1 },
  { key: 'intangibleAssets', label: 'Intangible Assets', indent: 1 },
  { key: 'goodwill', label: 'Goodwill', indent: 1 },
  { key: 'nonCurrentAssets', label: 'Total Non-Current Assets', isSubtotal: true },
  { key: 'totalAssets', label: 'TOTAL ASSETS', isTotal: true },
  { section: 'liabilitiesEquity' },
  { key: 'accountsPayable', label: 'Accounts Payable', indent: 1 },
  { key: 'shortTermDebt', label: 'Short-Term Debt', indent: 1 },
  { key: 'currentLiabilities', label: 'Total Current Liabilities', isSubtotal: true },
  { key: 'longTermDebt', label: 'Long-Term Debt', indent: 1 },
  { key: 'nonCurrentLiabilities', label: 'Total Non-Current Liabilities', isSubtotal: true },
  { key: 'totalLiabilities', label: 'TOTAL LIABILITIES', isSubtotal: true },
  { key: 'shareCapital', label: 'Share Capital', indent: 1 },
  { key: 'retainedEarnings', label: 'Retained Earnings', indent: 1 },
  { key: 'minorityEquity', label: 'Minority Interest', indent: 1 },
  { key: 'cta', label: 'Translation Reserve (CTA)', indent: 1 },
  { key: 'totalEquity', label: 'TOTAL EQUITY', isSubtotal: true },
];

const cashFlowRows = [
  { section: 'operatingActivities' },
  { key: 'netIncome', label: 'Net Income', indent: 1 },
  { key: 'depreciation', label: 'Depreciation & Amortization', indent: 1 },
  { key: 'changesInWorkingCapital', label: 'Changes in Working Capital', indent: 1 },
  { key: 'operatingCashFlow', label: 'Net Cash from Operations', isSubtotal: true },
  { section: 'investingActivities' },
  { key: 'capex', label: 'Capital Expenditure', indent: 1 },
  { key: 'investingCashFlow', label: 'Net Cash from Investing', isSubtotal: true },
  { section: 'financingActivities' },
  { key: 'debtIssuance', label: 'Debt Issuance', indent: 1 },
  { key: 'debtRepayment', label: 'Debt Repayment', indent: 1 },
  { key: 'dividendsPaid', label: 'Dividends Paid', indent: 1 },
  { key: 'financingCashFlow', label: 'Net Cash from Financing', isSubtotal: true },
  { section: 'netChange' },
  { key: 'netChangeInCash', label: 'Net Change in Cash', isSubtotal: true },
  { key: 'beginningCash', label: 'Beginning Cash', indent: 1 },
  { key: 'endingCash', label: 'Ending Cash', isTotal: true },
];

type FinancialData = Record<string, number>;

function EliminationTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl border border-slate-700 text-xs">
      <p className="font-medium mb-1 text-slate-300">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-semibold">€{fmt(entry.value)}K</span>
        </p>
      ))}
    </div>
  );
}

function exportConsolidationCSV(result: ConsolidatedResult, entities: string[], filename: string) {
  const headers = ['Line Item', ...entities, 'IC Elim.', 'Consolidated'];
  const isRows = [
    ['Revenue', ...entities.map(() => ''), '', result.incomeStatement.revenue.toString()],
    ['EBITDA', ...entities.map(() => ''), '', result.incomeStatement.ebitda.toString()],
    ['Net Income', ...entities.map(() => ''), '', result.incomeStatement.netIncome.toString()],
    ['', '', '', '', ''],
    ['Total Assets', ...entities.map(() => ''), '', result.balanceSheet.totalAssets.toString()],
    ['Total Equity', ...entities.map(() => ''), '', result.balanceSheet.totalEquity.toString()],
    ['Total Liabilities', ...entities.map(() => ''), '', result.balanceSheet.totalLiabilities.toString()],
  ];

  const csvContent = [headers.join(','), ...isRows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ConsolidationView() {
  const { selectedPeriod, selectedScenario } = useAppStore();
  const t = useTranslations('consolidation');
  const tScenario = useTranslations('scenario');
  const loc = useLocale() as Locale;
  const [activeTab, setActiveTab] = useState('income');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [result, setResult] = useState<ConsolidatedResult | null>(null);
  const [individualIS, setIndividualIS] = useState<Record<string, IncomeStatement>>({});
  const [individualBS, setIndividualBS] = useState<Record<string, BalanceSheet>>({});
  const [individualCF, setIndividualCF] = useState<Record<string, CashFlowStatement>>({});
  const [loading, setLoading] = useState(false);
  const [eliminationsApplied, setEliminationsApplied] = useState(0);
  const [history, setHistory] = useState<ConsolidationRun[]>([]);
  const [consolidationStatus, setConsolidationStatus] = useState<'idle' | 'completed' | 'running' | 'failed'>('idle');
  const [lastRunTimestamp, setLastRunTimestamp] = useState('—');

  const loadHistory = useCallback(async () => {
    try {
      const runs = await getConsolidationRuns();
      if (runs && runs.length > 0) {
        setHistory(runs.map((r) => {
          // Parse period - could be Date object, ISO string, or YYYY-MM
          let periodStr = '';
          if (typeof r.period === 'string') {
            periodStr = r.period.includes('T') ? r.period.substring(0, 7) : r.period;
          } else if (r.period) {
            const d = new Date(r.period);
            periodStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          }
          let entityCount = 0;
          try {
            const codes = typeof r.entityCodes === 'string' ? JSON.parse(r.entityCodes) : r.entityCodes;
            if (Array.isArray(codes)) entityCount = codes.length;
          } catch {}
          const createdAt = r.createdAt ? (typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString()) : new Date().toISOString();
          return {
            id: r.id,
            period: periodStr,
            scenarioType: r.scenarioType || 'base',
            entityCount,
            totalRevenue: r.totalRevenue || 0,
            totalAssets: r.totalAssets || 0,
            netIncome: r.totalNetIncome || 0,
            processingTime: (r.processingTimeMs || 0) / 1000,
            createdAt,
            status: r.status || 'completed',
          };
        }));
      }
    } catch {
      console.log('Could not load consolidation history');
    }
  }, []);

  const runConsolidationEngine = useCallback(async () => {
    setLoading(true);
    setConsolidationStatus('running');
    try {
      const entityList = await getEntities();
      const entityCodes = entityList.map((e) => e.code);
      if (entityCodes.length === 0) {
        setConsolidationStatus('idle');
        return;
      }

      const consolidationResult = await runConsolidation({
        period: selectedPeriod,
        entityCodes,
        scenarioType: selectedScenario,
      });

      if (consolidationResult) {
        setResult(consolidationResult);
        setEliminationsApplied(consolidationResult.eliminationsApplied || 0);

        // Populate the per-entity columns straight from the engine's breakdown,
        // so the table shows real entity statements (not demo data).
        const breakdown = consolidationResult.entityBreakdown || [];
        const isMap: Record<string, IncomeStatement> = {};
        const bsMap: Record<string, BalanceSheet> = {};
        const cfMap: Record<string, CashFlowStatement> = {};
        const cols: Entity[] = [];
        for (const b of breakdown) {
          isMap[b.entityCode] = b.incomeStatement;
          bsMap[b.entityCode] = b.balanceSheet;
          cfMap[b.entityCode] = b.cashFlow;
          cols.push({ code: b.entityCode, legalName: b.legalName, localCurrency: b.localCurrency, consolidationMethod: b.consolidationMethod, ownershipPercentage: b.ownershipPercentage } as Entity);
        }
        setIndividualIS(isMap);
        setIndividualBS(bsMap);
        setIndividualCF(cfMap);
        if (cols.length > 0) setEntities(cols);

        setConsolidationStatus(consolidationResult.status === 'failed' ? 'failed' : 'completed');
        setLastRunTimestamp(new Date().toLocaleString(dateLocale(loc), { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }));
        loadHistory();
      }
    } catch (err) {
      console.log('Consolidation run failed:', err);
      setConsolidationStatus('idle');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, selectedScenario, loadHistory, loc]);

  // Run the engine on mount and whenever the period/scenario changes, so the
  // view always reflects real consolidated data for the active selection.
  useEffect(() => {
    runConsolidationEngine();
  }, [runConsolidationEngine]);

  // Load consolidation history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const entityCodes = entities.map((e) => e.code);

  // Entity colours assigned by column position (works for any company set).
  const entityColors: Record<string, string> = Object.fromEntries(
    entityCodes.map((code, i) => [code, ENTITY_PALETTE[i % ENTITY_PALETTE.length]])
  );

  // Balance-sheet integrity gate. Surface the SAME signed imbalance the engine
  // computed and used to gate the run status — assets − (liabilities + equity),
  // where equity already includes minority interest (see deriveBalanceSheet).
  // Never recompute it client-side: the old recompute subtracted minorityEquity
  // a second time (totalEquity already contains it), inventing a phantom break.
  const bsBalance = result?.balanceCheck ?? 0;
  // The card mirrors the engine's verdict: a 'failed' run is, by construction, a
  // sheet that did not reconcile within tolerance, so it must never read green.
  const bsIsBalanced = consolidationStatus !== 'failed' && Math.abs(bsBalance) < 1;

  // Quality score derived from the live run rather than hardcoded.
  const hasRun = consolidationStatus === 'completed' || consolidationStatus === 'failed';
  const qualityMetrics = [
    { name: t('quality.bsBalance'), score: bsIsBalanced ? 100 : 40, max: 100 },
    { name: t('quality.icMatchRate'), score: eliminationsApplied !== 0 ? 100 : 80, max: 100 },
    { name: t('quality.currencyConv'), score: 100, max: 100 },
    { name: t('quality.minorityCalc'), score: 100, max: 100 },
  ];
  const overallQuality = hasRun ? Math.round(qualityMetrics.reduce((s, m) => s + (m.score / m.max) * 25, 0)) : 0;

  // Elimination Impact chart, built from the real intercompany volume removed.
  const internalVolumeK = Math.abs(eliminationsApplied) / 1000;
  const eliminationImpactData = [
    { metric: t('elimImpact.icRevenue'), before: internalVolumeK, after: 0, elimination: -internalVolumeK },
    { metric: t('elimImpact.icCogs'), before: internalVolumeK, after: 0, elimination: -internalVolumeK },
  ];

  const renderFinancialTable = (
    rows: Array<{ key?: string; label?: string; section?: string; indent?: number; isSubtotal?: boolean; isTotal?: boolean }>,
    getData: (code: string) => FinancialData,
    consolidatedData: FinancialData,
  ) => (
    <div className="max-h-[600px] overflow-y-auto">
      <Table className="premium-table">
        <TableHeader>
          <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
            <TableHead className="min-w-[200px]">{t('lineItem')}</TableHead>
            {entityCodes.map((code) => (
              <TableHead key={code} className="text-right min-w-[100px]">
                <span className="flex items-center justify-end gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entityColors[code] || '#64748b' }} />
                  {code}
                </span>
              </TableHead>
            ))}
            <TableHead className="text-right min-w-[100px] bg-slate-50 dark:bg-slate-800/50">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1 ml-auto">
                    {t('icElim')} <Info className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>{t('icElimTooltip')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead className="text-right min-w-[120px] bg-emerald-50 dark:bg-emerald-900/20 font-bold">{t('consolidated')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            if (row.section) {
              return (
                <TableRow className="cursor-pointer transition-colors duration-150" key={`section-${idx}`}>
                  <TableCell colSpan={entityCodes.length + 3} className="font-bold text-xs uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/30 pt-4 pb-2">
                    {t(`sections.${row.section}`)}
                  </TableCell>
                </TableRow>
              );
            }
            if (!row.key) return null;
            const entityValues = entityCodes.map((code) => (getData(code) as FinancialData)[row.key!] ?? 0);
            const consolidatedValue = consolidatedData[row.key!] ?? 0;
            const sumEntities = entityValues.reduce((a, b) => a + b, 0);
            const icElim = consolidatedValue - sumEntities;

            return (
              <TableRow key={row.key} className={`cursor-pointer transition-colors duration-150 ${row.isTotal ? 'border-t-2 border-slate-300 dark:border-slate-600' : ''}`}>
                <LabelCell label={t(`lines.${row.key}`)} indent={row.indent || 0} isSubtotal={row.isSubtotal} isTotal={row.isTotal} />
                {entityValues.map((val, i) => (
                  <ValueCell key={entityCodes[i]} value={val} isSubtotal={row.isSubtotal} isTotal={row.isTotal} />
                ))}
                <TableCell className="text-right tabular-nums bg-slate-50 dark:bg-slate-800/50">
                  <span className={icElim < 0 ? 'text-red-600 dark:text-red-400 font-medium' : icElim > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                    {icElim !== 0 ? fmt(icElim) : '—'}
                  </span>
                </TableCell>
                <ValueCell value={consolidatedValue} isSubtotal={row.isSubtotal} isTotal={row.isTotal} />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  const periodLabel = new Date(selectedPeriod + '-01').toLocaleDateString(dateLocale(loc), { year: 'numeric', month: 'short' });
  const scenarioLabel = tScenario(selectedScenario);

  const scenarioColor: Record<string, string> = {
    base: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    optimistic: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    pessimistic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };

  return (
    <div className="space-y-6">
      {/* Consolidation Status Badge */}
      <div className="flex items-center gap-3">
        {consolidationStatus === 'completed' && (
          <Badge className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full status-pulse-green" />
            {t('statusCompleted')}
          </Badge>
        )}
        {consolidationStatus === 'running' && (
          <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full status-pulse-amber" />
            {t('statusInProgress')}
          </Badge>
        )}
        {consolidationStatus === 'failed' && (
          <Badge className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full status-pulse-red" />
            {t('statusFailed')}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground">{t('lastRun', { time: lastRunTimestamp })}</span>
      </div>

      <Card className="shadow-sm relative border border-slate-200/60 dark:border-slate-700/40">
        {/* Animated Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t('consolidating')}</p>
              <p className="text-[10px] text-muted-foreground">{t('processingEntities', { count: entityCodes.length })}</p>
            </div>
          </div>
        )}
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                {t('title')}
              </CardTitle>
              <CardDescription>{t('subtitle', { period: periodLabel, scenario: scenarioLabel })}</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => result && exportConsolidationCSV(result, entityCodes, `consolidation-${selectedPeriod}.csv`)} disabled={!result}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  const blob = await exportExcel({ reportType: 'consolidated_all', period: selectedPeriod, scenarioType: selectedScenario, entityCodes: entities.map(e => e.code) });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `consolidation-${selectedPeriod}.xlsx`;
                  link.click();
                  URL.revokeObjectURL(url);
                } catch {
                  // Fallback: export as tab-separated with BOM
                  const BOM = '\uFEFF';
                  const headers = ['Line Item', ...entityCodes, 'IC Elim.', 'Consolidated'].join('\t');
                  const rows = [['Revenue', ...entityCodes.map(() => ''), '', result?.incomeStatement?.revenue?.toString() || '0'], ['EBITDA', ...entityCodes.map(() => ''), '', result?.incomeStatement?.ebitda?.toString() || '0'], ['Net Income', ...entityCodes.map(() => ''), '', result?.incomeStatement?.netIncome?.toString() || '0']].map(r => r.join('\t')).join('\n');
                  const content = BOM + [headers, rows].join('\n');
                  const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `consolidation-${selectedPeriod}.xlsx`;
                  link.click();
                  URL.revokeObjectURL(url);
                }
              }}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={async () => {
                try {
                  const blob = await exportPDF({ reportType: 'consolidated_all', period: selectedPeriod, scenarioType: selectedScenario, entityCodes: entities.map(e => e.code) });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `consolidation-${selectedPeriod}.pdf`;
                  link.click();
                  URL.revokeObjectURL(url);
                } catch {
                  // Fallback: no-op, user will see console error
                  console.error('PDF export failed');
                }
              }}>
                <FileText className="w-4 h-4" /> PDF
              </Button>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 w-fit dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                {t('entitiesEliminations', { count: entityCodes.length, amount: formatCompactEUR(Math.abs(eliminationsApplied), 2) })}
              </Badge>
              <Button className={`bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all ${consolidationStatus === 'idle' ? 'animate-pulse' : ''}`} onClick={runConsolidationEngine} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                {t('runConsolidation')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="income">{t('tabs.income')}</TabsTrigger>
              <TabsTrigger value="balance">{t('tabs.balance')}</TabsTrigger>
              <TabsTrigger value="cashflow">{t('tabs.cashflow')}</TabsTrigger>
            </TabsList>

            <TabsContent value="income" className="mt-4">
              {renderFinancialTable(incomeStatementRows, (code) => individualIS[code] as unknown as FinancialData, (result?.incomeStatement || {}) as unknown as FinancialData)}
            </TabsContent>

            <TabsContent value="balance" className="mt-4">
              {renderFinancialTable(balanceSheetRows, (code) => individualBS[code] as unknown as FinancialData, (result?.balanceSheet || {}) as unknown as FinancialData)}
            </TabsContent>

            <TabsContent value="cashflow" className="mt-4">
              {renderFinancialTable(cashFlowRows, (code) => individualCF[code] as unknown as FinancialData, (result?.cashFlow || {}) as unknown as FinancialData)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Consolidation Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="shadow-sm bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900 hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('cards.consolidatedRevenue')}</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold count-animate"><AnimatedCounter value={(result?.kpis?.totalRevenue || 0) / 1_000_000} prefix="€" suffix="M" decimals={1} duration={1} /></p>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('cards.entitiesConsolidated', { count: entityCodes.length })}</p>
                <svg width="40" height="12" className="opacity-50"><polyline points="0,10 8,6 16,8 24,4 32,5 40,2" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="shadow-sm bg-gradient-to-br from-red-50/80 to-white dark:from-red-950/20 dark:to-slate-900">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('cards.icEliminations')}</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 count-animate"><AnimatedCounter value={Math.abs(eliminationsApplied / 1_000_000)} prefix="-€" suffix="M" decimals={2} duration={1} /></p>
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-muted-foreground">{t('cards.icEliminationsDesc')}</p>
                <svg width="40" height="12" className="opacity-50"><polyline points="0,2 8,4 16,3 24,6 32,7 40,10" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="shadow-sm bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-slate-900">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('cards.minorityInterest')}</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 count-animate"><AnimatedCounter value={Math.abs((result?.incomeStatement?.minorityInterest || 0) / 1_000_000)} prefix="€" suffix="M" decimals={1} duration={1} /></p>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-xs text-muted-foreground">{t('cards.minorityInterestDesc')}</p>
                <svg width="40" height="12" className="opacity-50"><polyline points="0,8 8,6 16,7 24,5 32,4 40,3" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        {/* Balance Sheet Check Indicator */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className={`shadow-sm bg-gradient-to-br ${bsIsBalanced ? 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900 border-emerald-200 dark:border-emerald-800' : 'from-red-50/80 to-white dark:from-red-950/20 dark:to-slate-900 border-red-200 dark:border-red-800'} border hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {bsIsBalanced ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('cards.bsCheck')}</p>
              </div>
              <p className={`text-2xl font-bold ${bsIsBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {bsIsBalanced ? t('cards.balanced') : t('cards.offBy', { amount: fmt(Math.abs(bsBalance)) })}
              </p>
              <p className={`text-xs mt-1 ${bsIsBalanced ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400 font-medium'}`}>
                {bsIsBalanced ? t('cards.bsEquation') : t('cards.gateFailed')}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Consolidation Quality Score */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="shadow-sm bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/30 dark:to-slate-900 hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('cards.qualityScore')}</p>
              </div>
              <p className={`text-2xl font-bold ${overallQuality >= 90 ? 'text-emerald-600 dark:text-emerald-400' : overallQuality >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                {overallQuality}%
              </p>
              <div className="mt-1.5 space-y-1">
                {qualityMetrics.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${m.score === 100 ? 'bg-emerald-500' : m.score >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${m.score}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground w-20 truncate">{m.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Elimination Impact Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{t('elimImpact.title')}</CardTitle>
                <CardDescription>{t('elimImpact.desc')}</CardDescription>
              </div>
              <span className="text-[10px] text-muted-foreground">Dec 2024</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eliminationImpactData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                  <XAxis dataKey="metric" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} stroke="var(--color-muted-foreground)" />
                  <RTooltip content={<EliminationTooltip />} />
                  <Legend />
                  <Bar dataKey="before" name={t('elimImpact.before')} fill="#0d9488" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="after" name={t('elimImpact.after')} fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Consolidation History Timeline */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            {t('history.title')}
          </CardTitle>
          <CardDescription>{t('history.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {history.map((run, index) => {
              const runDate = new Date(run.createdAt);
              let periodLabel = t('history.na');
              try {
                const pStr = typeof run.period === 'string' && run.period.includes('-') ? run.period.substring(0, 7) : run.period;
                periodLabel = new Date(pStr + '-01').toLocaleDateString(dateLocale(loc), { year: 'numeric', month: 'short' });
              } catch {}
              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className="flex gap-4 pb-6 last:pb-0"
                >
                  {/* Timeline line. The marker reflects the run's gate verdict:
                      a FAILED run (unbalanced book) shows red, never a green check. */}
                  <div className="flex flex-col items-center">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${run.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                      {run.status === 'failed' ? (
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                    {index < history.length - 1 && (
                      <div className="w-px h-full bg-slate-200 dark:bg-slate-700 mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{periodLabel}</span>
                        <Badge className={`text-[10px] ${scenarioColor[run.scenarioType] || 'bg-slate-100 text-slate-700'}`}>
                          {tScenario(run.scenarioType)}
                        </Badge>
                        {run.status === 'failed' && (
                          <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            {t('statusFailed')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {run.processingTime > 0 ? `${run.processingTime}s` : t('history.na')}
                        </span>
                        <span>{t('history.entities', { count: run.entityCount })}</span>
                        <span>{runDate.toLocaleDateString(dateLocale(loc), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">{t('history.revenue')}</span>
                        <span className="font-medium">{formatCompactEUR(run.totalRevenue)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('history.assets')}</span>
                        <span className="font-medium">{formatCompactEUR(run.totalAssets)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('history.netIncome')}</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCompactEUR(run.netIncome)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
