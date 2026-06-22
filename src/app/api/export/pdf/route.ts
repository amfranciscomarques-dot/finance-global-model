import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildReportData, type ReportEntity, type StatementKind } from '@/lib/report-model';

// ============================================================
// PDF EXPORT API
// Generates downloadable PDF reports for financial statements (jsPDF — pure JS).
// Data comes from the shared report model (src/lib/report-model.ts), which runs
// the consolidation engine: the Consolidated column carries real IC eliminations
// and the IC Elim. column = Consolidated − Σ entities, so the columns reconcile.
// ============================================================

const exportQuerySchema = z.object({
  reportType: z.enum(['income_statement', 'balance_sheet', 'cash_flow', 'consolidated_all']),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  entityCodes: z.string().optional(),
});

// COA code mappings
const IS_LINE_ITEMS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cogs', label: '  Cost of Goods Sold', indent: true },
  { key: 'grossProfit', label: 'Gross Profit', isSubtotal: true },
  { key: 'opex', label: '  Operating Expenses', indent: true },
  { key: 'ebitda', label: 'EBITDA', isSubtotal: true },
  { key: 'depreciation', label: '  Depreciation & Amortization', indent: true },
  { key: 'ebit', label: 'EBIT', isSubtotal: true },
  { key: 'interestExpense', label: '  Interest Expense', indent: true },
  { key: 'ebt', label: 'Earnings Before Tax', isSubtotal: true },
  { key: 'taxExpense', label: '  Tax Expense', indent: true },
  { key: 'netIncome', label: 'NET INCOME', isTotal: true },
  { key: 'minorityInterest', label: '  Minority Interest', indent: true },
];

const BS_LINE_ITEMS = [
  { section: 'ASSETS' },
  { key: 'cash', label: '  Cash & Cash Equivalents', indent: true },
  { key: 'accountsReceivable', label: '  Accounts Receivable', indent: true },
  { key: 'inventory', label: '  Inventory', indent: true },
  { key: 'otherCurrentAssets', label: '  Other Current Assets', indent: true },
  { key: 'currentAssets', label: 'Total Current Assets', isSubtotal: true },
  { key: 'ppe', label: '  Property, Plant & Equipment', indent: true },
  { key: 'intangibleAssets', label: '  Intangible Assets', indent: true },
  { key: 'goodwill', label: '  Goodwill', indent: true },
  { key: 'deferredTaxAsset', label: '  Deferred Tax Assets', indent: true },
  { key: 'otherNonCurrentAssets', label: '  Other Non-Current Assets', indent: true },
  { key: 'nonCurrentAssets', label: 'Total Non-Current Assets', isSubtotal: true },
  { key: 'totalAssets', label: 'TOTAL ASSETS', isTotal: true },
  { section: 'LIABILITIES & EQUITY' },
  { key: 'accountsPayable', label: '  Accounts Payable', indent: true },
  { key: 'shortTermDebt', label: '  Short-Term Debt', indent: true },
  { key: 'otherCurrentLiabilities', label: '  Other Current Liabilities', indent: true },
  { key: 'currentLiabilities', label: 'Total Current Liabilities', isSubtotal: true },
  { key: 'longTermDebt', label: '  Long-Term Debt', indent: true },
  { key: 'otherNonCurrentLiabilities', label: '  Other Non-Current Liabilities', indent: true },
  { key: 'nonCurrentLiabilities', label: 'Total Non-Current Liabilities', isSubtotal: true },
  { key: 'totalLiabilities', label: 'TOTAL LIABILITIES', isSubtotal: true },
  { key: 'shareCapital', label: '  Share Capital', indent: true },
  { key: 'retainedEarnings', label: '  Retained Earnings', indent: true },
  { key: 'minorityEquity', label: '  Minority Interest', indent: true },
  { key: 'cta', label: '  Translation Reserve (CTA)', indent: true },
  { key: 'totalEquity', label: 'TOTAL EQUITY', isSubtotal: true },
  { key: 'balanceCheck', label: 'Balance Check (Assets − L − E)' },
];

const CF_LINE_ITEMS = [
  { section: 'OPERATING ACTIVITIES' },
  { key: 'netIncome', label: '  Net Income', indent: true },
  { key: 'depreciation', label: '  Depreciation & Amortization', indent: true },
  { key: 'changesInWorkingCapital', label: '  Changes in Working Capital', indent: true },
  { key: 'operatingCashFlow', label: 'Net Cash from Operations', isSubtotal: true },
  { section: 'INVESTING ACTIVITIES' },
  { key: 'capex', label: '  Capital Expenditure', indent: true },
  { key: 'investingCashFlow', label: 'Net Cash from Investing', isSubtotal: true },
  { section: 'FINANCING ACTIVITIES' },
  { key: 'debtIssuance', label: '  Debt Issuance', indent: true },
  { key: 'debtRepayment', label: '  Debt Repayment', indent: true },
  { key: 'dividendsPaid', label: '  Dividends Paid', indent: true },
  { key: 'financingCashFlow', label: 'Net Cash from Financing', isSubtotal: true },
  { section: 'NET CHANGE' },
  { key: 'netChangeInCash', label: 'Net Change in Cash', isTotal: true },
];

function fmt(value: number): string {
  if (value === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'auto',
  }).format(Math.round(value));
}

// Color helpers for jsPDF (RGB arrays)
const EMERALD_RGB = [16, 185, 129] as const;
const TEAL_RGB = [13, 148, 136] as const;
const DARK_RGB = [30, 41, 59] as const;
const GRAY_RGB = [100, 116, 139] as const;
const RED_RGB = [220, 38, 38] as const;
const LIGHT_BG_RGB = [240, 253, 244] as const;
const SLATE_BG_RGB = [248, 250, 252] as const;

function addReportHeader(doc: jsPDF, title: string, period: string, scenarioType: string, entityCodes: string[]) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header bar - emerald
  doc.setFillColor(...EMERALD_RGB);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('ConsolidaçãoFX', 15, 12);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 240, 220);
  doc.text('Financial Group', 90, 12);

  // Report title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 15, 22);

  // Period and scenario info
  const periodLabel = new Date(period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const scenarioLabel = scenarioType === 'base' ? 'Base Case' : scenarioType === 'optimistic' ? 'Optimistic' : 'Pessimistic';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(200, 240, 220);
  doc.text(`Period: ${periodLabel}  |  Scenario: ${scenarioLabel}  |  Entities: ${entityCodes.join(', ')}`, 15, 27);

  // Bottom accent line - teal
  doc.setFillColor(...TEAL_RGB);
  doc.rect(0, 28, pageWidth, 1.5, 'F');
}

function buildTableData(
  lineItems: Array<{ key?: string; label?: string; section?: string; indent?: boolean; isSubtotal?: boolean; isTotal?: boolean }>,
  entityFinancials: ReportEntity[],
  consolidated: Record<string, number>,
  type: StatementKind,
): { head: string[][]; body: (string | { content: string; styles?: Record<string, unknown> })[][] } {
  const entityCodes = entityFinancials.map(e => e.entityCode);

  // Header row
  const head = [['Line Item', ...entityCodes, 'IC Elim.', 'Consolidated']];

  // Body rows
  const body: (string | { content: string; styles?: Record<string, unknown> })[][] = [];

  for (const item of lineItems) {
    if (item.section) {
      // Section header row
      body.push([
        { content: item.section, styles: { fillColor: LIGHT_BG_RGB, textColor: EMERALD_RGB, fontStyle: 'bold', fontSize: 8 } },
        ...entityCodes.map(() => ({ content: '', styles: { fillColor: LIGHT_BG_RGB } })),
        { content: '', styles: { fillColor: LIGHT_BG_RGB } },
        { content: '', styles: { fillColor: LIGHT_BG_RGB } },
      ]);
      continue;
    }

    if (!item.key) continue;

    const entityValues = entityFinancials.map(e => e[type][item.key!] || 0);
    const consolidatedValue = consolidated[item.key!] || 0;
    const sumEntities = entityValues.reduce((a, b) => a + b, 0);
    const icElim = consolidatedValue - sumEntities;

    const rowStyles: Record<string, unknown> = {};
    if (item.isTotal) {
      rowStyles.fillColor = LIGHT_BG_RGB;
      rowStyles.fontStyle = 'bold';
      rowStyles.textColor = DARK_RGB;
    } else if (item.isSubtotal) {
      rowStyles.fillColor = SLATE_BG_RGB;
      rowStyles.fontStyle = 'bold';
      rowStyles.textColor = DARK_RGB;
    } else {
      rowStyles.textColor = GRAY_RGB;
    }

    const row: (string | { content: string; styles?: Record<string, unknown> })[] = [
      { content: item.label || '', styles: rowStyles },
    ];

    // Entity values
    for (let i = 0; i < entityValues.length; i++) {
      const val = entityValues[i];
      const cellStyles: Record<string, unknown> = { ...rowStyles, halign: 'right' };
      if (val < 0) cellStyles.textColor = RED_RGB;
      else if (item.isTotal || item.isSubtotal) cellStyles.textColor = EMERALD_RGB;
      else cellStyles.textColor = DARK_RGB;
      row.push({ content: fmt(val), styles: cellStyles });
    }

    // IC Eliminations
    const elimStyles: Record<string, unknown> = { ...rowStyles, halign: 'right' };
    if (icElim !== 0) elimStyles.textColor = RED_RGB;
    else elimStyles.textColor = GRAY_RGB;
    row.push({ content: icElim !== 0 ? fmt(icElim) : '—', styles: elimStyles });

    // Consolidated
    const consStyles: Record<string, unknown> = { ...rowStyles, halign: 'right' };
    if (consolidatedValue < 0) consStyles.textColor = RED_RGB;
    else if (item.isTotal || item.isSubtotal) consStyles.textColor = EMERALD_RGB;
    else consStyles.textColor = DARK_RGB;
    row.push({ content: fmt(consolidatedValue), styles: consStyles });

    body.push(row);
  }

  return { head, body };
}

/**
 * GET /api/export/pdf
 * Generate and download a PDF file for financial statements
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const params = exportQuerySchema.parse({
      reportType: searchParams.get('reportType'),
      period: searchParams.get('period'),
      scenarioType: searchParams.get('scenarioType') || 'base',
      entityCodes: searchParams.get('entityCodes') || undefined,
    });

    const entityCodesArray = params.entityCodes ? params.entityCodes.split(',').filter(Boolean) : undefined;

    // Fetch consolidated report data (engine-driven, IC eliminations applied).
    const data = await buildReportData(params.period, params.scenarioType, entityCodesArray);
    const entityFinancials = data.entities;

    if (entityFinancials.length === 0) {
      return NextResponse.json(
        { error: 'No financial data found for the specified parameters' },
        { status: 404 }
      );
    }

    const entityCodes = entityFinancials.map(e => e.entityCode);

    // Create PDF document (landscape A4)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // Build reports based on type
    const reportTypes = params.reportType === 'consolidated_all'
      ? ['income_statement', 'balance_sheet', 'cash_flow']
      : [params.reportType];

    let isFirstPage = true;

    for (const reportType of reportTypes) {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      let title = '';
      let lineItems: Array<{ key?: string; label?: string; section?: string; indent?: boolean; isSubtotal?: boolean; isTotal?: boolean }> = [];
      let type: StatementKind = 'is';

      switch (reportType) {
        case 'income_statement':
          title = 'Consolidated Income Statement';
          lineItems = IS_LINE_ITEMS;
          type = 'is';
          break;
        case 'balance_sheet':
          title = 'Consolidated Balance Sheet';
          lineItems = BS_LINE_ITEMS;
          type = 'bs';
          break;
        case 'cash_flow':
          title = 'Consolidated Cash Flow Statement';
          lineItems = CF_LINE_ITEMS;
          type = 'cf';
          break;
      }

      // Add header
      addReportHeader(doc, title, params.period, params.scenarioType, entityCodes);

      // Consolidated (IC-eliminated) statement from the engine.
      const consolidated = data.consolidated[type];

      // Build table data
      const { head, body } = buildTableData(lineItems, entityFinancials, consolidated, type);

      // Draw table using autoTable
      autoTable(doc, {
        head,
        body,
        startY: 34,
        margin: { left: 10, right: 10 },
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          lineColor: [226, 232, 240] as unknown as number,
          lineWidth: 0.1,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: DARK_RGB as unknown as number,
          textColor: [255, 255, 255] as unknown as number,
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'right',
        },
        columnStyles: {
          0: { cellWidth: 55, halign: 'left' },
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] as unknown as number,
        },
        didDrawPage: () => {
          // Footer on each page
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const pageNum = doc.getCurrentPageInfo().pageNumber;

          doc.setDrawColor(...GRAY_RGB);
          doc.setLineWidth(0.3);
          doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(...GRAY_RGB);
          doc.text(
            `ConsolidaçãoFX © 2025  |  Confidential  |  Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            10,
            pageHeight - 7
          );
          doc.text(`Page ${pageNum}`, pageWidth - 25, pageHeight - 7);
        },
      });

      // Amounts note after table. jspdf-autotable augments the doc with
      // `lastAutoTable.finalY`, which isn't in the base jsPDF types.
      const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 200;
      if (finalY < doc.internal.pageSize.getHeight() - 25) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6);
        doc.setTextColor(...GRAY_RGB);
        doc.text('Amounts in EUR (€) unless otherwise stated. Values rounded to nearest unit.', 10, finalY + 6);
      }
    }

    // Build filename
    const periodSafe = params.period.replace('-', '');
    const reportLabel = params.reportType === 'consolidated_all' ? 'All' :
      params.reportType === 'income_statement' ? 'IS' :
      params.reportType === 'balance_sheet' ? 'BS' : 'CF';
    const filename = `ConsolidacaoFX_${reportLabel}_${periodSafe}_${params.scenarioType}.pdf`;

    // Get PDF as buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error generating PDF export:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF export' },
      { status: 500 }
    );
  }
}
