import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// PDF EXPORT API
// Generates downloadable PDF reports for financial statements
// Uses jsPDF (pure JS, no font file path issues)
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
  { key: 'currentAssets', label: 'Total Current Assets', isSubtotal: true },
  { key: 'ppe', label: '  Property, Plant & Equipment', indent: true },
  { key: 'intangibleAssets', label: '  Intangible Assets', indent: true },
  { key: 'goodwill', label: '  Goodwill', indent: true },
  { key: 'nonCurrentAssets', label: 'Total Non-Current Assets', isSubtotal: true },
  { key: 'totalAssets', label: 'TOTAL ASSETS', isTotal: true },
  { section: 'LIABILITIES & EQUITY' },
  { key: 'accountsPayable', label: '  Accounts Payable', indent: true },
  { key: 'shortTermDebt', label: '  Short-Term Debt', indent: true },
  { key: 'currentLiabilities', label: 'Total Current Liabilities', isSubtotal: true },
  { key: 'longTermDebt', label: '  Long-Term Debt', indent: true },
  { key: 'nonCurrentLiabilities', label: 'Total Non-Current Liabilities', isSubtotal: true },
  { key: 'totalLiabilities', label: 'TOTAL LIABILITIES', isSubtotal: true },
  { key: 'shareCapital', label: '  Share Capital', indent: true },
  { key: 'retainedEarnings', label: '  Retained Earnings', indent: true },
  { key: 'minorityEquity', label: '  Minority Interest', indent: true },
  { key: 'totalEquity', label: 'TOTAL EQUITY', isSubtotal: true },
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

interface EntityFinancials {
  entityCode: string;
  legalName: string;
  localCurrency: string;
  ownershipPercentage: number;
  consolidationMethod: string;
  is: Record<string, number>;
  bs: Record<string, number>;
  cf: Record<string, number>;
}

async function fetchEntityFinancials(
  period: string,
  scenarioType: string,
  entityCodes?: string[]
): Promise<EntityFinancials[]> {
  const periodDate = new Date(period + '-01');

  const entityFilter: Record<string, unknown> = { isActive: true };
  if (entityCodes && entityCodes.length > 0) {
    entityFilter.code = { in: entityCodes };
  }
  const entities = await db.entity.findMany({ where: entityFilter });

  const results: EntityFinancials[] = [];

  for (const entity of entities) {
    let rate = 1.0;
    if (entity.localCurrency !== 'EUR') {
      const rateRecord = await db.exchangeRate.findFirst({
        where: { currency: entity.localCurrency, rateType: 'closing', rateDate: { lte: periodDate } },
        orderBy: { rateDate: 'desc' },
      });
      if (rateRecord) rate = rateRecord.rate;
    }

    const periodType = scenarioType === 'base' ? 'actual' : 'forecast';
    let trialBalances = await db.trialBalance.findMany({
      where: { entityId: entity.id, period: periodDate, periodType },
    });
    if (trialBalances.length === 0) {
      trialBalances = await db.trialBalance.findMany({
        where: { entityId: entity.id, period: periodDate },
      });
    }

    const isData: Record<string, number> = {
      revenue: 0, cogs: 0, opex: 0, depreciation: 0, interestExpense: 0,
      taxExpense: 0, grossProfit: 0, ebitda: 0, ebit: 0, ebt: 0,
      netIncome: 0, minorityInterest: 0,
    };
    const bsData: Record<string, number> = {
      cash: 0, accountsReceivable: 0, inventory: 0, currentAssets: 0,
      ppe: 0, intangibleAssets: 0, goodwill: 0, nonCurrentAssets: 0, totalAssets: 0,
      accountsPayable: 0, shortTermDebt: 0, currentLiabilities: 0,
      longTermDebt: 0, nonCurrentLiabilities: 0, totalLiabilities: 0,
      shareCapital: 0, retainedEarnings: 0, minorityEquity: 0, totalEquity: 0,
    };
    const cfData: Record<string, number> = {
      netIncome: 0, depreciation: 0, changesInWorkingCapital: 0,
      operatingCashFlow: 0, capex: 0, investingCashFlow: 0,
      debtIssuance: 0, debtRepayment: 0, dividendsPaid: 0,
      financingCashFlow: 0, netChangeInCash: 0,
    };

    const IS_MAP: Record<string, string> = {
      'REV': 'revenue', 'COGS': 'cogs', 'OPX': 'opex', 'PAY': 'opex',
      'DEP': 'depreciation', 'INT': 'interestExpense', 'TAX': 'taxExpense',
    };
    const BS_MAP: Record<string, string> = {
      'AST-001': 'cash', 'AST-002': 'accountsReceivable', 'AST-003': 'inventory',
      'AST-005': 'ppe', 'AST-006': 'intangibleAssets', 'AST-007': 'goodwill',
      'LIA-001': 'accountsPayable', 'LIA-002': 'shortTermDebt', 'LIA-007': 'accountsPayable',
      'LIA-004': 'longTermDebt', 'EQY-001': 'shareCapital', 'EQY-002': 'retainedEarnings',
      'EQY-003': 'minorityEquity',
    };
    const CF_MAP: Record<string, string> = {
      'CFA-001': 'changesInWorkingCapital', 'CFA-002': 'capex',
      'CFA-003': 'debtIssuance', 'CFA-004': 'debtRepayment', 'CFA-005': 'dividendsPaid',
    };
    const summaryAccounts = new Set([
      'AST-004', 'AST-008', 'AST-009', 'AST-010',
      'LIA-003', 'LIA-005', 'LIA-006', 'LIA-008', 'LIA-009', 'LIA-010',
      'EQY-004', 'EQY-005',
    ]);

    for (const tb of trialBalances) {
      if (summaryAccounts.has(tb.groupCOACode)) continue;
      let amountEUR = tb.amountEUR;
      if (!amountEUR && tb.amountLocal) {
        amountEUR = tb.amountLocal / (tb.exchangeRateUsed || rate || 1);
      }
      const isPrefix = Object.keys(IS_MAP).find((p) => tb.groupCOACode.startsWith(p + '-'));
      if (isPrefix) { isData[IS_MAP[isPrefix]] += amountEUR; continue; }
      if (BS_MAP[tb.groupCOACode]) { bsData[BS_MAP[tb.groupCOACode]] += amountEUR; continue; }
      if (CF_MAP[tb.groupCOACode]) { cfData[CF_MAP[tb.groupCOACode]] += amountEUR; continue; }
    }

    if (entity.consolidationMethod === 'proportional') {
      const ownership = entity.ownershipPercentage;
      for (const key of Object.keys(isData)) isData[key] *= ownership;
      for (const key of Object.keys(bsData)) bsData[key] *= ownership;
      for (const key of Object.keys(cfData)) cfData[key] *= ownership;
    }

    isData.grossProfit = isData.revenue + isData.cogs;
    isData.ebitda = isData.grossProfit + isData.opex;
    isData.ebit = isData.ebitda + isData.depreciation;
    isData.ebt = isData.ebit + isData.interestExpense;
    isData.netIncome = isData.ebt + isData.taxExpense;
    if (entity.consolidationMethod === 'full' && entity.ownershipPercentage < 1.0) {
      isData.minorityInterest = -(isData.netIncome * (1 - entity.ownershipPercentage));
    }

    bsData.currentAssets = bsData.cash + bsData.accountsReceivable + bsData.inventory;
    bsData.nonCurrentAssets = bsData.ppe + bsData.intangibleAssets + bsData.goodwill;
    bsData.totalAssets = bsData.currentAssets + bsData.nonCurrentAssets;
    bsData.currentLiabilities = bsData.accountsPayable + bsData.shortTermDebt;
    bsData.nonCurrentLiabilities = bsData.longTermDebt;
    bsData.totalLiabilities = bsData.currentLiabilities + bsData.nonCurrentLiabilities;
    bsData.totalEquity = bsData.shareCapital + bsData.retainedEarnings + bsData.minorityEquity;

    cfData.netIncome = isData.netIncome;
    cfData.depreciation = Math.abs(isData.depreciation);
    cfData.operatingCashFlow = cfData.netIncome + cfData.depreciation + cfData.changesInWorkingCapital;
    cfData.investingCashFlow = cfData.capex;
    cfData.financingCashFlow = cfData.debtIssuance - cfData.debtRepayment - cfData.dividendsPaid;
    cfData.netChangeInCash = cfData.operatingCashFlow + cfData.investingCashFlow + cfData.financingCashFlow;

    results.push({
      entityCode: entity.code,
      legalName: entity.legalName,
      localCurrency: entity.localCurrency,
      ownershipPercentage: entity.ownershipPercentage,
      consolidationMethod: entity.consolidationMethod,
      is: isData, bs: bsData, cf: cfData,
    });
  }

  return results;
}

function fmt(value: number): string {
  if (value === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'auto',
  }).format(Math.round(value));
}

function computeConsolidated(entityFinancials: EntityFinancials[], type: 'is' | 'bs' | 'cf'): Record<string, number> {
  const consolidated: Record<string, number> = {};
  if (entityFinancials.length === 0) return consolidated;
  for (const key of Object.keys(entityFinancials[0][type])) {
    consolidated[key] = entityFinancials.reduce((sum, e) => sum + (e[type][key] || 0), 0);
  }
  if (type === 'is') {
    consolidated.grossProfit = consolidated.revenue + consolidated.cogs;
    consolidated.ebitda = consolidated.grossProfit + consolidated.opex;
    consolidated.ebit = consolidated.ebitda + consolidated.depreciation;
    consolidated.ebt = consolidated.ebit + consolidated.interestExpense;
    consolidated.netIncome = consolidated.ebt + consolidated.taxExpense;
  } else if (type === 'bs') {
    consolidated.currentAssets = consolidated.cash + consolidated.accountsReceivable + consolidated.inventory;
    consolidated.nonCurrentAssets = consolidated.ppe + consolidated.intangibleAssets + consolidated.goodwill;
    consolidated.totalAssets = consolidated.currentAssets + consolidated.nonCurrentAssets;
    consolidated.currentLiabilities = consolidated.accountsPayable + consolidated.shortTermDebt;
    consolidated.nonCurrentLiabilities = consolidated.longTermDebt;
    consolidated.totalLiabilities = consolidated.currentLiabilities + consolidated.nonCurrentLiabilities;
    consolidated.totalEquity = consolidated.shareCapital + consolidated.retainedEarnings + consolidated.minorityEquity;
  } else if (type === 'cf') {
    consolidated.operatingCashFlow = consolidated.netIncome + consolidated.depreciation + consolidated.changesInWorkingCapital;
    consolidated.investingCashFlow = consolidated.capex;
    consolidated.financingCashFlow = consolidated.debtIssuance - consolidated.debtRepayment - consolidated.dividendsPaid;
    consolidated.netChangeInCash = consolidated.operatingCashFlow + consolidated.investingCashFlow + consolidated.financingCashFlow;
  }
  return consolidated;
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
  entityFinancials: EntityFinancials[],
  consolidated: Record<string, number>,
  type: 'is' | 'bs' | 'cf',
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

    // Fetch financial data
    const entityFinancials = await fetchEntityFinancials(
      params.period,
      params.scenarioType,
      entityCodesArray
    );

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
      let type: 'is' | 'bs' | 'cf' = 'is';

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

      // Compute consolidated
      const consolidated = computeConsolidated(entityFinancials, type);

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
        didDrawPage: (data) => {
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

      // Amounts note after table
      const finalY = (doc as unknown as Record<string, number>).lastAutoTable?.finalY || 200;
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
        { error: 'Validation failed', details: error.errors },
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
