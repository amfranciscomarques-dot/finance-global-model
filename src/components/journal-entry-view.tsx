'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PenLine, Plus, Trash2, Search, Download, CheckCircle2, XCircle,
  Loader2, ArrowUpRight, ArrowDownRight, Eye, BookOpen, Calendar,
  FileText, Scale,
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { useAppStore } from '@/lib/store';
import { getJournalEntries, createJournalEntry, getCOA, getEntities } from '@/lib/api';
import { JournalEntry, JournalEntryLine, COAAccount, Entity } from '@/lib/types';
import { formatCompactEUR, formatNumber } from '@/lib/format';
import { DataLoadError } from '@/components/data-load-error';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';

// ============================================================
// DEMO DATA
// ============================================================
const demoEntries: JournalEntry[] = [
  {
    id: 'je-1',
    entryNumber: 'JE-0001',
    date: '2024-12-15',
    period: '2024-12',
    description: 'IC Revenue Elimination — PT → ES',
    lines: [
      { entityCode: 'PT0001', accountCode: 'REV-003', accountName: 'IC Revenue', debit: 0, credit: 250000, description: 'Eliminate IC revenue PT' },
      { entityCode: 'ES0002', accountCode: 'EXP-003', accountName: 'IC Expenses', debit: 250000, credit: 0, description: 'Eliminate IC expense ES' },
    ],
    totalDebits: 250000,
    totalCredits: 250000,
    isBalanced: true,
    status: 'posted',
    createdAt: '2024-12-15T10:30:00Z',
  },
  {
    id: 'je-2',
    entryNumber: 'JE-0002',
    date: '2024-12-15',
    period: '2024-12',
    description: 'Depreciation Adjustment — DE Entity',
    lines: [
      { entityCode: 'DE0003', accountCode: 'DEP-001', accountName: 'Depreciation - PPE', debit: 15000, credit: 0, description: 'Additional depreciation' },
      { entityCode: 'DE0003', accountCode: 'AST-005', accountName: 'Accumulated Depreciation', debit: 0, credit: 15000, description: 'Contra asset increase' },
    ],
    totalDebits: 15000,
    totalCredits: 15000,
    isBalanced: true,
    status: 'posted',
    createdAt: '2024-12-14T14:20:00Z',
  },
  {
    id: 'je-3',
    entryNumber: 'JE-0003',
    date: '2024-12-13',
    period: '2024-12',
    description: 'FX Translation Adjustment — UK Entity',
    lines: [
      { entityCode: 'UK0005', accountCode: 'AST-001', accountName: 'Cash & Equivalents', debit: 32500, credit: 0, description: 'FX gain on cash' },
      { entityCode: 'UK0005', accountCode: 'EQY-002', accountName: 'Retained Earnings', debit: 0, credit: 32500, description: 'CTA translation' },
    ],
    totalDebits: 32500,
    totalCredits: 32500,
    isBalanced: true,
    status: 'posted',
    createdAt: '2024-12-13T09:45:00Z',
  },
  {
    id: 'je-4',
    entryNumber: 'JE-0004',
    date: '2024-12-12',
    period: '2024-12',
    description: 'IC Receivable/Payable Elimination',
    lines: [
      { entityCode: 'PT0001', accountCode: 'AST-003', accountName: 'IC Receivables', debit: 0, credit: 180000, description: 'Eliminate IC receivable' },
      { entityCode: 'FR0004', accountCode: 'LIA-004', accountName: 'IC Payables', debit: 180000, credit: 0, description: 'Eliminate IC payable' },
    ],
    totalDebits: 180000,
    totalCredits: 180000,
    isBalanced: true,
    status: 'posted',
    createdAt: '2024-12-12T16:10:00Z',
  },
  {
    id: 'je-5',
    entryNumber: 'JE-0005',
    date: '2024-12-10',
    period: '2024-12',
    description: 'Minority Interest Adjustment — FR Entity (80%)',
    lines: [
      { entityCode: 'FR0004', accountCode: 'EQY-003', accountName: 'Minority Interest', debit: 0, credit: 42800, description: '20% minority share' },
      { entityCode: 'FR0004', accountCode: 'EXP-006', accountName: 'Income Tax', debit: 42800, credit: 0, description: 'Tax adjustment' },
    ],
    totalDebits: 42800,
    totalCredits: 42800,
    isBalanced: true,
    status: 'posted',
    createdAt: '2024-12-10T11:55:00Z',
  },
];

const demoCOA: COAAccount[] = [
  { id: '1', code: 'REV-001', name: 'Product Revenue', accountType: 'revenue', statementType: 'income', parentCode: null, level: 3, isIntercompany: false, sortOrder: 1 },
  { id: '2', code: 'REV-002', name: 'Service Revenue', accountType: 'revenue', statementType: 'income', parentCode: null, level: 3, isIntercompany: false, sortOrder: 2 },
  { id: '3', code: 'REV-003', name: 'IC Revenue', accountType: 'revenue', statementType: 'income', parentCode: null, level: 3, isIntercompany: true, sortOrder: 3 },
  { id: '4', code: 'COGS-001', name: 'Direct Materials', accountType: 'expense', statementType: 'income', parentCode: null, level: 3, isIntercompany: false, sortOrder: 4 },
  { id: '5', code: 'COGS-002', name: 'Direct Labor', accountType: 'expense', statementType: 'income', parentCode: null, level: 3, isIntercompany: false, sortOrder: 5 },
  { id: '6', code: 'EXP-003', name: 'IC Expenses', accountType: 'expense', statementType: 'income', parentCode: null, level: 3, isIntercompany: true, sortOrder: 6 },
  { id: '7', code: 'AST-001', name: 'Cash & Equivalents', accountType: 'asset', statementType: 'balance', parentCode: null, level: 3, isIntercompany: false, sortOrder: 7 },
  { id: '8', code: 'AST-003', name: 'IC Receivables', accountType: 'asset', statementType: 'balance', parentCode: null, level: 3, isIntercompany: true, sortOrder: 8 },
  { id: '9', code: 'AST-005', name: 'Accumulated Depreciation', accountType: 'asset', statementType: 'balance', parentCode: null, level: 3, isIntercompany: false, sortOrder: 9 },
  { id: '10', code: 'DEP-001', name: 'Depreciation - PPE', accountType: 'expense', statementType: 'income', parentCode: null, level: 3, isIntercompany: false, sortOrder: 10 },
  { id: '11', code: 'LIA-004', name: 'IC Payables', accountType: 'liability', statementType: 'balance', parentCode: null, level: 3, isIntercompany: true, sortOrder: 11 },
  { id: '12', code: 'EQY-002', name: 'Retained Earnings', accountType: 'equity', statementType: 'balance', parentCode: null, level: 3, isIntercompany: false, sortOrder: 12 },
  { id: '13', code: 'EQY-003', name: 'Minority Interest', accountType: 'equity', statementType: 'balance', parentCode: null, level: 3, isIntercompany: false, sortOrder: 13 },
  { id: '14', code: 'EXP-006', name: 'Income Tax', accountType: 'expense', statementType: 'income', parentCode: null, level: 3, isIntercompany: false, sortOrder: 14 },
];

const demoEntities: Entity[] = [
  { id: '1', code: 'PT0001', legalName: 'TechNova Portugal Lda', countryCode: 'PT', localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Technology', isActive: true },
  { id: '2', code: 'ES0002', legalName: 'TechNova España S.A.', countryCode: 'ES', localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Technology', isActive: true },
  { id: '3', code: 'DE0003', legalName: 'TechNova Deutschland GmbH', countryCode: 'DE', localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 0.9, sector: 'Manufacturing', isActive: true },
  { id: '4', code: 'FR0004', legalName: 'TechNova France SAS', countryCode: 'FR', localCurrency: 'EUR', consolidationMethod: 'proportional', ownershipPercentage: 0.8, sector: 'Services', isActive: true },
  { id: '5', code: 'UK0005', legalName: 'TechNova UK Ltd', countryCode: 'UK', localCurrency: 'GBP', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Technology', isActive: true },
];

// ============================================================
// HELPERS
// ============================================================
const emptyLine = (): JournalEntryLine => ({
  entityCode: '',
  accountCode: '',
  accountName: '',
  debit: 0,
  credit: 0,
  description: '',
});

// ============================================================
// MAIN COMPONENT
// ============================================================
export function JournalEntryView() {
  const t = useTranslations('journal');
  const loc = useLocale() as Locale;
  const { selectedPeriod } = useAppStore();
  const [entries, setEntries] = useState<JournalEntry[]>(demoEntries);
  const [coa, setCOA] = useState<COAAccount[]>(demoCOA);
  const [entities, setEntities] = useState<Entity[]>(demoEntities);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New entry form state
  const [formLines, setFormLines] = useState<JournalEntryLine[]>([emptyLine(), emptyLine()]);
  const [formDescription, setFormDescription] = useState('');
  const [formPeriod, setFormPeriod] = useState(selectedPeriod);
  const [saving, setSaving] = useState(false);

  // Detail drawer
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [entriesData, coaData, entitiesData] = await Promise.all([
        getJournalEntries({ period: selectedPeriod }),
        getCOA(),
        getEntities(),
      ]);
      if (entriesData?.length > 0) setEntries(entriesData);
      if (coaData?.length > 0) setCOA(coaData);
      if (entitiesData?.length > 0) setEntities(entitiesData);
    } catch (err) {
      console.error('Failed to load journal entry data', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute totals
  const totalDebits = formLines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = formLines.reduce((s, l) => s + l.credit, 0);
  const balance = totalDebits - totalCredits;
  const isBalanced = Math.abs(balance) < 0.01;

  // Summary stats
  const entryCount = entries.length;
  const entriesTotalDebits = entries.reduce((s, e) => s + e.totalDebits, 0);
  const entriesTotalCredits = entries.reduce((s, e) => s + e.totalCredits, 0);
  const allBalanced = entries.every((e) => e.isBalanced);

  // Filter entries
  const filteredEntries = entries.filter((e) =>
    e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.entryNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // COA autocomplete
  const getAccountSuggestions = (input: string) => {
    if (!input) return [];
    return coa.filter(
      (a) =>
        a.code.toLowerCase().includes(input.toLowerCase()) ||
        a.name.toLowerCase().includes(input.toLowerCase())
    ).slice(0, 8);
  };

  // Handlers
  const addLine = () => setFormLines([...formLines, emptyLine()]);

  const removeLine = (idx: number) => {
    if (formLines.length <= 2) return;
    setFormLines(formLines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof JournalEntryLine, value: string | number) => {
    const updated = [...formLines];
    updated[idx] = { ...updated[idx], [field]: value };
    // If debit is set, clear credit, and vice versa
    if (field === 'debit' && Number(value) > 0) {
      updated[idx].credit = 0;
    } else if (field === 'credit' && Number(value) > 0) {
      updated[idx].debit = 0;
    }
    setFormLines(updated);
  };

  const handleAccountSelect = (idx: number, account: COAAccount) => {
    const updated = [...formLines];
    updated[idx] = { ...updated[idx], accountCode: account.code, accountName: account.name };
    setFormLines(updated);
  };

  const handleSave = async () => {
    if (!isBalanced || !formDescription) return;
    setSaving(true);
    try {
      const result = await createJournalEntry({
        period: formPeriod,
        description: formDescription,
        lines: formLines.filter((l) => l.entityCode && l.accountCode && (l.debit > 0 || l.credit > 0)),
      });
      if (result) {
        setEntries([result, ...entries]);
      }
      setFormLines([emptyLine(), emptyLine()]);
      setFormDescription('');
    } catch (err) {
      console.error('Failed to save journal entry', err);
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  const exportCSV = () => {
    const headers = [t('csv.entryNo'), t('csv.date'), t('csv.description'), t('csv.entity'), t('csv.account'), t('csv.debit'), t('csv.credit'), t('csv.status')];
    const rows = entries.flatMap((e) =>
      e.lines.map((l) => [
        e.entryNumber, e.date, e.description, l.entityCode,
        `${l.accountCode} - ${l.accountName || ''}`,
        l.debit.toString(), l.credit.toString(), e.status,
      ])
    );
    const csvContent = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `journal-entries-${selectedPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <PenLine className="w-5 h-5 text-emerald-600" />
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> {t('export')}
          </Button>
          <Select value={formPeriod} onValueChange={setFormPeriod}>
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
          { title: t('cards.totalEntries'), value: entryCount, icon: FileText, color: 'from-teal-50/80 to-white dark:from-teal-950/30 dark:to-slate-900', iconColor: 'text-teal-600 dark:text-teal-400', isCount: true },
          { title: t('cards.totalDebits'), value: entriesTotalDebits, icon: ArrowUpRight, color: 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900', iconColor: 'text-emerald-600 dark:text-emerald-400' },
          { title: t('cards.totalCredits'), value: entriesTotalCredits, icon: ArrowDownRight, color: 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900', iconColor: 'text-emerald-600 dark:text-emerald-400' },
          {
            title: t('cards.balanceStatus'),
            value: allBalanced ? t('balanced') : t('unbalanced'),
            icon: allBalanced ? CheckCircle2 : XCircle,
            color: allBalanced ? 'from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-slate-900' : 'from-red-50/80 to-white dark:from-red-950/30 dark:to-slate-900',
            iconColor: allBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            isStatus: true,
          },
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
                      <p className="text-2xl font-bold">
                        {card.isCount ? card.value : card.isStatus ? card.value : formatCompactEUR(card.value as number)}
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

      {/* New Entry Form */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="shadow-sm border-emerald-200 dark:border-emerald-800/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PenLine className="w-4 h-4 text-emerald-600" />
              {t('newEntry')}
            </CardTitle>
            <CardDescription>{t('newEntryDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Entry header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t('period')}</label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Input
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value)}
                    placeholder="YYYY-MM"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium mb-1.5 block">{t('description')}</label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  className="h-9"
                />
              </div>
            </div>

            {/* Line items table */}
            <div className="border rounded-lg overflow-hidden">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="w-32">{t('formHeaders.entity')}</TableHead>
                    <TableHead className="w-44">{t('formHeaders.account')}</TableHead>
                    <TableHead className="w-28 text-right">{t('formHeaders.debit')}</TableHead>
                    <TableHead className="w-28 text-right">{t('formHeaders.credit')}</TableHead>
                    <TableHead>{t('formHeaders.description')}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formLines.map((line, idx) => (
                    <TableRow key={idx} className={`cursor-pointer transition-colors duration-150 ${idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                      <TableCell>
                        <Select value={line.entityCode} onValueChange={(v) => updateLine(idx, 'entityCode', v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t('entityPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {entities.map((e) => (
                              <SelectItem key={e.code} value={e.code}>
                                <span className="text-xs">{e.code}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            value={line.accountCode}
                            onChange={(e) => {
                              updateLine(idx, 'accountCode', e.target.value);
                              const match = coa.find((a) => a.code === e.target.value);
                              if (match) handleAccountSelect(idx, match);
                            }}
                            placeholder={t('accountPlaceholder')}
                            className="h-8 text-xs"
                            list={`coa-suggestions-${idx}`}
                          />
                          {line.accountCode && !line.accountName && (
                            <div className="absolute z-20 top-full left-0 mt-1 bg-white dark:bg-slate-800 border rounded-lg shadow-lg max-h-32 overflow-y-auto w-56">
                              {getAccountSuggestions(line.accountCode).map((a) => (
                                <button
                                  key={a.code}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                  onClick={() => handleAccountSelect(idx, a)}
                                >
                                  <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">{a.code}</span>
                                  <span className="text-muted-foreground ml-2">{a.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {line.accountName && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{line.accountName}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.debit || ''}
                          onChange={(e) => updateLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-xs text-right tabular-nums"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={line.credit || ''}
                          onChange={(e) => updateLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-xs text-right tabular-nums"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          placeholder={t('linePlaceholder')}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-500"
                          onClick={() => removeLine(idx)}
                          disabled={formLines.length <= 2}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Running totals and actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-4 h-4 mr-1" /> {t('addLine')}
                </Button>
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('debits')}</span>
                    <span className="font-semibold tabular-nums">{formatNumber(totalDebits)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('credits')}</span>
                    <span className="font-semibold tabular-nums">{formatNumber(totalCredits)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('balance')}</span>
                    {isBalanced ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t('balanced')}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
                        <XCircle className="w-3 h-3" /> {formatNumber(balance)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!isBalanced || !formDescription || saving || formLines.every((l) => l.debit === 0 && l.credit === 0)}
                onClick={handleSave}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                {t('postEntry')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Gradient Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Recent Entries Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  {t('recentTitle')}
                </CardTitle>
                <CardDescription>{t('recentDesc')}</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('searchEntries')}
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
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table className="premium-table">
                  <TableHeader>
                    <TableRow className="cursor-pointer transition-colors duration-150 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                      <TableHead>{t('tableHeaders.entryNo')}</TableHead>
                      <TableHead>{t('tableHeaders.date')}</TableHead>
                      <TableHead>{t('tableHeaders.description')}</TableHead>
                      <TableHead className="text-right">{t('tableHeaders.total')}</TableHead>
                      <TableHead>{t('tableHeaders.lines')}</TableHead>
                      <TableHead>{t('tableHeaders.status')}</TableHead>
                      <TableHead className="w-20">{t('tableHeaders.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry, index) => (
                      <TableRow
                        key={entry.id}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
                        onClick={() => openDetail(entry)}
                      >
                        <TableCell>
                          <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">{entry.entryNumber}</span>
                        </TableCell>
                        <TableCell className="text-sm">{entry.date}</TableCell>
                        <TableCell className="text-sm max-w-64 truncate">{entry.description}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-sm">{formatCompactEUR(entry.totalDebits)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{t('linesCount', { count: entry.lines.length })}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${
                            entry.status === 'posted'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : entry.status === 'draft'
                              ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {t.has(`statuses.${entry.status}`) ? t(`statuses.${entry.status}`) : entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openDetail(entry); }}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Entry Detail Sheet */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedEntry && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-emerald-600" />
                  {selectedEntry.entryNumber}
                </SheetTitle>
                <SheetDescription>{selectedEntry.description}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {/* Entry meta */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{t('detail.date')}</p>
                    <p className="font-semibold text-sm">{selectedEntry.date}</p>
                  </div>
                  <div className="bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/20 dark:to-slate-900 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{t('detail.period')}</p>
                    <p className="font-semibold text-sm">{selectedEntry.period}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{t('detail.status')}</p>
                    <Badge className={`text-[10px] ${
                      selectedEntry.status === 'posted'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {t.has(`statuses.${selectedEntry.status}`) ? t(`statuses.${selectedEntry.status}`) : selectedEntry.status}
                    </Badge>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{t('detail.balance')}</p>
                    <div className="flex items-center gap-1">
                      {selectedEntry.isBalanced ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="font-semibold text-sm">{selectedEntry.isBalanced ? t('balanced') : t('unbalanced')}</span>
                    </div>
                  </div>
                </div>

                {/* Gradient Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

                {/* Line items */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">{t('detail.lineItems')}</h4>
                  <div className="space-y-2">
                    {selectedEntry.lines.map((line, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`p-3 rounded-lg border ${
                          idx % 2 === 0
                            ? 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{line.accountCode}</p>
                            <p className="text-xs text-muted-foreground">{line.accountName || line.accountCode}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('detail.entity')} <span className="font-medium">{line.entityCode}</span>
                              {line.description && ` · ${line.description}`}
                            </p>
                          </div>
                          <div className="text-right">
                            {line.debit > 0 && (
                              <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {t('dr')} {formatNumber(line.debit)}
                              </p>
                            )}
                            {line.credit > 0 && (
                              <p className="font-semibold text-sm text-teal-700 dark:text-teal-400 tabular-nums">
                                {t('cr')} {formatNumber(line.credit)}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t pt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('detail.totalDebits')}</span>
                    <span className="font-semibold tabular-nums">{formatNumber(selectedEntry.totalDebits)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('detail.totalCredits')}</span>
                    <span className="font-semibold tabular-nums">{formatNumber(selectedEntry.totalCredits)}</span>
                  </div>
                  <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                  <div className="flex justify-between text-sm font-bold">
                    <span>{t('detail.difference')}</span>
                    <span className={selectedEntry.isBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {formatNumber(selectedEntry.totalDebits - selectedEntry.totalCredits)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
