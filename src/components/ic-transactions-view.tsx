'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, Search, Filter, Download, Loader2,
  TrendingUp, TrendingDown, Scale, AlertCircle, CheckCircle2,
  ArrowRight, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getICTransactions, runEliminations } from '@/lib/api';
import { formatNumber as formatGrouped, formatCompactEUR } from '@/lib/format';
import { ICTransaction } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { useAppStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

// Demo fallback data
const demoICTransactions: ICTransaction[] = [
  {
    id: 'ic1', transactionId: 'IC-PT-ES-001', fromEntityId: 'e1', fromEntityCode: 'PT0001', fromEntityName: 'TechNova Portugal Lda',
    toEntityId: 'e2', toEntityCode: 'ES0002', toEntityName: 'TechNova España S.A.',
    amount: 450000, currency: 'EUR', amountEUR: 450000, transactionType: 'sale',
    matchingReference: 'MR-PT-ES-2024Q4', period: '2024-12', isEliminated: true, eliminationGroup: 'EG-01', createdAt: '2024-12-15T10:00:00Z',
  },
  {
    id: 'ic2', transactionId: 'IC-ES-PT-001', fromEntityId: 'e2', fromEntityCode: 'ES0002', fromEntityName: 'TechNova España S.A.',
    toEntityId: 'e1', toEntityCode: 'PT0001', toEntityName: 'TechNova Portugal Lda',
    amount: 450000, currency: 'EUR', amountEUR: 450000, transactionType: 'purchase',
    matchingReference: 'MR-PT-ES-2024Q4', period: '2024-12', isEliminated: true, eliminationGroup: 'EG-01', createdAt: '2024-12-15T10:30:00Z',
  },
  {
    id: 'ic3', transactionId: 'IC-PT-DE-001', fromEntityId: 'e1', fromEntityCode: 'PT0001', fromEntityName: 'TechNova Portugal Lda',
    toEntityId: 'e3', toEntityCode: 'DE0003', toEntityName: 'TechNova Deutschland GmbH',
    amount: 280000, currency: 'EUR', amountEUR: 280000, transactionType: 'service',
    matchingReference: 'MR-PT-DE-2024Q4', period: '2024-12', isEliminated: true, eliminationGroup: 'EG-02', createdAt: '2024-12-14T09:00:00Z',
  },
  {
    id: 'ic4', transactionId: 'IC-DE-PT-001', fromEntityId: 'e3', fromEntityCode: 'DE0003', fromEntityName: 'TechNova Deutschland GmbH',
    toEntityId: 'e1', toEntityCode: 'PT0001', toEntityName: 'TechNova Portugal Lda',
    amount: 280000, currency: 'EUR', amountEUR: 280000, transactionType: 'purchase',
    matchingReference: 'MR-PT-DE-2024Q4', period: '2024-12', isEliminated: true, eliminationGroup: 'EG-02', createdAt: '2024-12-14T09:15:00Z',
  },
  {
    id: 'ic5', transactionId: 'IC-UK-PT-001', fromEntityId: 'e4', fromEntityCode: 'UK0004', fromEntityName: 'TechNova UK Ltd',
    toEntityId: 'e1', toEntityCode: 'PT0001', toEntityName: 'TechNova Portugal Lda',
    amount: 195000, currency: 'GBP', amountEUR: 227442, transactionType: 'service',
    matchingReference: 'MR-UK-PT-2024Q4', period: '2024-12', isEliminated: false, eliminationGroup: null, createdAt: '2024-12-13T14:00:00Z',
  },
  {
    id: 'ic6', transactionId: 'IC-PT-UK-001', fromEntityId: 'e1', fromEntityCode: 'PT0001', fromEntityName: 'TechNova Portugal Lda',
    toEntityId: 'e4', toEntityCode: 'UK0004', toEntityName: 'TechNova UK Ltd',
    amount: 227442, currency: 'EUR', amountEUR: 227442, transactionType: 'sale',
    matchingReference: 'MR-UK-PT-2024Q4', period: '2024-12', isEliminated: false, eliminationGroup: null, createdAt: '2024-12-13T14:30:00Z',
  },
  {
    id: 'ic7', transactionId: 'IC-FR-ES-001', fromEntityId: 'e5', fromEntityCode: 'FR0005', fromEntityName: 'TechNova France SAS',
    toEntityId: 'e2', toEntityCode: 'ES0002', toEntityName: 'TechNova España S.A.',
    amount: 175000, currency: 'EUR', amountEUR: 175000, transactionType: 'sale',
    matchingReference: 'MR-FR-ES-2024Q4', period: '2024-12', isEliminated: false, eliminationGroup: null, createdAt: '2024-12-12T11:00:00Z',
  },
  {
    id: 'ic8', transactionId: 'IC-ES-FR-001', fromEntityId: 'e2', fromEntityCode: 'ES0002', fromEntityName: 'TechNova España S.A.',
    toEntityId: 'e5', toEntityCode: 'FR0005', toEntityName: 'TechNova France SAS',
    amount: 175000, currency: 'EUR', amountEUR: 175000, transactionType: 'purchase',
    matchingReference: 'MR-FR-ES-2024Q4', period: '2024-12', isEliminated: false, eliminationGroup: null, createdAt: '2024-12-12T11:20:00Z',
  },
  {
    id: 'ic9', transactionId: 'IC-DE-FR-001', fromEntityId: 'e3', fromEntityCode: 'DE0003', fromEntityName: 'TechNova Deutschland GmbH',
    toEntityId: 'e5', toEntityCode: 'FR0005', toEntityName: 'TechNova France SAS',
    amount: 120000, currency: 'EUR', amountEUR: 120000, transactionType: 'loan',
    matchingReference: null, period: '2024-12', isEliminated: false, eliminationGroup: null, createdAt: '2024-12-10T16:00:00Z',
  },
  {
    id: 'ic10', transactionId: 'IC-PT-FR-001', fromEntityId: 'e1', fromEntityCode: 'PT0001', fromEntityName: 'TechNova Portugal Lda',
    toEntityId: 'e5', toEntityCode: 'FR0005', toEntityName: 'TechNova France SAS',
    amount: 95000, currency: 'EUR', amountEUR: 95000, transactionType: 'dividend',
    matchingReference: null, period: '2024-12', isEliminated: false, eliminationGroup: null, createdAt: '2024-12-08T10:00:00Z',
  },
];

const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30', borderColor: 'border-amber-300 dark:border-amber-700', icon: AlertCircle },
  eliminated: { label: 'Eliminated', color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', borderColor: 'border-emerald-300 dark:border-emerald-700', icon: CheckCircle2 },
  matched: { label: 'Matched', color: 'text-teal-700 dark:text-teal-400', bgColor: 'bg-teal-100 dark:bg-teal-900/30', borderColor: 'border-teal-300 dark:border-teal-700', icon: Scale },
};

const typeConfig: Record<string, { label: string; color: string }> = {
  sale: { label: 'Sale', color: 'text-emerald-600 dark:text-emerald-400' },
  purchase: { label: 'Purchase', color: 'text-teal-600 dark:text-teal-400' },
  service: { label: 'Service', color: 'text-violet-600 dark:text-violet-400' },
  loan: { label: 'Loan', color: 'text-amber-600 dark:text-amber-400' },
  dividend: { label: 'Dividend', color: 'text-rose-600 dark:text-rose-400' },
};

// de-DE grouping with a leading currency symbol, consistent with the rest of
// the app (€1.234). Multi-currency: IC legs can be GBP/USD etc.
const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£', USD: '$' };
function formatCurrency(value: number, currency: string = 'EUR'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const sign = value < 0 ? '-' : '';
  return `${sign}${symbol}${formatGrouped(Math.abs(value))}`;
}

function formatCurrencyShort(value: number): string {
  return formatCompactEUR(value);
}

function getEliminationStatus(tx: ICTransaction): string {
  if (tx.isEliminated) return 'eliminated';
  if (tx.matchingReference) return 'matched';
  return 'pending';
}

export function ICTransactionsView() {
  const t = useTranslations('icTransactions');
  const { selectedPeriod } = useAppStore();
  const [transactions, setTransactions] = useState<ICTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [eliminating, setEliminating] = useState(false);
  const [search, setSearch] = useState('');
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDiagram, setShowDiagram] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getICTransactions({ period: selectedPeriod });
      setTransactions(data.length > 0 ? data : demoICTransactions);
    } catch (err) {
      console.error('Failed to load IC transactions', err);
      setTransactions(demoICTransactions);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunEliminations = async () => {
    setEliminating(true);
    try {
      await runEliminations(selectedPeriod);
      await loadData();
    } catch {
      // Silently fail, demo data will persist
    } finally {
      setEliminating(false);
    }
  };

  // Filtered transactions
  const filtered = transactions.filter((tx) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      tx.transactionId.toLowerCase().includes(q) ||
      (tx.matchingReference || '').toLowerCase().includes(q) ||
      tx.fromEntityCode?.toLowerCase().includes(q) ||
      tx.toEntityCode?.toLowerCase().includes(q);
    const matchesEntity = filterEntity === 'all' ||
      tx.fromEntityCode === filterEntity || tx.toEntityCode === filterEntity;
    const matchesType = filterType === 'all' || tx.transactionType === filterType;
    const status = getEliminationStatus(tx);
    const matchesStatus = filterStatus === 'all' || status === filterStatus;
    return matchesSearch && matchesEntity && matchesType && matchesStatus;
  });

  // Summary calculations
  const totalICRevenue = filtered
    .filter(tx => tx.transactionType === 'sale' || tx.transactionType === 'service')
    .reduce((sum, tx) => sum + tx.amountEUR, 0);
  const totalICExpenses = filtered
    .filter(tx => tx.transactionType === 'purchase')
    .reduce((sum, tx) => sum + tx.amountEUR, 0);
  const netICBalance = totalICRevenue - totalICExpenses;
  const uneliminatedCount = filtered.filter(tx => !tx.isEliminated).length;
  const eliminatedCount = filtered.filter(tx => tx.isEliminated).length;
  const matchingRate = filtered.length > 0 ? Math.round((eliminatedCount / filtered.length) * 100) : 0;

  // Unique entities for filters
  const entities = Array.from(new Set(transactions.flatMap(tx => [tx.fromEntityCode, tx.toEntityCode]).filter(Boolean) as string[])).sort();

  // Build diagram data - entity pairs with amounts
  const entityFlows = new Map<string, { from: string; fromName: string; to: string; toName: string; amount: number; type: string }>();
  for (const tx of filtered) {
    const key = `${tx.fromEntityCode}-${tx.toEntityCode}-${tx.transactionType}`;
    const existing = entityFlows.get(key);
    if (existing) {
      existing.amount += tx.amountEUR;
    } else {
      entityFlows.set(key, {
        from: tx.fromEntityCode || '',
        fromName: tx.fromEntityName || '',
        to: tx.toEntityCode || '',
        toName: tx.toEntityName || '',
        amount: tx.amountEUR,
        type: tx.transactionType,
      });
    }
  }

  const exportCSV = () => {
    const headers = [t('csv.txId'), t('csv.from'), t('csv.to'), t('csv.type'), t('csv.amountLocal'), t('csv.amountEur'), t('csv.currency'), t('csv.period'), t('csv.matchRef'), t('csv.status')];
    const rows = filtered.map(tx => [
      tx.transactionId,
      tx.fromEntityCode,
      tx.toEntityCode,
      tx.transactionType,
      tx.amount,
      tx.amountEUR,
      tx.currency,
      tx.period,
      tx.matchingReference || '',
      getEliminationStatus(tx),
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ic-transactions-${selectedPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('cards.revenue'), value: totalICRevenue, icon: TrendingUp, color: 'from-emerald-500/10 to-emerald-600/5', textColor: 'text-emerald-700 dark:text-emerald-400', borderColor: 'border-emerald-200 dark:border-emerald-800/50', format: 'currency' },
          { label: t('cards.expenses'), value: totalICExpenses, icon: TrendingDown, color: 'from-amber-500/10 to-amber-600/5', textColor: 'text-amber-700 dark:text-amber-400', borderColor: 'border-amber-200 dark:border-amber-800/50', format: 'currency' },
          { label: t('cards.netBalance'), value: netICBalance, icon: Scale, color: 'from-teal-500/10 to-teal-600/5', textColor: 'text-teal-700 dark:text-teal-400', borderColor: 'border-teal-200 dark:border-teal-800/50', format: 'currency' },
          { label: t('cards.uneliminated'), value: uneliminatedCount, icon: AlertCircle, color: 'from-rose-500/10 to-rose-600/5', textColor: 'text-rose-700 dark:text-rose-400', borderColor: 'border-rose-200 dark:border-rose-800/50', format: 'count' },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <Card className={`bg-gradient-to-br ${card.color} border ${card.borderColor} shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{card.label}</p>
                    <Icon className={`w-4 h-4 ${card.textColor}`} />
                  </div>
                  <p className={`text-2xl font-bold ${card.textColor}`}>
                    {card.format === 'currency' ? formatCurrencyShort(card.value) : card.value}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* IC Matching Diagram */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-emerald-600" />
                {t('flowTitle')}
              </CardTitle>
              {/* Matching Rate Circle */}
              <div className="flex items-center gap-2">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-muted)" strokeWidth="3" opacity="0.2" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke={matchingRate >= 80 ? '#10b981' : matchingRate >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeDasharray={`${(matchingRate / 100) * 100.53} 100.53`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{matchingRate}%</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{t('matched')}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiagram(!showDiagram)}
              className="text-xs"
            >
              {showDiagram ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {showDiagram ? t('collapse') : t('expand')}
            </Button>
          </div>
          <CardDescription>{t('flowDesc')}</CardDescription>
        </CardHeader>
        <AnimatePresence>
          {showDiagram && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0">
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 lg:p-6 overflow-x-auto">
                  <div className="min-w-[600px] space-y-3">
                    {Array.from(entityFlows.entries()).map(([key, flow], index) => {
                      const typeInfo = { label: typeConfig[flow.type] ? t(`types.${flow.type}`) : flow.type, color: typeConfig[flow.type]?.color || 'text-slate-600' };
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.3 }}
                          className="flex items-center gap-3"
                        >
                          {/* From Entity Card */}
                          <div className="flex-shrink-0 w-44 lg:w-52 bg-white dark:bg-slate-800 rounded-lg border border-emerald-200 dark:border-emerald-800/50 px-3 py-2 shadow-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                {flow.from.slice(-4)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{flow.fromName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{flow.from}</p>
                              </div>
                            </div>
                          </div>

                          {/* Arrow with label — animated dashed lines for matched */}
                          <div className="flex-1 flex items-center gap-2 min-w-[140px] lg:min-w-[200px]">
                            <div className="flex-1 relative">
                              <svg className="w-full h-2" preserveAspectRatio="none">
                                <line x1="0" y1="1" x2="100%" y2="1" stroke={flow.from === 'PT0001' && flow.to === 'ES0002' ? '#10b981' : '#0d9488'} strokeWidth="2" strokeDasharray={flow.amount > 300000 ? '' : '6 3'} className={flow.amount > 300000 ? '' : 'animate-dash'} />
                              </svg>
                              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                                <ArrowRight className="w-4 h-4 text-teal-500" />
                              </div>
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex flex-col items-center gap-0.5 px-2 py-1 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <Badge variant="outline" className={`text-[9px] ${typeInfo.color} border-0 px-1 py-0`}>
                                      {typeInfo.label}
                                    </Badge>
                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                      {formatCurrencyShort(flow.amount)}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-slate-900 text-white text-xs border-slate-700">
                                  <p>{flow.from} → {flow.to}</p>
                                  <p>{typeInfo.label}: {formatCurrency(flow.amount)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <div className="flex-1 relative">
                              <svg className="w-full h-2" preserveAspectRatio="none">
                                <line x1="0" y1="1" x2="100%" y2="1" stroke="#0d9488" strokeWidth="2" strokeDasharray="6 3" className="animate-dash" />
                              </svg>
                            </div>
                          </div>

                          {/* To Entity Card */}
                          <div className="flex-shrink-0 w-44 lg:w-52 bg-white dark:bg-slate-800 rounded-lg border border-teal-200 dark:border-teal-800/50 px-3 py-2 shadow-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-md bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-[10px] font-bold text-teal-700 dark:text-teal-400">
                                {flow.to.slice(-4)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{flow.toName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{flow.to}</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Transaction Table */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-teal-600" />
                {t('title')}
              </CardTitle>
              <CardDescription>{t('countForPeriod', { count: filtered.length, period: selectedPeriod })}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCSV}
              >
                <Download className="w-4 h-4 mr-1" />
                {t('export')}
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm"
                onClick={handleRunEliminations}
                disabled={eliminating}
              >
                {eliminating ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-1" />
                )}
                {t('runEliminations')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                className="pl-10 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={filterEntity} onValueChange={setFilterEntity}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder={t('entity')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allEntities')}</SelectItem>
                  {entities.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder={t('type')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allTypes')}</SelectItem>
                <SelectItem value="sale">{t('types.sale')}</SelectItem>
                <SelectItem value="purchase">{t('types.purchase')}</SelectItem>
                <SelectItem value="service">{t('types.service')}</SelectItem>
                <SelectItem value="loan">{t('types.loan')}</SelectItem>
                <SelectItem value="dividend">{t('types.dividend')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder={t('statusLabel')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStatus')}</SelectItem>
                <SelectItem value="pending">{t('statuses.pending')}</SelectItem>
                <SelectItem value="matched">{t('statuses.matched')}</SelectItem>
                <SelectItem value="eliminated">{t('statuses.eliminated')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.txId')}</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.fromTo')}</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.type')}</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.amountLocal')}</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.amountEur')}</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.ccy')}</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.period')}</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.matchRef')}</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('headers.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filtered.map((tx, index) => {
                      const status = getEliminationStatus(tx);
                      const statusInfo = statusConfig[status];
                      const StatusIcon = statusInfo.icon;
                      const typeInfo = { label: typeConfig[tx.transactionType] ? t(`types.${tx.transactionType}`) : tx.transactionType, color: typeConfig[tx.transactionType]?.color || 'text-slate-600' };
                      return (
                        <motion.tr
                          key={tx.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03, duration: 0.3 }}
                          className={`
                            border-b border-slate-100 dark:border-slate-800 transition-colors
                            ${tx.isEliminated ? 'opacity-60 bg-emerald-50/30 dark:bg-emerald-950/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
                            ${status === 'pending' ? 'bg-amber-50/20 dark:bg-amber-950/5' : ''}
                            ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}
                          `}
                        >
                          <td className="px-3 py-2.5 font-mono text-xs">{tx.transactionId}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400">
                                {tx.fromEntityCode}
                              </Badge>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-teal-200 dark:border-teal-800/50 text-teal-700 dark:text-teal-400">
                                {tx.toEntityCode}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className={`text-[10px] ${typeInfo.color} border-0 px-1.5 py-0`}>
                              {typeInfo.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {formatCurrency(tx.amount, tx.currency)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-medium">
                            {formatCurrency(tx.amountEUR)}
                          </td>
                          <td className="px-3 py-2.5 text-xs font-mono">{tx.currency}</td>
                          <td className="px-3 py-2.5 text-xs">{tx.period}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">
                            {tx.matchingReference || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge className={`${statusInfo.bgColor} ${statusInfo.color} border ${statusInfo.borderColor} text-[10px] hover:${statusInfo.bgColor} gap-1 px-1.5 py-0`}>
                              <StatusIcon className="w-3 h-3" />
                              {t(`statuses.${status}`)}
                            </Badge>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t('noMatch')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
