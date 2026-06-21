'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, TrendingUp, Scale, Receipt, ArrowLeftRight,
  Building2, GitBranch, ShieldCheck, Download, Loader2,
  Calendar, Clock, X, ChevronRight, Table2, FileSpreadsheet, CheckCircle2, ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { getReports, generateReport, exportExcel, exportPDF } from '@/lib/api';
import { formatNumber as formatGrouped } from '@/lib/format';
import { DataLoadError } from '@/components/data-load-error';
import { ReportTemplate, GeneratedReport } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';

// Report templates
const reportTemplates: ReportTemplate[] = [
  {
    id: 'rt1', reportType: 'consolidated-income', title: 'Consolidated Income Statement',
    description: 'Group-level P&L with IC eliminations and minority interest adjustments',
    icon: 'TrendingUp', lastGenerated: '2024-12-15', category: 'financial',
  },
  {
    id: 'rt2', reportType: 'consolidated-balance-sheet', title: 'Consolidated Balance Sheet',
    description: 'Group balance sheet with goodwill, minority interest, and IC elimination entries',
    icon: 'Scale', lastGenerated: '2024-12-15', category: 'financial',
  },
  {
    id: 'rt3', reportType: 'consolidated-cash-flow', title: 'Consolidated Cash Flow Statement',
    description: 'Group cash flow with operating, investing, and financing activities',
    icon: 'Receipt', lastGenerated: '2024-12-14', category: 'financial',
  },
  {
    id: 'rt4', reportType: 'variance-analysis', title: 'Variance Analysis Report',
    description: 'Budget vs actual and forecast vs actual with detailed line-item breakdowns',
    icon: 'Table2', lastGenerated: '2024-12-13', category: 'analysis',
  },
  {
    id: 'rt5', reportType: 'ic-elimination', title: 'Intercompany Elimination Report',
    description: 'Detailed IC elimination journal entries with matching status and amounts',
    icon: 'ArrowLeftRight', lastGenerated: '2024-12-15', category: 'compliance',
  },
  {
    id: 'rt6', reportType: 'entity-comparison', title: 'Entity Comparison Report',
    description: 'Side-by-side comparison of all group entities with key financial metrics',
    icon: 'Building2', lastGenerated: '2024-12-12', category: 'analysis',
  },
  {
    id: 'rt7', reportType: 'scenario-impact', title: 'Scenario Impact Report',
    description: 'Impact analysis of optimistic, base, and pessimistic scenarios on group financials',
    icon: 'GitBranch', lastGenerated: '2024-12-11', category: 'analysis',
  },
  {
    id: 'rt8', reportType: 'audit-trail', title: 'Audit Trail Report',
    description: 'Complete audit log of all consolidation runs, data imports, and system changes',
    icon: 'ShieldCheck', lastGenerated: '2024-12-15', category: 'compliance',
  },
];

const iconMap: Record<string, React.ElementType> = {
  TrendingUp, Scale, Receipt, ArrowLeftRight, Building2, GitBranch, ShieldCheck, Table2,
};

const categoryConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  financial: { label: 'Financial', color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  analysis: { label: 'Analysis', color: 'text-teal-700 dark:text-teal-400', bgColor: 'bg-teal-100 dark:bg-teal-900/30' },
  compliance: { label: 'Compliance', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
};

// Demo report data for preview
const demoReportData: Record<string, { headers: string[]; rows: (string | number)[][]; title: string }> = {
  'consolidated-income': {
    title: 'Consolidated Income Statement',
    headers: ['Line Item', 'PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005', 'Eliminations', 'Consolidated'],
    rows: [
      ['Revenue', 18500, 14200, 11800, 9600, 7800, -450, 61450],
      ['Cost of Goods Sold', -10200, -7800, -6500, -5200, -4300, 450, -33550],
      ['Gross Profit', 8300, 6400, 5300, 4400, 3500, 0, 27900],
      ['Operating Expenses', -4800, -3600, -3100, -2600, -2100, 0, -16200],
      ['EBITDA', 3500, 2800, 2200, 1800, 1400, 0, 11700],
      ['Depreciation & Amort.', -850, -680, -520, -430, -350, 0, -2830],
      ['EBIT', 2650, 2120, 1680, 1370, 1050, 0, 8870],
      ['Interest Expense', -320, -250, -190, -160, -130, 0, -1050],
      ['Earnings Before Tax', 2330, 1870, 1490, 1210, 920, 0, 7820],
      ['Income Tax', -699, -561, -447, -363, -276, 0, -2346],
      ['Net Income', 1631, 1309, 1043, 847, 644, 0, 5474],
      ['Minority Interest', 0, 0, 0, 0, -322, 0, -322],
      ['Attributable to Parent', 1631, 1309, 1043, 847, 322, 0, 5152],
    ],
  },
  'consolidated-balance-sheet': {
    title: 'Consolidated Balance Sheet',
    headers: ['Line Item', 'PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005', 'Eliminations', 'Consolidated'],
    rows: [
      ['Cash & Equivalents', 3200, 2400, 1800, 1500, 1100, 0, 10000],
      ['Accounts Receivable', 4500, 3400, 2800, 2200, 1700, -280, 14320],
      ['IC Receivables', 1200, 800, 600, 400, 300, -3300, 0],
      ['Inventory', 2800, 2100, 1700, 1300, 1000, 0, 8900],
      ['Current Assets', 11700, 8700, 6900, 5400, 4100, -3580, 33220],
      ['PP&E', 8500, 6400, 5200, 4000, 3100, 0, 27200],
      ['Intangible Assets', 2200, 1600, 1300, 1000, 800, 0, 6900],
      ['Goodwill', 0, 0, 0, 1500, 2200, 0, 3700],
      ['Non-Current Assets', 10700, 8000, 6500, 6500, 6100, 0, 37800],
      ['Total Assets', 22400, 16700, 13400, 11900, 10200, -3580, 71020],
      ['Accounts Payable', 3100, 2300, 1900, 1500, 1100, 0, 9900],
      ['IC Payables', 1100, 700, 500, 400, 300, -3000, 0],
      ['Short-Term Debt', 2000, 1500, 1200, 900, 700, 0, 6300],
      ['Current Liabilities', 6200, 4500, 3600, 2800, 2100, -3000, 16200],
      ['Long-Term Debt', 5400, 4000, 3200, 2600, 2000, 0, 17200],
      ['Total Liabilities', 11600, 8500, 6800, 5400, 4100, -3000, 33400],
      ['Share Capital', 5000, 3800, 3000, 2500, 3500, 0, 17800],
      ['Retained Earnings', 5800, 4400, 3600, 4000, 3600, -580, 20820],
      ['Minority Interest', 0, 0, 0, 0, -1000, -580, -1000],
      ['Total Equity', 10800, 8200, 6600, 6500, 6100, -580, 37620],
      ['Balance Check', 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'consolidated-cash-flow': {
    title: 'Consolidated Cash Flow Statement',
    headers: ['Line Item', 'Q4 2024', 'Q3 2024', 'Q2 2024', 'YTD 2024'],
    rows: [
      ['Net Income', 5474, 5120, 4890, 15484],
      ['Depreciation & Amortization', 2830, 2710, 2650, 8190],
      ['Changes in Working Capital', -420, -380, -350, -1150],
      ['Operating Cash Flow', 7884, 7450, 7190, 22524],
      ['Capital Expenditure', -2400, -2200, -2100, -6700],
      ['Acquisitions', 0, -1500, 0, -1500],
      ['Investing Cash Flow', -2400, -3700, -2100, -8200],
      ['Debt Issuance', 500, 0, 1000, 1500],
      ['Debt Repayment', -1800, -1600, -1400, -4800],
      ['Dividends Paid', -2200, -2000, -2000, -6200],
      ['Financing Cash Flow', -3500, -3600, -2400, -9500],
      ['Net Change in Cash', 1984, 150, 2690, 4824],
      ['Beginning Cash', 8016, 7866, 5176, 5176],
      ['Ending Cash', 10000, 8016, 7866, 10000],
    ],
  },
  'variance-analysis': {
    title: 'Variance Analysis Report',
    headers: ['Metric', 'Actual', 'Budget', 'Variance', 'Variance %', 'Forecast', 'F/C Var'],
    rows: [
      ['Revenue', 61450, 60000, 1450, '2.4%', 60500, 950],
      ['COGS', -33550, -32000, -1550, '-4.8%', -32200, -1350],
      ['Gross Profit', 27900, 28000, -100, '-0.4%', 28300, -400],
      ['EBITDA', 11700, 11500, 200, '1.7%', 11600, 100],
      ['Net Income', 5474, 5200, 274, '5.3%', 5350, 124],
      ['Total Assets', 71020, 70000, 1020, '1.5%', 70500, 520],
      ['Total Debt', 23500, 24000, -500, '-2.1%', 23800, -300],
    ],
  },
  'ic-elimination': {
    title: 'Intercompany Elimination Report',
    headers: ['Elimination', 'From Entity', 'To Entity', 'Type', 'Amount (EUR)', 'Status'],
    rows: [
      ['EG-01', 'PT0001', 'ES0002', 'Sale/Purchase', 450000, 'Eliminated'],
      ['EG-02', 'PT0001', 'DE0003', 'Service/Purchase', 280000, 'Eliminated'],
      ['EG-03', 'UK0004', 'PT0001', 'Service/Sale', 227442, 'Pending'],
      ['EG-04', 'FR0005', 'ES0002', 'Sale/Purchase', 175000, 'Pending'],
      ['EG-05', 'DE0003', 'FR0005', 'Loan', 120000, 'Unmatched'],
      ['EG-06', 'PT0001', 'FR0005', 'Dividend', 95000, 'Unmatched'],
    ],
  },
  'entity-comparison': {
    title: 'Entity Comparison Report',
    headers: ['Metric', 'PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'],
    rows: [
      ['Revenue (€K)', 18500, 14200, 11800, 9600, 7800],
      ['EBITDA (€K)', 3500, 2800, 2200, 1800, 1400],
      ['Net Income (€K)', 1631, 1309, 1043, 847, 644],
      ['Total Assets (€K)', 22400, 16700, 13400, 11900, 10200],
      ['EBITDA Margin', '18.9%', '19.7%', '18.6%', '18.8%', '17.9%'],
      ['ROE', '15.1%', '16.0%', '15.8%', '13.0%', '10.6%'],
      ['Debt/Equity', '0.68', '0.67', '0.71', '0.55', '0.58'],
      ['Ownership', '100%', '100%', '100%', '100%', '50%'],
    ],
  },
  'scenario-impact': {
    title: 'Scenario Impact Report',
    headers: ['Metric', 'Pessimistic', 'Base Case', 'Optimistic', 'Δ Pess→Base', 'Δ Base→Opt'],
    rows: [
      ['Revenue', 55305, 61450, 68617, '11.1%', '11.7%'],
      ['EBITDA', 9945, 11700, 14040, '17.6%', '20.0%'],
      ['Net Income', 4164, 5474, 7033, '31.5%', '28.5%'],
      ['EBITDA Margin', '18.0%', '19.0%', '20.5%', '+1.0pp', '+1.5pp'],
      ['ROE', '12.8%', '14.5%', '17.2%', '+1.7pp', '+2.7pp'],
      ['Leverage', '0.85', '0.63', '0.48', '-0.22', '-0.15'],
    ],
  },
  'audit-trail': {
    title: 'Audit Trail Report',
    headers: ['Timestamp', 'Action', 'User', 'Description', 'Entities'],
    rows: [
      ['2024-12-15 14:30', 'Consolidation', 'System', 'Full consolidation run for Dec 2024', 'All 5'],
      ['2024-12-15 10:35', 'Import', 'Data Pipeline', 'Trial balance import: ES0002 Q4', 'ES0002'],
      ['2024-12-15 10:30', 'Import', 'Data Pipeline', 'Trial balance import: PT0001 Q4', 'PT0001'],
      ['2024-12-14 09:10', 'FX Update', 'ECB Feed', 'GBP closing rate → 0.8571', 'UK0004'],
      ['2024-12-14 09:00', 'Import', 'Data Pipeline', 'Trial balance import: DE0003 Q4', 'DE0003'],
      ['2024-12-13 16:45', 'Import', 'Admin', 'Trial balance import: FR0005 Q4', 'FR0005'],
      ['2024-12-12 11:00', 'Consolidation', 'System', 'Full consolidation run for Nov 2024', 'All 5'],
      ['2024-12-10 14:20', 'Entity Update', 'Admin', 'FR0005 ownership → 50%', 'FR0005'],
    ],
  },
};

function formatNumber(value: string | number): string {
  if (typeof value === 'string') return value;
  if (value === 0) return '—';
  // de-DE grouping (1.234.567), consistent with the rest of the app.
  return Math.abs(value) >= 1000 ? formatGrouped(value) : value.toString();
}

function isRowHighlight(label: string): boolean {
  const highlights = ['Gross Profit', 'EBITDA', 'EBIT', 'Net Income', 'Attributable to Parent',
    'Current Assets', 'Non-Current Assets', 'Total Assets', 'Current Liabilities',
    'Total Liabilities', 'Total Equity', 'Operating Cash Flow', 'Investing Cash Flow',
    'Financing Cash Flow', 'Net Change in Cash', 'Ending Cash', 'Balance Check'];
  return highlights.includes(label);
}

function isRowSubtotal(label: string): boolean {
  const subtotals = ['Gross Profit', 'EBITDA', 'EBIT', 'Earnings Before Tax', 'Net Income',
    'Attributable to Parent', 'Current Assets', 'Total Assets', 'Current Liabilities',
    'Total Liabilities', 'Total Equity', 'Operating Cash Flow', 'Net Change in Cash', 'Ending Cash'];
  return subtotals.includes(label);
}

function exportReportAsCSV(reportType: string) {
  const report = demoReportData[reportType];
  if (!report) return;

  const headers = report.headers.join(',');
  const rows = report.rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const csvContent = [headers, rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${reportType}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportReportAsExcel(reportType: string) {
  const report = demoReportData[reportType];
  if (!report) return;

  // Generate a CSV with BOM that Excel will open properly with UTF-8
  const BOM = '\uFEFF';
  const headers = report.headers.join('\t');
  const rows = report.rows.map(r => r.map(v => String(v)).join('\t')).join('\n');
  const content = BOM + [headers, rows].join('\n');

  const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${reportType}-${new Date().toISOString().split('T')[0]}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ReportsView() {
  const { selectedPeriod, selectedScenario } = useAppStore();
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getReports();
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports', err);
      setReports([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async (reportType: string) => {
    setGenerating(reportType);
    try {
      await generateReport({
        reportType,
        period: selectedPeriod,
        scenarioType: 'base',
      });
    } catch {
      // Silently handle, demo data will be shown
    } finally {
      setGenerating(null);
      setPreviewReport(reportType);
      setGeneratedCount(prev => prev + 1);
    }
  };

  const handleExportExcel = async (reportType: string) => {
    try {
      const blob = await exportExcel({ reportType, period: selectedPeriod, scenarioType: selectedScenario });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportType}-${selectedPeriod}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback to local export
      exportReportAsExcel(reportType);
    }
  };

  const handleExportPDF = async (reportType: string) => {
    try {
      const mapReportType = (rt: string): string => {
        if (rt.includes('income')) return 'income_statement';
        if (rt.includes('balance')) return 'balance_sheet';
        if (rt.includes('cash')) return 'cash_flow';
        return 'consolidated_all';
      };
      const blob = await exportPDF({ reportType: mapReportType(reportType), period: selectedPeriod, scenarioType: selectedScenario });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportType}-${selectedPeriod}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      console.error('PDF export failed');
    }
  };

  const recentReports = [
    ...reports.slice(0, 5),
    // Add demo recent reports
    { id: 'rr1', reportType: 'consolidated-income', title: 'Consolidated Income Statement', period: '2024-12', scenarioType: 'base', entityCodes: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'], generatedAt: '2024-12-15T14:30:00Z', format: 'CSV' },
    { id: 'rr2', reportType: 'consolidated-balance-sheet', title: 'Consolidated Balance Sheet', period: '2024-12', scenarioType: 'base', entityCodes: ['PT0001', 'ES0002', 'DE0003', 'UK0004', 'FR0005'], generatedAt: '2024-12-15T14:31:00Z', format: 'Excel' },
    { id: 'rr3', reportType: 'ic-elimination', title: 'IC Elimination Report', period: '2024-12', scenarioType: 'base', entityCodes: [], generatedAt: '2024-12-15T14:32:00Z', format: 'PDF' },
    { id: 'rr4', reportType: 'entity-comparison', title: 'Entity Comparison Report', period: '2024-11', scenarioType: 'base', entityCodes: [], generatedAt: '2024-12-12T10:00:00Z', format: 'CSV' },
  ].slice(0, 6);

  // Deduplicate by id
  const uniqueRecent = recentReports.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);

  return (
    <div className="space-y-6">
      {loadError && <DataLoadError message="Could not load reports from the server. Try refreshing." />}
      {/* Report Templates Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Report Templates
            </h2>
            <p className="text-sm text-muted-foreground">Generate professional financial reports for your group</p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            <Calendar className="w-3 h-3 mr-1" />
            Period: {selectedPeriod}
          </Badge>
          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
            {generatedCount} Generated
          </Badge>
          {/* Download All Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Download All
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportExcel('consolidated-income')} className="text-xs">
                Income Statement (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPDF('consolidated-income')} className="text-xs">
                Income Statement (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportExcel('consolidated-balance-sheet')} className="text-xs">
                Balance Sheet (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPDF('consolidated-balance-sheet')} className="text-xs">
                Balance Sheet (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportExcel('consolidated-cash-flow')} className="text-xs">
                Cash Flow (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPDF('consolidated-cash-flow')} className="text-xs">
                Cash Flow (.pdf)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                ['consolidated-income', 'consolidated-balance-sheet', 'consolidated-cash-flow'].forEach(rt => handleExportExcel(rt));
              }} className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                All Statements (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                handleExportPDF('consolidated-income');
              }} className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                All Statements (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {reportTemplates.map((template, index) => {
            const Icon = iconMap[template.icon] || FileText;
            const cat = categoryConfig[template.category];
            const isGenerating = generating === template.reportType;
            const gradientColors: Record<string, string> = {
              financial: 'from-emerald-600 to-teal-700',
              analysis: 'from-teal-600 to-cyan-700',
              compliance: 'from-amber-600 to-orange-700',
            };

            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.4 }}
                whileHover={{ y: -2 }}
                className="group"
              >
                <Card className="overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border-0 report-card-lift">
                  {/* Gradient header */}
                  <div className={`bg-gradient-to-r ${gradientColors[template.category]} p-4 pb-3`}>
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <Badge className="bg-white/20 text-white border-0 text-[9px] hover:bg-white/30">
                        {cat.label}
                      </Badge>
                    </div>
                    <h3 className="text-sm font-bold text-white mt-3 leading-tight">{template.title}</h3>
                  </div>
                  <CardContent className="p-4 pt-3">
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2 min-h-[2rem]">
                      {template.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {template.lastGenerated
                          ? new Date(template.lastGenerated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'Never'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 w-7 p-0"
                          onClick={() => handleExportExcel(template.reportType)}
                          title="Export Excel"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          className={`text-xs h-7 bg-gradient-to-r ${gradientColors[template.category]} text-white border-0 hover:opacity-90 shadow-sm`}
                          onClick={() => handleGenerate(template.reportType)}
                          disabled={isGenerating}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : generating !== template.reportType && generatedCount > 0 ? (
                            <CheckCircle2 className="w-3 h-3 mr-1 animate-checkmark" />
                          ) : (
                            <ChevronRight className="w-3 h-3 mr-0.5" />
                          )}
                          {isGenerating ? 'Generating...' : 'Generate'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Report Preview Dialog */}
      <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          {previewReport && demoReportData[previewReport] && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      {demoReportData[previewReport].title}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      TechNova Group · Period: {selectedPeriod} · Base Scenario · All Entities
                    </DialogDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setPreviewReport(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </DialogHeader>

              {/* Report content - page-like layout */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                  {/* Report Header */}
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold">TechNova Group</h2>
                        <p className="text-xs text-muted-foreground">{demoReportData[previewReport].title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">As of {new Date(selectedPeriod + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</p>
                        <p className="text-[10px] text-muted-foreground">Amounts in thousands (€K)</p>
                      </div>
                    </div>
                  </div>

                  {/* Financial Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          {demoReportData[previewReport].headers.map((h, i) => (
                            <th
                              key={i}
                              className={`px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] ${i === 0 ? 'text-left' : 'text-right'}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {demoReportData[previewReport].rows.map((row, rowIdx) => {
                          const label = String(row[0]);
                          const highlight = isRowHighlight(label);
                          const subtotal = isRowSubtotal(label);

                          return (
                            <tr
                              key={rowIdx}
                              className={`
                                border-b border-slate-100 dark:border-slate-800
                                ${highlight ? 'bg-emerald-50/50 dark:bg-emerald-950/10 font-semibold' : ''}
                                ${subtotal ? 'border-t-2 border-t-emerald-200 dark:border-t-emerald-800' : ''}
                                ${rowIdx % 2 === 1 && !highlight ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}
                              `}
                            >
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className={`
                                    px-4 py-2
                                    ${cellIdx === 0 ? (highlight ? 'font-semibold' : 'font-normal') : 'text-right font-mono'}
                                    ${cellIdx > 0 && typeof cell === 'number' && cell < 0 ? 'text-rose-600 dark:text-rose-400' : ''}
                                    ${cellIdx > 0 && typeof cell === 'number' && cell > 0 && highlight ? 'text-emerald-700 dark:text-emerald-400' : ''}
                                  `}
                                >
                                  {cellIdx === 0 ? cell : formatNumber(cell)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Report Footer */}
                  <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ConsolidaçãoFX
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Page 1 of 1
                    </p>
                  </div>
                </div>
              </div>

              {/* Export buttons */}
              <div className="px-6 py-3 border-t flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs text-muted-foreground">
                  {demoReportData[previewReport].rows.length} rows · {demoReportData[previewReport].headers.length} columns
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => exportReportAsCSV(previewReport)}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => exportReportAsExcel(previewReport)}
                  >
                    <Table2 className="w-3 h-3 mr-1" />
                    Export Excel
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Recent Reports */}
      <Card className="shadow-sm border border-slate-200/60 dark:border-slate-700/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600" />
            Recent Reports
          </CardTitle>
          <CardDescription>Recently generated reports and exports</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Report</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Period</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Scenario</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Format</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Generated</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {uniqueRecent.map((report, index) => {
                      const scenarioColors: Record<string, string> = {
                        base: 'text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30',
                        optimistic: 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
                        pessimistic: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
                      };
                      return (
                        <motion.tr
                          key={report.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.3 }}
                          className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${index % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-medium">{report.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">{report.period}</td>
                          <td className="px-4 py-2.5">
                            <Badge className={`text-[9px] ${scenarioColors[report.scenarioType] || scenarioColors.base}`}>
                              {report.scenarioType}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {report.format}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {new Date(report.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                const rt = report.reportType as keyof typeof demoReportData;
                                if (demoReportData[rt]) setPreviewReport(rt);
                              }}
                            >
                              <ChevronRight className="w-3 h-3 mr-0.5" />
                              View
                            </Button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
