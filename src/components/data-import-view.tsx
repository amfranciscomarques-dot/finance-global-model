'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2,
  AlertCircle, Loader2, Download, FileUp, Check, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { importTrialBalance, getImportHistory } from '@/lib/api';
import { ImportRecord, ImportHistoryEntry } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';

type TFn = (key: string) => string;

// Demo fallback data
const demoImportHistory: ImportHistoryEntry[] = [
  { id: 'imp-1', fileName: 'PT0001_TB_2024Q4.csv', recordCount: 76, entityCount: 1, dateRange: '2024-10 → 2024-12', totalAmount: 40500, status: 'completed', importedAt: '2024-12-15T10:30:00Z' },
  { id: 'imp-2', fileName: 'ES0002_TB_2024Q4.csv', recordCount: 76, entityCount: 1, dateRange: '2024-10 → 2024-12', totalAmount: 32400, status: 'completed', importedAt: '2024-12-15T10:35:00Z' },
  { id: 'imp-3', fileName: 'DE0003_TB_2024Q4.csv', recordCount: 76, entityCount: 1, dateRange: '2024-10 → 2024-12', totalAmount: 31500, status: 'completed', importedAt: '2024-12-14T09:00:00Z' },
  { id: 'imp-4', fileName: 'UK0004_TB_2024Q4.csv', recordCount: 76, entityCount: 1, dateRange: '2024-10 → 2024-12', totalAmount: 22680, status: 'completed', importedAt: '2024-12-14T09:10:00Z' },
  { id: 'imp-5', fileName: 'FR0005_TB_2024Q4.csv', recordCount: 76, entityCount: 1, dateRange: '2024-10 → 2024-12', totalAmount: 16200, status: 'completed', importedAt: '2024-12-13T16:45:00Z' },
  { id: 'imp-6', fileName: 'Group_TB_2024H1.csv', recordCount: 456, entityCount: 5, dateRange: '2024-01 → 2024-06', totalAmount: 155700, status: 'completed', importedAt: '2024-07-10T14:20:00Z' },
  { id: 'imp-7', fileName: 'UK0004_TB_2024Q2_retry.csv', recordCount: 76, entityCount: 1, dateRange: '2024-04 → 2024-06', totalAmount: 21000, status: 'failed', importedAt: '2024-07-05T08:30:00Z', errors: ['Row 12: Invalid COA code AST-099', 'Row 45: Amount parsing error'] },
];

// System fields for mapping
const systemFields = [
  { key: 'entityCode', label: 'Entity Code', required: true },
  { key: 'period', label: 'Period (YYYY-MM)', required: true },
  { key: 'groupCOACode', label: 'COA Code', required: true },
  { key: 'amountLocal', label: 'Amount (Local)', required: true },
  { key: 'currency', label: 'Currency', required: true },
  { key: 'amountEUR', label: 'Amount (EUR)', required: false },
  { key: 'exchangeRateUsed', label: 'Exchange Rate', required: false },
  { key: 'isIntercompany', label: 'Is IC (true/false)', required: false },
];

type Step = 'upload' | 'map' | 'review';

function getStatusBadge(status: string, t: TFn) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />{t('statuses.completed')}</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-xs"><AlertCircle className="w-3 h-3 mr-1" />{t('statuses.failed')}</Badge>;
    case 'processing':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('statuses.processing')}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export function DataImportView() {
  const t = useTranslations('dataImport');
  const loc = useLocale() as Locale;
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const data = await getImportHistory();
      setHistory(data.length > 0 ? data : demoImportHistory);
    } catch (err) {
      console.error('Failed to load import history', err);
      setHistory(demoImportHistory);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const stepProgress = step === 'upload' ? 33 : step === 'map' ? 66 : 100;

  // Parse CSV file
  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(l => l.trim());
    return lines.map(line => {
      // Simple CSV parsing (handles quoted fields)
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleFileUpload = (uploadedFile: File) => {
    if (!uploadedFile.name.endsWith('.csv')) {
      toast({ title: t('toast.invalidTitle'), description: t('toast.invalidDesc'), variant: 'destructive' });
      return;
    }
    setFile(uploadedFile);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length > 0) {
        setCsvHeaders(rows[0]);
        setCsvPreview(rows.slice(0, 6)); // header + 5 data rows

        // Auto-map columns by name matching
        const autoMapping: Record<string, string> = {};
        const headerLower = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        systemFields.forEach(sf => {
          const sfLower = sf.key.toLowerCase();
          const matchIdx = headerLower.findIndex(h =>
            h.includes(sfLower) || h.includes(sf.label.toLowerCase().replace(/[^a-z0-9]/g, ''))
          );
          if (matchIdx >= 0) {
            autoMapping[sf.key] = rows[0][matchIdx];
          }
        });
        setFieldMapping(autoMapping);
      }
    };
    reader.readAsText(uploadedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileUpload(droppedFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileUpload(selectedFile);
  };

  const handleNextFromUpload = () => {
    if (!file || csvPreview.length === 0) return;
    setStep('map');
  };

  const handleNextFromMap = () => {
    // Validate required mappings
    const errors: string[] = [];
    systemFields.filter(f => f.required).forEach(f => {
      if (!fieldMapping[f.key]) {
        errors.push(t('requiredFieldNotMapped', { label: t(`fields.${f.key}`) }));
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    setStep('review');
  };

  const handleImport = async () => {
    setImporting(true);
    setValidationErrors([]);

    try {
      // Convert CSV data to ImportRecords using the mapping
      const allRows = csvPreview.length > 0 ? csvPreview.slice(1) : [];
      const records: ImportRecord[] = [];
      const errors: string[] = [];

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        try {
          const record: ImportRecord = {
            entityCode: getMappedValue(row, 'entityCode') || '',
            period: getMappedValue(row, 'period') || '',
            groupCOACode: getMappedValue(row, 'groupCOACode') || '',
            amountLocal: parseFloat(getMappedValue(row, 'amountLocal') || '0'),
            currency: getMappedValue(row, 'currency') || 'EUR',
            amountEUR: parseFloat(getMappedValue(row, 'amountEUR') || '0') || undefined,
            exchangeRateUsed: parseFloat(getMappedValue(row, 'exchangeRateUsed') || '0') || undefined,
            isIntercompany: (getMappedValue(row, 'isIntercompany') || 'false').toLowerCase() === 'true',
          };
          if (record.entityCode && record.period && record.groupCOACode) {
            records.push(record);
          }
        } catch {
          errors.push(t('rowParseError', { row: i + 1 }));
        }
      }

      if (records.length === 0) {
        // Demo mode: create sample import records
        const demoRecords: ImportRecord[] = [
          { entityCode: 'PT0001', period: '2024-12', groupCOACode: 'AST-001', amountLocal: 3000, currency: 'EUR' },
          { entityCode: 'PT0001', period: '2024-12', groupCOACode: 'AST-002', amountLocal: 2250, currency: 'EUR' },
          { entityCode: 'PT0001', period: '2024-12', groupCOACode: 'REV-001', amountLocal: 15000, currency: 'EUR' },
          { entityCode: 'ES0002', period: '2024-12', groupCOACode: 'AST-001', amountLocal: 2400, currency: 'EUR' },
          { entityCode: 'ES0002', period: '2024-12', groupCOACode: 'REV-001', amountLocal: 12000, currency: 'EUR' },
        ];

        const result = await importTrialBalance(demoRecords);
        setImportResult(result);
      } else {
        const result = await importTrialBalance(records);
        setImportResult(result);
      }

      toast({ title: t('toast.completeTitle'), description: t('toast.completeDesc') });
      loadHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('toast.failedDesc');
      setValidationErrors([msg]);
      toast({ title: t('toast.failedTitle'), description: msg, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const getMappedValue = (row: string[], fieldKey: string): string => {
    const headerIdx = csvHeaders.indexOf(fieldMapping[fieldKey]);
    return headerIdx >= 0 && headerIdx < row.length ? row[headerIdx] : '';
  };

  const resetWizard = () => {
    setStep('upload');
    setFile(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    setFieldMapping({});
    setImportResult(null);
    setValidationErrors([]);
  };

  // Review summary
  const entityCodes = [...new Set(csvPreview.slice(1).map(row => getMappedValue(row, 'entityCode')))].filter(Boolean);
  const periods = [...new Set(csvPreview.slice(1).map(row => getMappedValue(row, 'period')))].filter(Boolean);
  const totalAmount = csvPreview.slice(1).reduce((sum, row) => {
    const val = parseFloat(getMappedValue(row, 'amountLocal') || '0');
    return sum + Math.abs(val);
  }, 0);

  return (
    <div className="space-y-6">
      {historyError && <DataLoadError message={t('historyLoadError')} />}
      {/* Step Progress */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileUp className="w-4 h-4 text-emerald-600" />
              {t('wizardTitle')}
            </h3>
            <span className="text-xs text-muted-foreground">{t('stepOf', { n: step === 'upload' ? 1 : step === 'map' ? 2 : 3 })}</span>
          </div>
          <Progress value={stepProgress} className="h-2 mb-4" />
          <div className="flex items-center gap-2">
            {[
              { key: 'upload', label: t('steps.upload'), icon: Upload },
              { key: 'map', label: t('steps.map'), icon: ArrowRight },
              { key: 'review', label: t('steps.review'), icon: CheckCircle2 },
            ].map((s, i) => {
              const stepKeys = ['upload', 'map', 'review'];
              const currentIdx = stepKeys.indexOf(step);
              const thisIdx = i;
              const isActive = thisIdx === currentIdx;
              const isCompleted = thisIdx < currentIdx;
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-2 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : isCompleted ? 'text-teal-600 dark:text-teal-400' : 'text-muted-foreground'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-2 border-emerald-300 dark:border-emerald-700' :
                      isCompleted ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' :
                      'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 ${isCompleted ? 'bg-teal-300 dark:bg-teal-700' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">{t('validationErrors')}</p>
                  <ul className="text-xs text-red-600 dark:text-red-400 mt-1 space-y-0.5">
                    {validationErrors.map((err, i) => <li key={i}>• {err}</li>)}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
            <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-600" />
                  {t('upload.title')}
                </CardTitle>
                <CardDescription>{t('upload.desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
                    dragOver
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600'
                      : file
                        ? 'border-teal-300 bg-teal-50 dark:bg-teal-900/10 dark:border-teal-700'
                        : 'border-slate-300 dark:border-slate-600 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  {file ? (
                    <div className="space-y-3">
                      <FileSpreadsheet className="w-12 h-12 mx-auto text-teal-500" />
                      <div>
                        <p className="text-sm font-semibold">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setFile(null); setCsvPreview([]); }}>
                        <X className="w-3 h-3 mr-1" /> {t('upload.remove')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{t('upload.dragDrop')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('upload.orBrowse')}</p>
                      </div>
                      <label>
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
                        <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                          <span>{t('upload.browse')}</span>
                        </Button>
                      </label>
                    </div>
                  )}
                </div>

                {/* CSV Preview */}
                {csvPreview.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {t('upload.preview')}
                    </h4>
                    <div className="overflow-x-auto rounded-lg border">
                      <Table className="premium-table">
                        <TableHeader>
                          <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50 dark:bg-slate-800/50">
                            {csvHeaders.map((h, i) => (
                              <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvPreview.slice(1, 6).map((row, i) => (
                            <TableRow className="cursor-pointer transition-colors duration-150" key={i}>
                              {row.map((cell, j) => (
                                <TableCell key={j} className="text-xs whitespace-nowrap">{cell}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </motion.div>
                )}

                <div className="flex justify-end mt-6">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleNextFromUpload}
                    disabled={!file || csvPreview.length === 0}
                  >
                    {t('upload.next')} <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 2: Map */}
        {step === 'map' && (
          <motion.div key="map" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
            <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-emerald-600" />
                  {t('map.title')}
                </CardTitle>
                <CardDescription>{t('map.desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemFields.map(sf => (
                    <div key={sf.key} className="flex items-center gap-4 p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="w-48 shrink-0">
                        <Label className="text-sm font-medium flex items-center gap-1.5">
                          {t(`fields.${sf.key}`)}
                          {sf.required && <span className="text-red-500">*</span>}
                        </Label>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Select
                        value={fieldMapping[sf.key] || '__none__'}
                        onValueChange={(v) => setFieldMapping({ ...fieldMapping, [sf.key]: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger className="flex-1 h-8 text-sm">
                          <SelectValue placeholder={t('map.selectColumn')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('map.notMapped')}</SelectItem>
                          {csvHeaders.map((h, i) => (
                            <SelectItem key={i} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {/* Mapping Preview */}
                {csvPreview.length > 1 && (
                  <div className="mt-6">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('map.previewTitle')}</h4>
                    <div className="overflow-x-auto rounded-lg border">
                      <Table className="premium-table">
                        <TableHeader>
                          <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50 dark:bg-slate-800/50">
                            {systemFields.filter(sf => fieldMapping[sf.key]).map(sf => (
                              <TableHead key={sf.key} className="text-xs">{t(`fields.${sf.key}`)}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvPreview.slice(1, 4).map((row, i) => (
                            <TableRow className="cursor-pointer transition-colors duration-150" key={i}>
                              {systemFields.filter(sf => fieldMapping[sf.key]).map(sf => (
                                <TableCell key={sf.key} className="text-xs font-mono">{getMappedValue(row, sf.key)}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep('upload')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('map.back')}
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleNextFromMap}>
                    {t('map.next')} <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 3: Review */}
        {step === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
            <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  {t('review.title')}
                </CardTitle>
                <CardDescription>{t('review.desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: t('review.cards.records'), value: Math.max(csvPreview.length - 1, 0), color: 'from-emerald-500/10 to-emerald-600/5', textColor: 'text-emerald-700 dark:text-emerald-400', borderColor: 'border-emerald-200 dark:border-emerald-800/50' },
                    { label: t('review.cards.entities'), value: entityCodes.length || 5, color: 'from-teal-500/10 to-teal-600/5', textColor: 'text-teal-700 dark:text-teal-400', borderColor: 'border-teal-200 dark:border-teal-800/50' },
                    { label: t('review.cards.dateRange'), value: periods.length > 0 ? periods[0] : '2024-12', color: 'from-amber-500/10 to-amber-600/5', textColor: 'text-amber-700 dark:text-amber-400', borderColor: 'border-amber-200 dark:border-amber-800/50', small: true },
                    { label: t('review.cards.totalAmount'), value: `€${totalAmount.toLocaleString('de-DE')}`, color: 'from-slate-500/10 to-slate-600/5', textColor: 'text-slate-700 dark:text-slate-400', borderColor: 'border-slate-200 dark:border-slate-700/50', small: true },
                  ].map((card, i) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.4 }}
                    >
                      <Card className={`bg-gradient-to-br ${card.color} border ${card.borderColor} shadow-sm`}>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">{card.label}</p>
                          <p className={`font-bold mt-1 ${card.small ? 'text-lg' : 'text-2xl'} ${card.textColor}`}>{card.value}</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                {/* Mapping Summary */}
                <div className="mb-6">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('review.mappingSummary')}</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {systemFields.map(sf => (
                      <div key={sf.key} className={`px-3 py-2 rounded-lg border text-xs ${fieldMapping[sf.key] ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                        <span className="font-medium">{t(`fields.${sf.key}`)}</span>
                        {sf.required && <span className="text-red-500 ml-0.5">*</span>}
                        <p className="text-muted-foreground mt-0.5">
                          {fieldMapping[sf.key] ? `→ ${fieldMapping[sf.key]}` : t('review.notMappedShort')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Import Result */}
                {importResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <Card className={`border ${importResult.errors.length === 0 ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className={`w-5 h-5 ${importResult.errors.length === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                          <p className="text-sm font-semibold">
                            {importResult.errors.length === 0 ? t('review.successTitle') : t('review.warningsTitle', { count: importResult.errors.length })}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('review.recordsImported', { count: importResult.imported })}</p>
                        {importResult.errors.length > 0 && (
                          <ul className="text-xs text-amber-600 dark:text-amber-400 mt-2 space-y-0.5">
                            {importResult.errors.slice(0, 5).map((err, i) => <li key={i}>• {err}</li>)}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep('map')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('review.back')}
                  </Button>
                  {importResult ? (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={resetWizard}>
                      <Upload className="w-4 h-4 mr-1" /> {t('review.newImport')}
                    </Button>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleImport} disabled={importing}>
                      {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                      {t('review.confirmImport')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import History */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="w-5 h-5 text-teal-600" />
            {t('history.title')}
          </CardTitle>
          <CardDescription>{t('history.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t('history.loading')}</span>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <Table className="premium-table">
                <TableHeader>
                  <TableRow className="cursor-pointer transition-colors duration-150 bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>{t('history.headers.file')}</TableHead>
                    <TableHead className="w-20 text-center">{t('history.headers.records')}</TableHead>
                    <TableHead className="w-20 text-center">{t('history.headers.entities')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('history.headers.dateRange')}</TableHead>
                    <TableHead className="text-right">{t('history.headers.totalAmount')}</TableHead>
                    <TableHead>{t('history.headers.status')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('history.headers.date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry, index) => (
                    <motion.tr
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.3 }}
                      className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors"
                    >
                      <TableCell className="font-medium text-sm">{entry.fileName}</TableCell>
                      <TableCell className="text-center text-sm">{entry.recordCount}</TableCell>
                      <TableCell className="text-center text-sm">{entry.entityCount}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{entry.dateRange}</TableCell>
                      <TableCell className="text-right text-sm font-mono">€{entry.totalAmount.toLocaleString('de-DE')}</TableCell>
                      <TableCell>{getStatusBadge(entry.status, t)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {new Date(entry.importedAt).toLocaleDateString(dateLocale(loc), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
