import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import {
  buildReportData,
  lineValue,
  LINES,
  type ReportData,
  type StatementKind,
} from '@/lib/report-model';

// ============================================================
// EXCEL EXPORT API
// Generates .xlsx files for financial statements. Data comes from the shared
// report model (src/lib/report-model.ts), which runs the consolidation engine —
// so the Consolidated column carries real IC eliminations and ties to the
// dashboard. Per-entity + Eliminations + Consolidated columns reconcile.
// ============================================================

const exportQuerySchema = z.object({
  reportType: z.enum(['income_statement', 'balance_sheet', 'cash_flow', 'consolidated_all']),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  entityCodes: z.string().optional(), // comma-separated
});

function formatExcelNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build a statement worksheet: one column per entity, then Eliminations, then
 * Consolidated. Subtotal rows read the engine's pre-derived fields, so the sheet
 * ties to the engine and the balance sheet balances.
 */
function buildStatementSheet(data: ReportData, kind: StatementKind, title: string): XLSX.WorkSheet {
  const { entities, consolidated, eliminations } = data;
  const entityNames = entities.map((e) => `${e.entityCode} (${e.legalName})`);

  const rows: (string | number)[][] = [];
  rows.push([title, '', ...entityNames, 'Eliminations', 'Consolidated']);
  rows.push(['ConsolidaçãoFX Financial Group', '', ...entities.map((e) => `${e.localCurrency} → EUR`), '', '']);
  rows.push([]);

  let currentSection = '';
  for (const line of LINES[kind]) {
    if (line.section && line.section !== currentSection) {
      currentSection = line.section;
      rows.push([currentSection]);
    }
    const row: (string | number)[] = [line.label, ''];
    for (const e of entities) row.push(formatExcelNumber(lineValue(line, e[kind])));
    row.push(formatExcelNumber(lineValue(line, eliminations[kind])));
    row.push(formatExcelNumber(lineValue(line, consolidated[kind])));
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

function buildKpiSheet(data: ReportData): XLSX.WorkSheet {
  const { consolidated, kpis } = data;
  const revenue = kpis.totalRevenue;
  const netIncome = kpis.netIncome; // group share
  const opCF = consolidated.cf.operatingCashFlow ?? 0;
  const capex = consolidated.cf.capex ?? 0;

  const kpiRows: (string | number)[][] = [
    ['KEY PERFORMANCE INDICATORS'],
    [''],
    ['Metric', 'Value', 'Unit'],
    ['Total Revenue', formatExcelNumber(revenue), '€'],
    ['EBITDA', formatExcelNumber(kpis.totalEBITDA), '€'],
    ['EBITDA Margin', kpis.ebitdaMargin, '%'],
    ['Net Income (Group Share)', formatExcelNumber(netIncome), '€'],
    ['Net Income Margin', revenue !== 0 ? Math.round((netIncome / revenue) * 1000) / 10 : 0, '%'],
    ['Total Assets', formatExcelNumber(kpis.totalAssets), '€'],
    ['Net Debt', formatExcelNumber(kpis.netDebt), '€'],
    ['Leverage (Net Debt / EBITDA)', kpis.leverage, 'x'],
    ['ROE', kpis.roe, '%'],
    ['ROCE', kpis.roce, '%'],
    ['Current Ratio', kpis.liquidityRatio, 'x'],
    ['Operating Cash Flow', formatExcelNumber(opCF), '€'],
    ['Free Cash Flow', formatExcelNumber(opCF + capex), '€'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(kpiRows);
  ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 8 }];
  return ws;
}

/** Apply number formatting to currency columns. */
function applyFormatting(ws: XLSX.WorkSheet): void {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = 2; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && typeof cell.v === 'number') {
        cell.z = cell.v > 0 ? '#,##0.00;[Red]-#,##0.00' : '#,##0.00';
      }
    }
  }
}

/**
 * GET /api/export/excel
 * Generate and download an Excel file for financial statements.
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

    const data = await buildReportData(params.period, params.scenarioType, entityCodesArray);

    if (data.entities.length === 0) {
      return NextResponse.json(
        { error: 'No financial data found for the specified parameters' },
        { status: 404 }
      );
    }

    const wb = XLSX.utils.book_new();

    // Info sheet
    const infoRows = [
      ['ConsolidaçãoFX Financial Report'],
      [''],
      ['Report Type:', params.reportType],
      ['Period:', params.period],
      ['Scenario:', params.scenarioType],
      ['Entities:', data.entities.map((e) => e.entityCode).join(', ')],
      ['Consolidation status:', data.status],
      ['Balance check (€):', formatExcelNumber(data.balanceCheck)],
      ['Generated:', new Date().toISOString()],
      [''],
      ['Entity Details:'],
      ['Code', 'Legal Name', 'Currency', 'Ownership', 'Method'],
      ...data.entities.map((e) => [
        e.entityCode,
        e.legalName,
        e.localCurrency,
        `${(e.ownershipPercentage * 100).toFixed(0)}%`,
        e.consolidationMethod,
      ]),
    ];
    const infoWs = XLSX.utils.aoa_to_sheet(infoRows);
    infoWs['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, infoWs, 'Report Info');

    const all = params.reportType === 'consolidated_all';
    if (all || params.reportType === 'income_statement') {
      const ws = buildStatementSheet(data, 'is', 'CONSOLIDATED INCOME STATEMENT');
      applyFormatting(ws);
      XLSX.utils.book_append_sheet(wb, ws, 'Income Statement');
    }
    if (all || params.reportType === 'balance_sheet') {
      const ws = buildStatementSheet(data, 'bs', 'CONSOLIDATED BALANCE SHEET');
      applyFormatting(ws);
      XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
    }
    if (all || params.reportType === 'cash_flow') {
      const ws = buildStatementSheet(data, 'cf', 'CONSOLIDATED CASH FLOW STATEMENT');
      applyFormatting(ws);
      XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow');
    }
    if (all) {
      XLSX.utils.book_append_sheet(wb, buildKpiSheet(data), 'KPI Summary');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

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
        { error: 'Validation failed', details: error.issues },
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
