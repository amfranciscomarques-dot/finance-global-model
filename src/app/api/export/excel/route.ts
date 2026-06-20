import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import * as XLSX from 'xlsx';

// ============================================================
// EXCEL EXPORT API
// Generates .xlsx files for financial statements
// ============================================================

// Zod validation schema for query params
const exportQuerySchema = z.object({
  reportType: z.enum(['income_statement', 'balance_sheet', 'cash_flow', 'consolidated_all']),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  entityCodes: z.string().optional(), // comma-separated
});

// COA code mappings for financial statements
const IS_LINE_ITEMS = [
  { code: 'REV', label: 'Revenue', sign: 1, isTotal: false },
  { code: 'COGS', label: 'Cost of Goods Sold', sign: 1, isTotal: false },
  { label: 'Gross Profit', isCalculated: true, calc: 'revenue+cogs' },
  { code: 'OPX', label: 'Operating Expenses', sign: 1, isTotal: false },
  { code: 'PAY', label: 'Payroll & Personnel', sign: 1, isTotal: false },
  { label: 'EBITDA', isCalculated: true, calc: 'grossProfit+opex' },
  { code: 'DEP', label: 'Depreciation & Amortization', sign: 1, isTotal: false },
  { label: 'EBIT', isCalculated: true, calc: 'ebitda+depreciation' },
  { code: 'INT', label: 'Interest Expense', sign: 1, isTotal: false },
  { label: 'Earnings Before Tax (EBT)', isCalculated: true, calc: 'ebit+interestExpense' },
  { code: 'TAX', label: 'Tax Expense', sign: 1, isTotal: false },
  { label: 'Net Income', isCalculated: true, calc: 'ebt+taxExpense', isTotal: true },
  { label: 'Minority Interest', isCalculated: true, calc: 'minorityInterest' },
  { label: 'Net Income (Group Share)', isCalculated: true, calc: 'netIncome+minorityInterest', isTotal: true },
];

const BS_LINE_ITEMS = [
  { code: 'AST-001', label: 'Cash & Cash Equivalents', section: 'Current Assets' },
  { code: 'AST-002', label: 'Accounts Receivable', section: 'Current Assets' },
  { code: 'AST-003', label: 'Inventory', section: 'Current Assets' },
  { label: 'Total Current Assets', isCalculated: true, calc: 'cash+accountsReceivable+inventory', isTotal: true, section: 'Current Assets' },
  { code: 'AST-005', label: 'Property, Plant & Equipment', section: 'Non-Current Assets' },
  { code: 'AST-006', label: 'Intangible Assets', section: 'Non-Current Assets' },
  { code: 'AST-007', label: 'Goodwill', section: 'Non-Current Assets' },
  { label: 'Total Non-Current Assets', isCalculated: true, calc: 'ppe+intangibleAssets+goodwill', isTotal: true, section: 'Non-Current Assets' },
  { label: 'TOTAL ASSETS', isCalculated: true, calc: 'currentAssets+nonCurrentAssets', isTotal: true, section: 'Total' },
  { code: 'LIA-001', label: 'Accounts Payable', section: 'Current Liabilities' },
  { code: 'LIA-002', label: 'Short-Term Debt', section: 'Current Liabilities' },
  { code: 'LIA-007', label: 'Other Payables', section: 'Current Liabilities' },
  { label: 'Total Current Liabilities', isCalculated: true, calc: 'accountsPayable+shortTermDebt', isTotal: true, section: 'Current Liabilities' },
  { code: 'LIA-004', label: 'Long-Term Debt', section: 'Non-Current Liabilities' },
  { label: 'Total Non-Current Liabilities', isCalculated: true, calc: 'longTermDebt', isTotal: true, section: 'Non-Current Liabilities' },
  { label: 'TOTAL LIABILITIES', isCalculated: true, calc: 'currentLiabilities+nonCurrentLiabilities', isTotal: true, section: 'Total' },
  { code: 'EQY-001', label: 'Share Capital', section: 'Equity' },
  { code: 'EQY-002', label: 'Retained Earnings', section: 'Equity' },
  { code: 'EQY-003', label: 'Minority Equity', section: 'Equity' },
  { label: 'TOTAL EQUITY', isCalculated: true, calc: 'shareCapital+retainedEarnings+minorityEquity', isTotal: true, section: 'Equity' },
  { label: 'Balance Check (Assets - L - E)', isCalculated: true, calc: 'totalAssets-totalLiabilities-totalEquity', section: 'Check' },
];

const CF_LINE_ITEMS = [
  { label: 'Net Income', field: 'netIncome', section: 'Operating Activities' },
  { label: 'Depreciation & Amortization', field: 'depreciation', section: 'Operating Activities' },
  { code: 'CFA-001', label: 'Changes in Working Capital', section: 'Operating Activities' },
  { label: 'Net Operating Cash Flow', isCalculated: true, calc: 'netIncome+depreciation+changesInWorkingCapital', isTotal: true, section: 'Operating Activities' },
  { code: 'CFA-002', label: 'Capital Expenditure', section: 'Investing Activities' },
  { label: 'Net Investing Cash Flow', isCalculated: true, calc: 'capex', isTotal: true, section: 'Investing Activities' },
  { code: 'CFA-003', label: 'Debt Issuance', section: 'Financing Activities' },
  { code: 'CFA-004', label: 'Debt Repayment', section: 'Financing Activities' },
  { code: 'CFA-005', label: 'Dividends Paid', section: 'Financing Activities' },
  { label: 'Net Financing Cash Flow', isCalculated: true, calc: 'debtIssuance-debtRepayment-dividendsPaid', isTotal: true, section: 'Financing Activities' },
  { label: 'Net Change in Cash', isCalculated: true, calc: 'operatingCashFlow+investingCashFlow+financingCashFlow', isTotal: true, section: 'Summary' },
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

/**
 * Fetch and compute entity financials from trial balances
 */
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
    // Get exchange rate
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

    // Initialize financial structures
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

    // Map trial balance entries
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

      // IS accounts
      const isPrefix = Object.keys(IS_MAP).find((p) => tb.groupCOACode.startsWith(p + '-'));
      if (isPrefix) {
        const key = IS_MAP[isPrefix];
        isData[key] += amountEUR;
        continue;
      }

      // BS accounts
      if (BS_MAP[tb.groupCOACode]) {
        bsData[BS_MAP[tb.groupCOACode]] += amountEUR;
        continue;
      }

      // CF accounts
      if (CF_MAP[tb.groupCOACode]) {
        cfData[CF_MAP[tb.groupCOACode]] += amountEUR;
        continue;
      }
    }

    // Apply ownership for proportional
    if (entity.consolidationMethod === 'proportional') {
      const ownership = entity.ownershipPercentage;
      for (const key of Object.keys(isData)) isData[key] *= ownership;
      for (const key of Object.keys(bsData)) bsData[key] *= ownership;
      for (const key of Object.keys(cfData)) cfData[key] *= ownership;
    }

    // Calculate derived IS
    isData.grossProfit = isData.revenue + isData.cogs;
    isData.ebitda = isData.grossProfit + isData.opex;
    isData.ebit = isData.ebitda + isData.depreciation;
    isData.ebt = isData.ebit + isData.interestExpense;
    isData.netIncome = isData.ebt + isData.taxExpense;
    if (entity.consolidationMethod === 'full' && entity.ownershipPercentage < 1.0) {
      isData.minorityInterest = -(isData.netIncome * (1 - entity.ownershipPercentage));
    }

    // Calculate derived BS
    bsData.currentAssets = bsData.cash + bsData.accountsReceivable + bsData.inventory;
    bsData.nonCurrentAssets = bsData.ppe + bsData.intangibleAssets + bsData.goodwill;
    bsData.totalAssets = bsData.currentAssets + bsData.nonCurrentAssets;
    bsData.currentLiabilities = bsData.accountsPayable + bsData.shortTermDebt;
    bsData.nonCurrentLiabilities = bsData.longTermDebt;
    bsData.totalLiabilities = bsData.currentLiabilities + bsData.nonCurrentLiabilities;
    bsData.totalEquity = bsData.shareCapital + bsData.retainedEarnings + bsData.minorityEquity;

    // Calculate derived CF
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
      is: isData,
      bs: bsData,
      cf: cfData,
    });
  }

  return results;
}

/**
 * Resolve a calculated value from entity financial data
 */
function resolveCalc(calc: string, values: Record<string, number>): number {
  let expression = calc;
  for (const [key, val] of Object.entries(values)) {
    expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
  }
  try {
    // Safe evaluation of simple arithmetic
    const result = new Function(`return ${expression}`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Format number for Excel display
 */
function formatExcelNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build Income Statement sheet data
 */
function buildIncomeStatementSheet(
  entityFinancials: EntityFinancials[]
): XLSX.WorkSheet {
  const entityCodes = entityFinancials.map((e) => e.entityCode);
  const entityNames = entityFinancials.map((e) => `${e.entityCode} (${e.legalName})`);

  // Header rows
  const rows: (string | number)[][] = [];

  // Title row
  rows.push(['CONSOLIDATED INCOME STATEMENT', '', ...entityNames, 'Eliminations', 'Consolidated']);
  rows.push(['ConsolidaçãoFX Financial Group', '', ...entityFinancials.map((e) => `${e.localCurrency} → EUR`), '', '']);
  rows.push([]); // blank row

  // Compute consolidated values
  const consolidated: Record<string, number> = {};
  const eliminations: Record<string, number> = {};
  for (const key of Object.keys(entityFinancials[0]?.is || {})) {
    consolidated[key] = entityFinancials.reduce((sum, e) => sum + (e.is[key] || 0), 0);
    // Simplified elimination estimate (5% of intercompany revenue)
    eliminations[key] = key === 'revenue' ? -consolidated[key] * 0.03 : 0;
  }
  consolidated.grossProfit = consolidated.revenue + consolidated.cogs + (eliminations.revenue || 0);
  consolidated.ebitda = consolidated.grossProfit + consolidated.opex;
  consolidated.ebit = consolidated.ebitda + consolidated.depreciation;
  consolidated.ebt = consolidated.ebit + consolidated.interestExpense;
  consolidated.netIncome = consolidated.ebt + consolidated.taxExpense;

  // Line items
  let currentSection = '';
  for (const item of IS_LINE_ITEMS) {
    const row: (string | number)[] = [item.label, ''];

    if (item.isCalculated) {
      for (const ef of entityFinancials) {
        row.push(formatExcelNumber(resolveCalc(item.calc!, ef.is)));
      }
      row.push(formatExcelNumber(resolveCalc(item.calc!, eliminations)));
      row.push(formatExcelNumber(resolveCalc(item.calc!, { ...consolidated, ...eliminations })));
    } else if (item.code) {
      for (const ef of entityFinancials) {
        let val = 0;
        for (const [key, amount] of Object.entries(ef.is)) {
          if (key.toLowerCase().includes(item.code!.toLowerCase().replace('-', '').toLowerCase())) {
            val += amount;
          }
        }
        // More precise: use the IS code prefix
        const isKey = item.code === 'REV' ? 'revenue' :
          item.code === 'COGS' ? 'cogs' :
          item.code === 'OPX' ? 'opex' :
          item.code === 'PAY' ? 'opex' :
          item.code === 'DEP' ? 'depreciation' :
          item.code === 'INT' ? 'interestExpense' :
          item.code === 'TAX' ? 'taxExpense' : '';
        if (isKey) val = ef.is[isKey] || 0;
        row.push(formatExcelNumber(val));
      }
      // Elimination column
      row.push(formatExcelNumber(0));
      // Consolidated column
      const isKey = item.code === 'REV' ? 'revenue' :
        item.code === 'COGS' ? 'cogs' :
        item.code === 'OPX' ? 'opex' :
        item.code === 'PAY' ? 'opex' :
        item.code === 'DEP' ? 'depreciation' :
        item.code === 'INT' ? 'interestExpense' :
        item.code === 'TAX' ? 'taxExpense' : '';
      row.push(formatExcelNumber(consolidated[isKey] || 0));
    }

    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 40 }, // Description
    { wch: 4 },  // Spacer
    ...entityNames.map(() => ({ wch: 18 })),
    { wch: 16 }, // Eliminations
    { wch: 18 }, // Consolidated
  ];

  return ws;
}

/**
 * Build Balance Sheet sheet data
 */
function buildBalanceSheetSheet(
  entityFinancials: EntityFinancials[]
): XLSX.WorkSheet {
  const entityNames = entityFinancials.map((e) => `${e.entityCode} (${e.legalName})`);
  const rows: (string | number)[][] = [];

  rows.push(['CONSOLIDATED BALANCE SHEET', '', ...entityNames, 'Eliminations', 'Consolidated']);
  rows.push(['ConsolidaçãoFX Financial Group', '', ...entityFinancials.map((e) => `${e.localCurrency} → EUR`), '', '']);
  rows.push([]);

  // Compute consolidated
  const consolidated: Record<string, number> = {};
  for (const key of Object.keys(entityFinancials[0]?.bs || {})) {
    consolidated[key] = entityFinancials.reduce((sum, e) => sum + (e.bs[key] || 0), 0);
  }
  // Recalculate consolidated derived fields
  consolidated.currentAssets = consolidated.cash + consolidated.accountsReceivable + consolidated.inventory;
  consolidated.nonCurrentAssets = consolidated.ppe + consolidated.intangibleAssets + consolidated.goodwill;
  consolidated.totalAssets = consolidated.currentAssets + consolidated.nonCurrentAssets;
  consolidated.currentLiabilities = consolidated.accountsPayable + consolidated.shortTermDebt;
  consolidated.nonCurrentLiabilities = consolidated.longTermDebt;
  consolidated.totalLiabilities = consolidated.currentLiabilities + consolidated.nonCurrentLiabilities;
  consolidated.totalEquity = consolidated.shareCapital + consolidated.retainedEarnings + consolidated.minorityEquity;

  const eliminations: Record<string, number> = {};

  for (const item of BS_LINE_ITEMS) {
    const row: (string | number)[] = [item.label, ''];

    if (item.isCalculated) {
      for (const ef of entityFinancials) {
        row.push(formatExcelNumber(resolveCalc(item.calc!, ef.bs)));
      }
      row.push(formatExcelNumber(resolveCalc(item.calc!, eliminations)));
      row.push(formatExcelNumber(resolveCalc(item.calc!, { ...consolidated, ...eliminations })));
    } else if (item.code) {
      for (const ef of entityFinancials) {
        row.push(formatExcelNumber(ef.bs[item.code!] || 0));
      }
      row.push(formatExcelNumber(0));
      row.push(formatExcelNumber(consolidated[item.code!] || 0));
    }

    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 40 },
    { wch: 4 },
    ...entityNames.map(() => ({ wch: 18 })),
    { wch: 16 },
    { wch: 18 },
  ];

  return ws;
}

/**
 * Build Cash Flow sheet data
 */
function buildCashFlowSheet(
  entityFinancials: EntityFinancials[]
): XLSX.WorkSheet {
  const entityNames = entityFinancials.map((e) => `${e.entityCode} (${e.legalName})`);
  const rows: (string | number)[][] = [];

  rows.push(['CONSOLIDATED CASH FLOW STATEMENT', '', ...entityNames, 'Eliminations', 'Consolidated']);
  rows.push(['ConsolidaçãoFX Financial Group', '', ...entityFinancials.map((e) => `${e.localCurrency} → EUR`), '', '']);
  rows.push([]);

  // Compute consolidated
  const consolidated: Record<string, number> = {};
  for (const key of Object.keys(entityFinancials[0]?.cf || {})) {
    consolidated[key] = entityFinancials.reduce((sum, e) => sum + (e.cf[key] || 0), 0);
  }
  consolidated.operatingCashFlow = consolidated.netIncome + consolidated.depreciation + consolidated.changesInWorkingCapital;
  consolidated.investingCashFlow = consolidated.capex;
  consolidated.financingCashFlow = consolidated.debtIssuance - consolidated.debtRepayment - consolidated.dividendsPaid;
  consolidated.netChangeInCash = consolidated.operatingCashFlow + consolidated.investingCashFlow + consolidated.financingCashFlow;

  const eliminations: Record<string, number> = {};

  for (const item of CF_LINE_ITEMS) {
    const row: (string | number)[] = [item.label, ''];

    if (item.isCalculated) {
      for (const ef of entityFinancials) {
        row.push(formatExcelNumber(resolveCalc(item.calc!, ef.cf)));
      }
      row.push(formatExcelNumber(resolveCalc(item.calc!, eliminations)));
      row.push(formatExcelNumber(resolveCalc(item.calc!, { ...consolidated, ...eliminations })));
    } else if (item.field) {
      for (const ef of entityFinancials) {
        row.push(formatExcelNumber(ef.cf[item.field!] || 0));
      }
      row.push(formatExcelNumber(0));
      row.push(formatExcelNumber(consolidated[item.field!] || 0));
    } else if (item.code) {
      for (const ef of entityFinancials) {
        row.push(formatExcelNumber(ef.cf[item.code!] || 0));
      }
      row.push(formatExcelNumber(0));
      row.push(formatExcelNumber(consolidated[item.code!] || 0));
    }

    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 40 },
    { wch: 4 },
    ...entityNames.map(() => ({ wch: 18 })),
    { wch: 16 },
    { wch: 18 },
  ];

  return ws;
}

/**
 * Apply professional formatting to a worksheet
 */
function applyFormatting(ws: XLSX.WorkSheet, wsName: string): void {
  if (!ws['!ref']) return;

  const range = XLSX.utils.decode_range(ws['!ref']);
  // Number format for currency columns (columns after the first two)
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = 2; C <= range.e.c; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddress];
      if (cell && typeof cell.v === 'number') {
        cell.z = '#,##0.00'; // Number format
        // Color code: green for positive, red for negative
        if (cell.v > 0) {
          cell.z = '#,##0.00;[Red]-#,##0.00';
        }
      }
    }
  }
}

/**
 * GET /api/export/excel
 * Generate and download an Excel file for financial statements
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query params
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

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Add info sheet
    const infoRows = [
      ['ConsolidaçãoFX Financial Report'],
      [''],
      ['Report Type:', params.reportType],
      ['Period:', params.period],
      ['Scenario:', params.scenarioType],
      ['Entities:', entityFinancials.map((e) => e.entityCode).join(', ')],
      ['Generated:', new Date().toISOString()],
      [''],
      ['Entity Details:'],
      ['Code', 'Legal Name', 'Currency', 'Ownership', 'Method'],
      ...entityFinancials.map((e) => [
        e.entityCode,
        e.legalName,
        e.localCurrency,
        `${(e.ownershipPercentage * 100).toFixed(0)}%`,
        e.consolidationMethod,
      ]),
    ];
    const infoWs = XLSX.utils.aoa_to_sheet(infoRows);
    infoWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, infoWs, 'Report Info');

    // Build sheets based on report type
    if (params.reportType === 'income_statement' || params.reportType === 'consolidated_all') {
      const isWs = buildIncomeStatementSheet(entityFinancials);
      applyFormatting(isWs, 'Income Statement');
      XLSX.utils.book_append_sheet(wb, isWs, 'Income Statement');
    }

    if (params.reportType === 'balance_sheet' || params.reportType === 'consolidated_all') {
      const bsWs = buildBalanceSheetSheet(entityFinancials);
      applyFormatting(bsWs, 'Balance Sheet');
      XLSX.utils.book_append_sheet(wb, bsWs, 'Balance Sheet');
    }

    if (params.reportType === 'cash_flow' || params.reportType === 'consolidated_all') {
      const cfWs = buildCashFlowSheet(entityFinancials);
      applyFormatting(cfWs, 'Cash Flow');
      XLSX.utils.book_append_sheet(wb, cfWs, 'Cash Flow');
    }

    // Add KPI Summary sheet for consolidated_all
    if (params.reportType === 'consolidated_all') {
      const consolidatedIS: Record<string, number> = {};
      const consolidatedBS: Record<string, number> = {};
      const consolidatedCF: Record<string, number> = {};

      for (const ef of entityFinancials) {
        for (const [key, val] of Object.entries(ef.is)) {
          consolidatedIS[key] = (consolidatedIS[key] || 0) + val;
        }
        for (const [key, val] of Object.entries(ef.bs)) {
          consolidatedBS[key] = (consolidatedBS[key] || 0) + val;
        }
        for (const [key, val] of Object.entries(ef.cf)) {
          consolidatedCF[key] = (consolidatedCF[key] || 0) + val;
        }
      }

      const revenue = consolidatedIS.revenue || 1;
      const ebitda = consolidatedIS.grossProfit + consolidatedIS.opex;
      const netIncome = consolidatedIS.netIncome + consolidatedIS.minorityInterest;
      const totalAssets = consolidatedBS.totalAssets || 1;
      const totalEquity = consolidatedBS.totalEquity || 1;
      const netDebt = (consolidatedBS.shortTermDebt || 0) + (consolidatedBS.longTermDebt || 0) - (consolidatedBS.cash || 0);

      const kpiRows = [
        ['KEY PERFORMANCE INDICATORS'],
        [''],
        ['Metric', 'Value', 'Unit'],
        ['Total Revenue', formatExcelNumber(consolidatedIS.revenue || 0), '€'],
        ['EBITDA', formatExcelNumber(ebitda), '€'],
        ['EBITDA Margin', (revenue !== 0 ? (ebitda / revenue * 100) : 0).toFixed(1), '%'],
        ['Net Income', formatExcelNumber(netIncome), '€'],
        ['Net Income Margin', (revenue !== 0 ? (netIncome / revenue * 100) : 0).toFixed(1), '%'],
        ['Total Assets', formatExcelNumber(totalAssets), '€'],
        ['Net Debt', formatExcelNumber(netDebt), '€'],
        ['Leverage (Net Debt / EBITDA)', ebitda !== 0 ? (netDebt / ebitda).toFixed(2) : 'N/A', 'x'],
        ['ROE', (totalEquity !== 0 ? (netIncome / totalEquity * 100) : 0).toFixed(1), '%'],
        ['ROA', (totalAssets !== 0 ? (netIncome / totalAssets * 100) : 0).toFixed(1), '%'],
        ['Current Ratio', ((consolidatedBS.currentLiabilities || 0) !== 0
          ? consolidatedBS.currentAssets / consolidatedBS.currentLiabilities
          : 0).toFixed(2), 'x'],
        ['Operating Cash Flow', formatExcelNumber(consolidatedCF.operatingCashFlow || 0), '€'],
        ['Free Cash Flow', formatExcelNumber((consolidatedCF.operatingCashFlow || 0) + (consolidatedCF.capex || 0)), '€'],
      ];

      const kpiWs = XLSX.utils.aoa_to_sheet(kpiRows);
      kpiWs['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, kpiWs, 'KPI Summary');
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Build filename
    const periodSafe = params.period.replace('-', '');
    const reportLabel = params.reportType === 'consolidated_all' ? 'All' :
      params.reportType === 'income_statement' ? 'IS' :
      params.reportType === 'balance_sheet' ? 'BS' : 'CF';
    const filename = `ConsolidacaoFX_${reportLabel}_${periodSafe}_${params.scenarioType}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error generating Excel export:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate Excel export' },
      { status: 500 }
    );
  }
}
