'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Loader2, Clock, ArrowRight, RefreshCw, Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getCompliance, ComplianceData } from '@/lib/api';
import { ComplianceCheck, EntityCompliance, JurisdictionCompliance, Violation } from '@/lib/types';
import { DataLoadError } from '@/components/data-load-error';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { dateLocale, type Locale } from '@/i18n/locale-context';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

// Demo fallback data
const demoComplianceData: ComplianceData = {
  overallScore: 82,
  overallStatus: 'compliant',
  lastChecked: new Date().toISOString(),
  checks: [
    { id: 'bs-integrity', name: 'Balance Sheet Integrity', description: 'Assets = Liabilities + Equity (within tolerance)', category: 'financial', status: 'warning', score: 75, details: '4 of 5 entities pass balance check. 1 entity has minor imbalance.', affectedEntities: ['FR0005'] },
    { id: 'ic-matching', name: 'IC Transaction Matching', description: 'All IC transactions have matching pairs', category: 'financial', status: 'pass', score: 92, details: '12 of 13 IC transactions eliminated. 1 pending match.', affectedEntities: [] },
    { id: 'currency-translation', name: 'Currency Translation', description: 'All non-EUR entities have valid exchange rates', category: 'operational', status: 'pass', score: 100, details: '1 of 1 non-EUR entities have exchange rates.', affectedEntities: [] },
    { id: 'ownership-validation', name: 'Ownership Validation', description: 'Ownership percentages between 0-100%', category: 'regulatory', status: 'pass', score: 100, details: 'All 5 entities have valid ownership percentages (0-100%).', affectedEntities: [] },
    { id: 'tb-completeness', name: 'Trial Balance Completeness', description: 'All entities have trial balances for the period', category: 'operational', status: 'pass', score: 100, details: 'All 5 entities have trial balance data for 2024-12.', affectedEntities: [] },
    { id: 'coa-mapping', name: 'COA Mapping Coverage', description: 'All entity accounts mapped to group COA', category: 'operational', status: 'warning', score: 68, details: '3 of 5 entities have ≥80% COA mapping coverage.', affectedEntities: ['DE0003', 'FR0005'] },
    { id: 'consolidation-method', name: 'Consolidation Method', description: 'Correct method (full/proportional/equity) per ownership %', category: 'regulatory', status: 'warning', score: 70, details: '3 of 5 entities have correct consolidation method. Issues: FR0005: full (expected proportional for 50% ownership)', affectedEntities: ['FR0005'] },
    { id: 'minority-interest', name: 'Minority Interest Calculation', description: 'Calculated correctly for entities < 100% ownership', category: 'financial', status: 'warning', score: 65, details: '2 of 3 partially-owned entities have correct minority interest calculations.', affectedEntities: ['ES0002'] },
    { id: 'disclosure-requirements', name: 'Disclosure Requirements', description: 'Required disclosures per jurisdiction (EU, UK, DE, ES, FR, PT)', category: 'regulatory', status: 'pass', score: 85, details: '4 of 5 jurisdictions have adequate disclosure data.', affectedEntities: [] },
  ],
  entities: [
    { entityCode: 'PT0001', entityName: 'TechNova Portugal Lda', country: 'PT', overallScore: 95, checks: [
      { checkId: 'bs-integrity', status: 'pass', details: 'Balanced within tolerance' },
      { checkId: 'ic-matching', status: 'pass', details: 'All IC matched' },
      { checkId: 'currency-translation', status: 'pass', details: 'EUR entity' },
      { checkId: 'ownership-validation', status: 'pass', details: 'Valid' },
      { checkId: 'tb-completeness', status: 'pass', details: 'Complete' },
      { checkId: 'coa-mapping', status: 'pass', details: '95% coverage' },
      { checkId: 'consolidation-method', status: 'pass', details: 'Full (80%)' },
      { checkId: 'minority-interest', status: 'pass', details: 'N/A (100% owned)' },
      { checkId: 'disclosure-requirements', status: 'pass', details: 'SNC compliant' },
    ]},
    { entityCode: 'ES0002', entityName: 'TechNova España S.A.', country: 'ES', overallScore: 78, checks: [
      { checkId: 'bs-integrity', status: 'pass', details: 'Balanced within tolerance' },
      { checkId: 'ic-matching', status: 'pass', details: 'All IC matched' },
      { checkId: 'currency-translation', status: 'pass', details: 'EUR entity' },
      { checkId: 'ownership-validation', status: 'pass', details: 'Valid' },
      { checkId: 'tb-completeness', status: 'pass', details: 'Complete' },
      { checkId: 'coa-mapping', status: 'pass', details: '88% coverage' },
      { checkId: 'consolidation-method', status: 'pass', details: 'Full (70%)' },
      { checkId: 'minority-interest', status: 'warning', details: 'Calculation discrepancy' },
      { checkId: 'disclosure-requirements', status: 'pass', details: 'PGC compliant' },
    ]},
    { entityCode: 'DE0003', entityName: 'TechNova Deutschland GmbH', country: 'DE', overallScore: 82, checks: [
      { checkId: 'bs-integrity', status: 'pass', details: 'Balanced within tolerance' },
      { checkId: 'ic-matching', status: 'pass', details: 'All IC matched' },
      { checkId: 'currency-translation', status: 'pass', details: 'EUR entity' },
      { checkId: 'ownership-validation', status: 'pass', details: 'Valid' },
      { checkId: 'tb-completeness', status: 'pass', details: 'Complete' },
      { checkId: 'coa-mapping', status: 'warning', details: '72% coverage' },
      { checkId: 'consolidation-method', status: 'pass', details: 'Full (60%)' },
      { checkId: 'minority-interest', status: 'warning', details: 'HGB vs IFRS gap' },
      { checkId: 'disclosure-requirements', status: 'pass', details: 'HGB compliant' },
    ]},
    { entityCode: 'UK0004', entityName: 'TechNova UK Ltd', country: 'UK', overallScore: 88, checks: [
      { checkId: 'bs-integrity', status: 'pass', details: 'Balanced within tolerance' },
      { checkId: 'ic-matching', status: 'warning', details: '1 unmatched IC tx' },
      { checkId: 'currency-translation', status: 'pass', details: 'GBP rate available' },
      { checkId: 'ownership-validation', status: 'pass', details: 'Valid' },
      { checkId: 'tb-completeness', status: 'pass', details: 'Complete' },
      { checkId: 'coa-mapping', status: 'pass', details: '91% coverage' },
      { checkId: 'consolidation-method', status: 'pass', details: 'Full (90%)' },
      { checkId: 'minority-interest', status: 'pass', details: 'N/A (100% owned)' },
      { checkId: 'disclosure-requirements', status: 'pass', details: 'UK GAAP compliant' },
    ]},
    { entityCode: 'FR0005', entityName: 'TechNova France SAS', country: 'FR', overallScore: 62, checks: [
      { checkId: 'bs-integrity', status: 'warning', details: 'Imbalance of €827' },
      { checkId: 'ic-matching', status: 'pass', details: 'All IC matched' },
      { checkId: 'currency-translation', status: 'pass', details: 'EUR entity' },
      { checkId: 'ownership-validation', status: 'pass', details: 'Valid' },
      { checkId: 'tb-completeness', status: 'pass', details: 'Complete' },
      { checkId: 'coa-mapping', status: 'fail', details: '58% coverage' },
      { checkId: 'consolidation-method', status: 'fail', details: 'Full (should be proportional)' },
      { checkId: 'minority-interest', status: 'warning', details: 'Calculation needed' },
      { checkId: 'disclosure-requirements', status: 'warning', details: 'IFRS pending review' },
    ]},
  ],
  jurisdictions: [
    { countryCode: 'PT', countryName: 'Portugal', flag: '🇵🇹', framework: 'SNC', complianceScore: 95, filings: [
      { name: 'Demonstração Financeira Anual', deadline: '2025-04-30', status: 'pending' },
      { name: 'IES/Informação Empresarial Simplificada', deadline: '2025-07-15', status: 'pending' },
      { name: 'Modelo 22 (IRC)', deadline: '2025-05-31', status: 'pending' },
    ]},
    { countryCode: 'ES', countryName: 'Spain', flag: '🇪🇸', framework: 'PGC', complianceScore: 78, filings: [
      { name: 'Cuentas Anuales', deadline: '2025-04-30', status: 'pending' },
      { name: 'Declaración de IS', deadline: '2025-07-25', status: 'pending' },
      { name: 'Modelo 200', deadline: '2025-06-30', status: 'filed' },
    ]},
    { countryCode: 'DE', countryName: 'Germany', flag: '🇩🇪', framework: 'HGB', complianceScore: 82, filings: [
      { name: 'Jahresabschluss', deadline: '2025-06-30', status: 'pending' },
      { name: 'Einkommensteuererklärung', deadline: '2025-07-31', status: 'pending' },
      { name: 'Umsatzsteuererklärung', deadline: '2025-05-31', status: 'filed' },
    ]},
    { countryCode: 'UK', countryName: 'United Kingdom', flag: '🇬🇧', framework: 'UK GAAP', complianceScore: 88, filings: [
      { name: 'Annual Accounts (Companies House)', deadline: '2025-06-30', status: 'pending' },
      { name: 'Corporation Tax Return (CT600)', deadline: '2025-06-30', status: 'pending' },
      { name: 'Confirmation Statement', deadline: '2025-06-30', status: 'filed' },
    ]},
    { countryCode: 'FR', countryName: 'France', flag: '🇫🇷', framework: 'IFRS', complianceScore: 62, filings: [
      { name: 'Liasse Fiscale', deadline: '2025-05-20', status: 'overdue' },
      { name: 'Déclaration de Résultat', deadline: '2025-04-30', status: 'overdue' },
      { name: 'Déclaration IS', deadline: '2025-05-20', status: 'pending' },
    ]},
  ],
  recentViolations: [
    { id: 'v1', severity: 'critical', entityCode: 'FR0005', description: 'COA Mapping Coverage: Only 58% of accounts mapped to group COA', detectedAt: new Date().toISOString(), remediation: 'Map remaining 42% of local accounts to group COA codes for FR0005.', status: 'open' },
    { id: 'v2', severity: 'critical', entityCode: 'FR0005', description: 'Consolidation Method: Full consolidation applied but ownership is 50% (should be proportional)', detectedAt: new Date().toISOString(), remediation: 'Change FR0005 consolidation method from full to proportional.', status: 'open' },
    { id: 'v3', severity: 'warning', entityCode: 'DE0003', description: 'COA Mapping Coverage: 72% coverage — below 80% threshold', detectedAt: new Date(Date.now() - 86400000).toISOString(), remediation: 'Map additional DE0003 local accounts to group COA.', status: 'in_progress' },
    { id: 'v4', severity: 'warning', entityCode: 'ES0002', description: 'Minority Interest Calculation: Discrepancy in minority interest for 70% ownership', detectedAt: new Date(Date.now() - 172800000).toISOString(), remediation: 'Recalculate minority interest for ES0002 (30% non-controlling).', status: 'in_progress' },
    { id: 'v5', severity: 'warning', entityCode: 'FR0005', description: 'Balance Sheet Integrity: Imbalance of €827 detected', detectedAt: new Date(Date.now() - 259200000).toISOString(), remediation: 'Review FR0005 trial balance entries for rounding or data entry errors.', status: 'in_progress' },
    { id: 'v6', severity: 'info', entityCode: 'PT0001', description: 'Annual filing deadline approaching for SNC compliance', detectedAt: new Date(Date.now() - 604800000).toISOString(), remediation: 'Prepare and submit annual financial statements before deadline.', status: 'open' },
    { id: 'v7', severity: 'info', entityCode: 'UK0004', description: 'GBP exchange rate may need update — last ECB rate is 3+ days old', detectedAt: new Date(Date.now() - 604800000).toISOString(), remediation: 'Verify ECB rate feed is active or manually update GBP rates.', status: 'resolved' },
  ],
  trend: [
    { period: '2024-07', score: 70 },
    { period: '2024-08', score: 72 },
    { period: '2024-09', score: 75 },
    { period: '2024-10', score: 78 },
    { period: '2024-11', score: 80 },
    { period: '2024-12', score: 82 },
  ],
};

// Status icon helper
function StatusIcon({ status, size = 'sm' }: { status: 'pass' | 'warning' | 'fail'; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  const cls = sizeClasses[size];
  switch (status) {
    case 'pass': return <CheckCircle2 className={`${cls} text-emerald-500`} />;
    case 'warning': return <AlertTriangle className={`${cls} text-amber-500`} />;
    case 'fail': return <XCircle className={`${cls} text-red-500`} />;
  }
}

// Score gauge component (SVG circular gauge)
function ScoreGauge({ score, size = 160, label = 'Score' }: { score: number; size?: number; label?: string }) {
  const strokeWidth = size > 120 ? 12 : 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const bgColor = score >= 80 ? 'rgba(16,185,129,0.1)' : score >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={center} cy={center} r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-200 dark:text-slate-700"
        />
        {/* Progress circle */}
        <circle
          cx={center} cy={center} r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}

// Category badge config
const categoryConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  financial: { label: 'Financial', color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', borderColor: 'border-emerald-300 dark:border-emerald-700' },
  regulatory: { label: 'Regulatory', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30', borderColor: 'border-amber-300 dark:border-amber-700' },
  operational: { label: 'Operational', color: 'text-teal-700 dark:text-teal-400', bgColor: 'bg-teal-100 dark:bg-teal-900/30', borderColor: 'border-teal-300 dark:border-teal-700' },
};

const severityConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30', borderColor: 'border-red-300 dark:border-red-700' },
  warning: { label: 'Warning', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30', borderColor: 'border-amber-300 dark:border-amber-700' },
  info: { label: 'Info', color: 'text-slate-700 dark:text-slate-400', bgColor: 'bg-slate-100 dark:bg-slate-800/50', borderColor: 'border-slate-300 dark:border-slate-600' },
};

const violationStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  open: { label: 'Open', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  in_progress: { label: 'In Progress', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  resolved: { label: 'Resolved', color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
};

const filingStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  filed: { label: 'Filed', color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  pending: { label: 'Pending', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  overdue: { label: 'Overdue', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

// Custom tooltip for trend chart
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 dark:bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-slate-700">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          Score: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function ComplianceView() {
  const t = useTranslations('compliance');
  const loc = useLocale() as Locale;
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await getCompliance({ period: '2024-12' });
      if (result && result.checks && result.checks.length > 0) {
        setData(result);
      } else {
        setData(demoComplianceData);
      }
    } catch (err) {
      console.error('Failed to load compliance data', err);
      setData(demoComplianceData);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const statusLabel = data.overallStatus === 'compliant' ? t('statuses.compliant') : data.overallStatus === 'warning' ? t('statuses.warning') : t('statuses.nonCompliant');
  const statusColor = data.overallScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : data.overallScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  const statusBg = data.overallScore >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700' : data.overallScore >= 60 ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700' : 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700';

  const passCount = data.checks.filter(c => c.status === 'pass').length;
  const warningCount = data.checks.filter(c => c.status === 'warning').length;
  const failCount = data.checks.filter(c => c.status === 'fail').length;

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError />}
      {/* Overall Score + Summary Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overall Compliance Score Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 border shadow-md h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <ScoreGauge score={data.overallScore} size={160} label={t('score')} />
              <div className="mt-4">
                <Badge className={`${statusBg} ${statusColor} border text-sm font-semibold px-4 py-1`}>
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t('lastChecked', { date: new Date(data.lastChecked).toLocaleString(dateLocale(loc), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs gap-1"
                onClick={loadData}
              >
                <RefreshCw className="w-3 h-3" />
                {t('recheck')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Summary Stats */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { key: 'passing', label: t('summary.passing'), count: passCount, total: data.checks.length, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', gradient: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-200 dark:border-emerald-800/50' },
            { key: 'warnings', label: t('summary.warnings'), count: warningCount, total: data.checks.length, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', gradient: 'from-amber-500/10 to-amber-600/5', border: 'border-amber-200 dark:border-amber-800/50' },
            { key: 'failing', label: t('summary.failing'), count: failCount, total: data.checks.length, icon: XCircle, color: 'text-red-600 dark:text-red-400', gradient: 'from-red-500/10 to-red-600/5', border: 'border-red-200 dark:border-red-800/50' },
          ].map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
              >
                <Card className={`bg-gradient-to-br ${card.gradient} border ${card.border} shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-shadow duration-300 h-full`}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{card.label}</p>
                      <Icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <p className={`text-3xl font-bold ${card.color}`}>{card.count}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('ofChecks', { total: card.total })}</p>
                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(card.count / card.total) * 100}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className={`h-full rounded-full ${card.key === 'passing' ? 'bg-emerald-500' : card.key === 'warnings' ? 'bg-amber-500' : 'bg-red-500'}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {/* Compliance Trend Chart */}
          <motion.div
            className="sm:col-span-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <Card className="shadow-sm border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  {t('trendTitle')}
                </CardTitle>
                <CardDescription className="text-xs">{t('trendDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis domain={[50, 100]} tick={{ fontSize: 10 }} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1} label={{ value: t('target'), position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, fill: '#10b981' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Compliance Checks Grid */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-600" />
          {t('regulatoryChecks')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.checks.map((check, i) => {
            const cat = categoryConfig[check.category];
            const isExpanded = expandedCheck === check.id;
            const checkName = t.has(`checks.${check.id}.name`) ? t(`checks.${check.id}.name`) : check.name;
            const checkDesc = t.has(`checks.${check.id}.description`) ? t(`checks.${check.id}.description`) : check.description;

            return (
              <motion.div
                key={check.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
              >
                <Card
                  className={`shadow-sm border border-slate-200/60 dark:border-slate-700/40 cursor-pointer hover:shadow-md transition-all duration-200 ${
                    check.status === 'pass'
                      ? 'border-emerald-200 dark:border-emerald-800/50'
                      : check.status === 'warning'
                      ? 'border-amber-200 dark:border-amber-800/50'
                      : 'border-red-200 dark:border-red-800/50'
                  }`}
                  onClick={() => setExpandedCheck(isExpanded ? null : check.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIcon status={check.status} size="md" />
                          <p className="text-sm font-semibold truncate">{checkName}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">{checkDesc}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <Badge className={`${cat.bgColor} ${cat.color} border ${cat.borderColor} text-[10px]`}>
                          {t(`categories.${check.category}`)}
                        </Badge>
                        <span className={`text-lg font-bold mt-1 ${check.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : check.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                          {check.score}%
                        </span>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${check.score}%` }}
                        transition={{ duration: 0.6, delay: i * 0.05 }}
                        className={`h-full rounded-full ${check.score >= 80 ? 'bg-emerald-500' : check.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      />
                    </div>

                    {/* Expand indicator */}
                    <div className="flex items-center justify-center mt-2">
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <Separator className="my-3" />
                          <p className="text-xs text-muted-foreground leading-relaxed">{check.details}</p>
                          {check.affectedEntities.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('affectedEntities')}</p>
                              <div className="flex flex-wrap gap-1">
                                {check.affectedEntities.map(e => (
                                  <Badge key={e} variant="outline" className="text-[10px] font-mono">{e}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Entity Compliance Matrix */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-600" />
          {t('matrixTitle')}
        </h3>
        <Card className="shadow-sm border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 min-w-[140px]">{t('checkEntity')}</th>
                    {data.entities.map(e => (
                      <th key={e.entityCode} className="text-center px-3 py-3 font-semibold min-w-[90px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{e.entityCode}</span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-slate-900 text-white text-xs border-slate-700">
                              <p className="font-medium">{e.entityName}</p>
                              <p className="text-slate-400 text-[10px]">{e.country} · Score: {e.overallScore}%</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.checks.map((check, rowIdx) => (
                    <tr key={check.id} className={`border-b border-slate-100 dark:border-slate-800 ${rowIdx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
                      <td className="px-4 py-2.5 font-medium sticky left-0 bg-white dark:bg-slate-950 z-10 border-r border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={check.status} />
                          <span className="truncate">{t.has(`checks.${check.id}.name`) ? t(`checks.${check.id}.name`) : check.name}</span>
                        </div>
                      </td>
                      {data.entities.map(entity => {
                        const entityCheck = entity.checks.find(c => c.checkId === check.id);
                        const status = entityCheck?.status || 'pass';
                        return (
                          <td key={entity.entityCode} className="text-center px-3 py-2.5">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex cursor-help">
                                    <StatusIcon status={status} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="bg-slate-900 text-white text-xs border-slate-700 max-w-[200px]">
                                  <p className="font-medium">{t.has(`checks.${check.id}.name`) ? t(`checks.${check.id}.name`) : check.name}</p>
                                  <p className="text-slate-400 text-[10px]">{entityCheck?.details || t('na')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-emerald-50/80 dark:bg-emerald-900/20 border-t-2 border-emerald-200 dark:border-emerald-700">
                    <td className="px-4 py-2.5 font-bold sticky left-0 bg-emerald-50/80 dark:bg-emerald-900/20 z-10 border-r border-slate-100 dark:border-slate-800">
                      {t('overallScore')}
                    </td>
                    {data.entities.map(entity => (
                      <td key={entity.entityCode} className="text-center px-3 py-2.5">
                        <span className={`font-bold ${entity.overallScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : entity.overallScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                          {entity.overallScore}%
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Jurisdiction Compliance */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-600" />
          {t('jurisdictionTitle')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {data.jurisdictions.map((jur, i) => {
            const filedCount = jur.filings.filter(f => f.status === 'filed').length;
            const overdueCount = jur.filings.filter(f => f.status === 'overdue').length;

            return (
              <motion.div
                key={jur.countryCode}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.35 }}
              >
                <Card className={`shadow-sm border border-slate-200/60 dark:border-slate-700/40 hover:shadow-md transition-all ${
                  jur.complianceScore >= 80 ? 'border-emerald-200 dark:border-emerald-800/50' :
                  jur.complianceScore >= 60 ? 'border-amber-200 dark:border-amber-800/50' :
                  'border-red-200 dark:border-red-800/50'
                }`}>
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{jur.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{jur.countryName}</p>
                        <Badge variant="outline" className="text-[9px] font-mono">{jur.framework}</Badge>
                      </div>
                      <span className={`text-lg font-bold ${
                        jur.complianceScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        jur.complianceScore >= 60 ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {jur.complianceScore}%
                      </span>
                    </div>

                    {/* Score bar */}
                    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${jur.complianceScore}%` }}
                        transition={{ duration: 0.6, delay: i * 0.08 }}
                        className={`h-full rounded-full ${jur.complianceScore >= 80 ? 'bg-emerald-500' : jur.complianceScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      />
                    </div>

                    {/* Filings */}
                    <div className="space-y-1.5">
                      {jur.filings.map((filing, fi) => {
                        const fConfig = filingStatusConfig[filing.status];
                        return (
                          <div key={fi} className="flex items-center justify-between gap-1">
                            <p className="text-[10px] text-muted-foreground truncate flex-1">{filing.name}</p>
                            <Badge className={`${fConfig.bgColor} ${fConfig.color} text-[8px] px-1.5 py-0 shrink-0`}>
                              {t(`filingStatuses.${filing.status}`)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary */}
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {t('filedCount', { filed: filedCount, total: jur.filings.length })}
                      </span>
                      {overdueCount > 0 && (
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                          {t('overdueCount', { count: overdueCount })}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Gradient divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 dark:via-emerald-700 to-transparent" />

      {/* Recent Violations / Warnings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            {t('violationsTitle')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            onClick={() => {
              const headers = [t('csv.severity'), t('csv.entity'), t('csv.description'), t('csv.status'), t('csv.detected')];
              const rows = data.recentViolations.map(v => [v.severity, v.entityCode, v.description, v.status, v.detectedAt]);
              const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `compliance-violations-${new Date().toISOString().split('T')[0]}.csv`;
              link.click();
              URL.revokeObjectURL(link.href);
            }}
          >
            <Download className="w-3 h-3" />
            {t('export')}
          </Button>
        </div>
        <Card className="shadow-sm border">
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              {data.recentViolations.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  {t('noViolations')}
                </div>
              ) : (
                <AnimatePresence>
                  {data.recentViolations.map((violation, index) => {
                    const sevConfig = severityConfig[violation.severity];
                    const stConfig = violationStatusConfig[violation.status];
                    const detected = new Date(violation.detectedAt);
                    const dateStr = detected.toLocaleDateString(dateLocale(loc), { month: 'short', day: 'numeric' });
                    const timeStr = detected.toLocaleTimeString(dateLocale(loc), { hour: '2-digit', minute: '2-digit' });

                    return (
                      <motion.div
                        key={violation.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.3 }}
                        className={`flex gap-4 p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors ${
                          index % 2 === 1 ? 'bg-slate-50/30 dark:bg-slate-900/20' : ''
                        }`}
                      >
                        {/* Severity indicator */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${sevConfig.bgColor} border ${sevConfig.borderColor}`}>
                            {violation.severity === 'critical' ? <XCircle className="w-4 h-4 text-red-500" /> :
                             violation.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
                             <CheckCircle2 className="w-4 h-4 text-slate-500" />}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                            <div className="flex-1">
                              <p className="text-sm font-medium leading-snug">{violation.description}</p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <Badge className={`${sevConfig.bgColor} ${sevConfig.color} border ${sevConfig.borderColor} text-[10px]`}>
                                  {t(`severities.${violation.severity}`)}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] font-mono">{violation.entityCode}</Badge>
                                <Badge className={`${stConfig.bgColor} ${stConfig.color} text-[10px]`}>
                                  {t(`violationStatuses.${violation.status}`)}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-medium">{dateStr}</p>
                              <p className="text-[10px] text-muted-foreground">{timeStr}</p>
                            </div>
                          </div>
                          {/* Remediation */}
                          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                            <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" />
                            <span>{violation.remediation}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
