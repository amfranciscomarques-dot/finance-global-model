'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Search, Filter, Download, Loader2,
  Layers, Building2, FileUp, DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getAuditTrail } from '@/lib/api';
import { AuditEntry, AuditActionType } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';

// Demo fallback data
const demoAuditEntries: AuditEntry[] = [
  {
    id: 'a1', timestamp: '2024-12-15T14:30:00Z', actionType: 'consolidation',
    description: 'Full consolidation run for Dec 2024 (base scenario)', user: 'System',
    affectedEntities: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'],
    details: { period: '2024-12', eliminations: 3, processingTime: '1.2s' },
  },
  {
    id: 'a2', timestamp: '2024-12-15T10:35:00Z', actionType: 'import',
    description: 'Trial balance import: ES0002 Q4 2024 (76 records)', user: 'Data Pipeline',
    affectedEntities: ['ES0002'],
    details: { recordCount: 76, sourceSystem: 'SAP' },
  },
  {
    id: 'a3', timestamp: '2024-12-15T10:30:00Z', actionType: 'import',
    description: 'Trial balance import: PT0001 Q4 2024 (76 records)', user: 'Data Pipeline',
    affectedEntities: ['PT0001'],
    details: { recordCount: 76, sourceSystem: 'Oracle' },
  },
  {
    id: 'a4', timestamp: '2024-12-14T09:10:00Z', actionType: 'fx',
    description: 'FX rate update: GBP closing rate updated to 0.8571 (ECB)', user: 'ECB Feed',
    affectedEntities: [],
    details: { currency: 'GBP', rate: 0.8571, rateType: 'closing' },
  },
  {
    id: 'a5', timestamp: '2024-12-14T09:00:00Z', actionType: 'import',
    description: 'Trial balance import: DE0003 Q4 2024 (76 records)', user: 'Data Pipeline',
    affectedEntities: ['DE0003'],
    details: { recordCount: 76, sourceSystem: 'SAP' },
  },
  {
    id: 'a6', timestamp: '2024-12-13T16:45:00Z', actionType: 'import',
    description: 'Trial balance import: FR0005 Q4 2024 (76 records)', user: 'Admin',
    affectedEntities: ['FR0005'],
    details: { recordCount: 76, sourceSystem: 'manual' },
  },
  {
    id: 'a7', timestamp: '2024-12-12T11:00:00Z', actionType: 'consolidation',
    description: 'Full consolidation run for Nov 2024 (base scenario)', user: 'System',
    affectedEntities: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'],
    details: { period: '2024-11', eliminations: 3, processingTime: '1.1s' },
  },
  {
    id: 'a8', timestamp: '2024-12-10T14:20:00Z', actionType: 'entity',
    description: 'Entity FR0005 (TechNova France SAS) ownership updated to 50%', user: 'Admin',
    affectedEntities: ['FR0005'],
    details: { field: 'ownershipPercentage', oldValue: 60, newValue: 50 },
  },
  {
    id: 'a9', timestamp: '2024-12-10T08:00:00Z', actionType: 'fx',
    description: 'FX rate update: GBP average rate updated to 0.8580 (ECB)', user: 'ECB Feed',
    affectedEntities: [],
    details: { currency: 'GBP', rate: 0.8580, rateType: 'average' },
  },
  {
    id: 'a10', timestamp: '2024-12-05T09:30:00Z', actionType: 'entity',
    description: 'Entity DE0003 (TechNova Deutschland GmbH) consolidation method changed to full', user: 'Admin',
    affectedEntities: ['DE0003'],
    details: { field: 'consolidationMethod', oldValue: 'proportional', newValue: 'full' },
  },
  {
    id: 'a11', timestamp: '2024-12-01T00:05:00Z', actionType: 'consolidation',
    description: 'Scheduled consolidation run for Dec 2024 (optimistic scenario)', user: 'System',
    affectedEntities: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'],
    details: { period: '2024-12', scenarioType: 'optimistic', processingTime: '1.3s' },
  },
  {
    id: 'a12', timestamp: '2024-11-30T17:00:00Z', actionType: 'import',
    description: 'Bulk import: Group Q3 2024 trial balances (380 records, 5 entities)', user: 'Data Pipeline',
    affectedEntities: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'],
    details: { recordCount: 380, sourceSystem: 'SAP' },
  },
  {
    id: 'a13', timestamp: '2024-11-28T10:15:00Z', actionType: 'fx',
    description: 'FX rate update: USD closing rate updated to 1.0820 (ECB)', user: 'ECB Feed',
    affectedEntities: [],
    details: { currency: 'USD', rate: 1.0820, rateType: 'closing' },
  },
  {
    id: 'a14', timestamp: '2024-11-15T14:30:00Z', actionType: 'consolidation',
    description: 'Full consolidation run for Oct 2024 (pessimistic scenario)', user: 'System',
    affectedEntities: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'],
    details: { period: '2024-10', scenarioType: 'pessimistic', processingTime: '1.0s' },
  },
];

const actionTypeConfig: Record<AuditActionType, { label: string; icon: React.ElementType; color: string; bgColor: string; borderColor: string }> = {
  consolidation: {
    label: 'Consolidation',
    icon: Layers,
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
  },
  entity: {
    label: 'Entity Change',
    icon: Building2,
    color: 'text-teal-700 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    borderColor: 'border-teal-300 dark:border-teal-700',
  },
  import: {
    label: 'Data Import',
    icon: FileUp,
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
  },
  fx: {
    label: 'FX Rate Update',
    icon: DollarSign,
    color: 'text-slate-700 dark:text-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-800/50',
    borderColor: 'border-slate-300 dark:border-slate-600',
  },
};

function formatTimestamp(ts: string, locale: string): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  };
}

function exportAuditLog(entries: AuditEntry[], headers: string[]) {
  const rows = entries.map(e => [
    e.timestamp,
    e.actionType,
    e.description,
    e.user,
    e.affectedEntities.join('; '),
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function AuditTrailView() {
  const t = useTranslations('audit');
  const loc = useLocale() as Locale;
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getAuditTrail({
        actionType: filterAction !== 'all' ? filterAction : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setEntries(data.length > 0 ? data : demoAuditEntries);
    } catch (err) {
      console.error('Failed to load audit trail', err);
      setEntries(demoAuditEntries);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filterAction, dateFrom, dateTo]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filteredEntries = entries.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      e.description.toLowerCase().includes(q) ||
      e.user.toLowerCase().includes(q) ||
      e.affectedEntities.some(ent => ent.toLowerCase().includes(q));
    const matchesAction = filterAction === 'all' || e.actionType === filterAction;
    return matchesSearch && matchesAction;
  });

  // Stats
  const actionCounts = entries.reduce((acc, e) => {
    acc[e.actionType] = (acc[e.actionType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);


  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: t('cards.total'), value: entries.length, icon: Clock, color: 'from-emerald-500/10 to-emerald-600/5', textColor: 'text-emerald-700 dark:text-emerald-400', borderColor: 'border-emerald-200 dark:border-emerald-800/50' },
          { label: t('cards.consolidations'), value: actionCounts.consolidation || 0, icon: Layers, color: 'from-emerald-500/10 to-emerald-600/5', textColor: 'text-emerald-700 dark:text-emerald-400', borderColor: 'border-emerald-200 dark:border-emerald-800/50' },
          { label: t('cards.entityChanges'), value: actionCounts.entity || 0, icon: Building2, color: 'from-teal-500/10 to-teal-600/5', textColor: 'text-teal-700 dark:text-teal-400', borderColor: 'border-teal-200 dark:border-teal-800/50' },
          { label: t('cards.imports'), value: actionCounts.import || 0, icon: FileUp, color: 'from-amber-500/10 to-amber-600/5', textColor: 'text-amber-700 dark:text-amber-400', borderColor: 'border-amber-200 dark:border-amber-800/50' },
          { label: t('cards.fxUpdates'), value: actionCounts.fx || 0, icon: DollarSign, color: 'from-slate-500/10 to-slate-600/5', textColor: 'text-slate-700 dark:text-slate-400', borderColor: 'border-slate-200 dark:border-slate-700/50' },
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
                  <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Main Card */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                {t('title')}
              </CardTitle>
              <CardDescription>{t('subtitle')}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportAuditLog(filteredEntries, [t('csv.timestamp'), t('csv.actionType'), t('csv.description'), t('csv.user'), t('csv.affectedEntities')])}
            >
              <Download className="w-4 h-4 mr-1" />
              {t('exportLog')}
            </Button>
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
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filter.all')}</SelectItem>
                  <SelectItem value="consolidation">{t('filter.consolidation')}</SelectItem>
                  <SelectItem value="entity">{t('filter.entity')}</SelectItem>
                  <SelectItem value="import">{t('filter.import')}</SelectItem>
                  <SelectItem value="fx">{t('filter.fx')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-8 text-xs w-32"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                className="h-8 text-xs w-32"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
              />
            </div>
          </div>

          {/* Timeline */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t('loading')}</span>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto pr-2">
              <AnimatePresence>
                {filteredEntries.map((entry, index) => {
                  const config = actionTypeConfig[entry.actionType];
                  const Icon = config.icon;
                  const { date, time } = formatTimestamp(entry.timestamp, dateLocale(loc));

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.3 }}
                      className="relative flex gap-4 pb-6 last:pb-0"
                    >
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.bgColor} border ${config.borderColor} shadow-sm shrink-0`}>
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        {index < filteredEntries.length - 1 && (
                          <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-2" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                          <div className="flex-1">
                            <p className="text-sm font-medium leading-snug">{entry.description}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge className={`${config.bgColor} ${config.color} border ${config.borderColor} text-[10px] hover:${config.bgColor}`}>
                                {t(`actionTypes.${entry.actionType}`)}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                {entry.user === 'System' || entry.user === 'ECB Feed' || entry.user === 'Data Pipeline' ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {t('automated')}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    {entry.user}
                                  </span>
                                )}
                              </span>
                            </div>
                            {entry.affectedEntities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {entry.affectedEntities.map(ent => (
                                  <Badge key={ent} variant="outline" className="text-[10px] font-mono">{ent}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-medium">{date}</p>
                            <p className="text-[10px] text-muted-foreground">{time}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {filteredEntries.length === 0 && (
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
