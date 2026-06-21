// Pure helpers and demo fallback data for the settings view: the table-count
// builder, id generators, and small counts. Extracted from settings-view.tsx so
// the component is form JSX/wiring only and this logic stays testable.
import type {
  SystemSettings,
  CurrencyPair,
  ApiEndpointStatus,
  VersionHistoryEntry,
  EnvironmentInfo,
} from '@/lib/types';

export interface TableCount {
  table: string;
  count: number;
}

// Demo fallback data — shown before the live GET /api/settings resolves, or (with
// a visible banner) if it fails.
export const demoSettings: SystemSettings = {
  consolidation: {
    roundingTolerance: 0.01,
    eliminationThreshold: 100,
    minorityInterestMethod: 'proportional',
    balanceSheetTolerance: 0.05,
    autoConsolidation: false,
  },
  currency: {
    baseCurrency: 'EUR',
    rateTypePreference: 'closing',
    ecbApiEnabled: true,
    refreshFrequencyHours: 24,
  },
  validationRules: [
    { id: 'vr-001', name: 'Trial balance must balance', entityScope: 'all', severity: 'error', isActive: true, description: 'Total debits must equal total credits for each entity trial balance' },
    { id: 'vr-002', name: 'IC transactions must match', entityScope: 'all', severity: 'error', isActive: true, description: 'Intercompany transactions must have matching counterpart entries' },
    { id: 'vr-003', name: 'Currency rate must exist', entityScope: 'non-eur', severity: 'error', isActive: true, description: 'Exchange rate must be available for all non-EUR entity conversions' },
    { id: 'vr-004', name: 'Revenue > 0', entityScope: 'all', severity: 'warning', isActive: true, description: 'Revenue should be positive for active entities' },
    { id: 'vr-005', name: 'Assets = Liabilities + Equity', entityScope: 'all', severity: 'error', isActive: true, description: 'Balance sheet equation must hold within tolerance' },
    { id: 'vr-006', name: 'Net income within expected range', entityScope: 'all', severity: 'warning', isActive: false, description: 'Net income should be within ±50% of previous period' },
    { id: 'vr-007', name: 'Ownership percentage valid', entityScope: 'all', severity: 'error', isActive: true, description: 'Ownership percentage must be between 0% and 100%' },
    { id: 'vr-008', name: 'No duplicate COA codes', entityScope: 'all', severity: 'error', isActive: true, description: 'Each entity must have unique chart of account codes' },
    { id: 'vr-009', name: 'Consolidation method matches ownership', entityScope: 'all', severity: 'warning', isActive: true, description: 'Consolidation method should be appropriate for ownership level' },
    { id: 'vr-010', name: 'Period data completeness', entityScope: 'all', severity: 'warning', isActive: false, description: 'All expected accounts should have data entries for the reporting period' },
  ],
  system: {
    version: '2.4.0',
    dbSize: '~4.2 MB',
    recordCount: 18547,
    lastBackup: '2024-12-15',
    nodeVersion: 'v22.0.0',
  },
};

export const demoCurrencyPairs: CurrencyPair[] = [
  { id: 'cp-1', fromCurrency: 'GBP', toCurrency: 'EUR', rateType: 'Closing', lastUpdated: '2024-12-31', source: 'ECB' },
  { id: 'cp-2', fromCurrency: 'USD', toCurrency: 'EUR', rateType: 'Closing', lastUpdated: '2024-12-31', source: 'ECB' },
  { id: 'cp-3', fromCurrency: 'GBP', toCurrency: 'EUR', rateType: 'Average', lastUpdated: '2024-12-31', source: 'ECB' },
  { id: 'cp-4', fromCurrency: 'USD', toCurrency: 'EUR', rateType: 'Average', lastUpdated: '2024-12-31', source: 'ECB' },
  { id: 'cp-5', fromCurrency: 'GBP', toCurrency: 'EUR', rateType: 'Historical', lastUpdated: '2024-01-01', source: 'Manual' },
];

export const demoApiEndpoints: ApiEndpointStatus[] = [
  { path: '/api/entities', method: 'GET', status: 'healthy', avgResponseTime: '45ms' },
  { path: '/api/entities', method: 'POST', status: 'healthy', avgResponseTime: '120ms' },
  { path: '/api/consolidation', method: 'GET', status: 'healthy', avgResponseTime: '80ms' },
  { path: '/api/consolidation', method: 'POST', status: 'healthy', avgResponseTime: '2500ms' },
  { path: '/api/kpis', method: 'GET', status: 'healthy', avgResponseTime: '65ms' },
  { path: '/api/scenarios', method: 'GET', status: 'healthy', avgResponseTime: '35ms' },
  { path: '/api/variance', method: 'GET', status: 'healthy', avgResponseTime: '55ms' },
  { path: '/api/exchange-rates', method: 'GET', status: 'healthy', avgResponseTime: '40ms' },
  { path: '/api/coa', method: 'GET', status: 'healthy', avgResponseTime: '50ms' },
  { path: '/api/import', method: 'POST', status: 'healthy', avgResponseTime: '800ms' },
  { path: '/api/audit', method: 'GET', status: 'healthy', avgResponseTime: '70ms' },
  { path: '/api/ic-transactions', method: 'GET', status: 'healthy', avgResponseTime: '90ms' },
  { path: '/api/reports', method: 'GET', status: 'healthy', avgResponseTime: '60ms' },
  { path: '/api/budget', method: 'GET', status: 'healthy', avgResponseTime: '75ms' },
  { path: '/api/settings', method: 'GET', status: 'healthy', avgResponseTime: '30ms' },
];

export const demoVersionHistory: VersionHistoryEntry[] = [
  { version: 'v2.4.0', date: '2025-01-15', notes: 'Settings & Configuration module, Budget vs Actual, Trend Analysis' },
  { version: 'v2.3.0', date: '2024-12-20', notes: 'IC Transactions, Reports Center, Health Scorecards' },
  { version: 'v2.2.0', date: '2024-12-01', notes: 'COA Management, Data Import, Audit Trail, Visual redesign' },
  { version: 'v2.1.0', date: '2024-11-15', notes: 'Entity Comparison, Consolidation engine improvements' },
  { version: 'v2.0.0', date: '2024-11-01', notes: 'Major redesign: 3-statement model, FX rates, scenarios' },
  { version: 'v1.0.0', date: '2024-10-01', notes: 'Initial release: Dashboard, Entities, Consolidation' },
];

export const demoTableCounts: TableCount[] = [
  { table: 'Entities', count: 5 },
  { table: 'Chart of Accounts', count: 76 },
  { table: 'COA Mappings', count: 380 },
  { table: 'Exchange Rates', count: 14 },
  { table: 'Trial Balances', count: 3540 },
  { table: 'IC Transactions', count: 48 },
  { table: 'Budget Entries', count: 240 },
  { table: 'Forecast Entries', count: 360 },
  { table: 'Consolidation Runs', count: 12 },
  { table: 'Scenarios', count: 3 },
];

export const defaultEnvironmentInfo: EnvironmentInfo = {
  nodeVersion: 'v22.0.0',
  dbType: 'SQLite',
  cacheStatus: 'Active',
  platform: 'Next.js 16',
  runtime: 'Bun',
};

// Build the per-table record counts from the live system stats. Returns null
// when the DB stats aren't present (so the demo counts stay in place rather than
// being overwritten with zeros).
export function buildTableCounts(sys: SystemSettings['system']): TableCount[] | null {
  if (sys.entityCount === undefined) return null;
  return [
    { table: 'Entities', count: sys.entityCount },
    { table: 'Chart of Accounts', count: sys.coaCount || 0 },
    { table: 'COA Mappings', count: sys.coaMappingCount || 0 },
    { table: 'Exchange Rates', count: sys.exchangeRateCount || 0 },
    { table: 'Trial Balances', count: sys.trialBalanceCount || 0 },
    { table: 'IC Transactions', count: sys.icTransactionCount || 0 },
    { table: 'Budget Entries', count: sys.budgetEntryCount || 0 },
    { table: 'Forecast Entries', count: sys.forecastCount || 0 },
    { table: 'Consolidation Runs', count: sys.consolidationRunCount || 0 },
    { table: 'Scenarios', count: sys.scenarioCount || 0 },
  ];
}

// Next sequential validation-rule id, e.g. 10 existing rules → 'vr-011'.
export function makeValidationRuleId(existingCount: number): string {
  return `vr-${String(existingCount + 1).padStart(3, '0')}`;
}

// Next sequential currency-pair id, e.g. 5 existing pairs → 'cp-6'.
export function makeCurrencyPairId(existingCount: number): string {
  return `cp-${existingCount + 1}`;
}

export function countActiveRules(rules: SystemSettings['validationRules']): number {
  return rules.filter(r => r.isActive).length;
}

export function countHealthyEndpoints(endpoints: ApiEndpointStatus[]): number {
  return endpoints.filter(e => e.status === 'healthy').length;
}
