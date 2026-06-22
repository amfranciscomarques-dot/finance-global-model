import { Entity, ConsolidatedResult, Scenario, VarianceData, ExchangeRateInfo, KPIs, COAAccount, COAMapping, ImportRecord, ImportHistoryEntry, AuditEntry, ICTransaction, GeneratedReport, BudgetVsActualSummary, BudgetVarianceDetail, TrendData, SystemSettings, CashFlowForecast, AppNotification, ComplianceCheck, EntityCompliance, JurisdictionCompliance, TaxJurisdiction, Violation, JournalEntry, JournalEntryCreateRequest, WorkflowData, OperationsData } from './types';

const BASE_URL = '/api';

async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: 'Request failed' }))) as { error?: string };
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Several endpoints return their payload either bare or wrapped in a single
// named envelope key (e.g. GET /entities → `Entity[]` OR `{ entities: Entity[] }`).
// `unwrap` returns the wrapped value when present, otherwise the response itself —
// preserving the original `data.key || data` behaviour without resorting to `any`.
function unwrap<T>(data: unknown, key: string): T {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const wrapped = (data as Record<string, unknown>)[key];
    if (wrapped !== undefined && wrapped !== null) return wrapped as T;
  }
  return data as T;
}

// Generic result shape for mutation endpoints whose response body callers don't
// read field-by-field (load pack, seed, run scenario, save budget, ...).
export interface ActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ============================================================
// ENTITIES
// ============================================================
export async function getEntities(search?: string): Promise<Entity[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const data = await fetchAPI<unknown>(`/entities${params}`);
  return unwrap<Entity[]>(data, 'entities');
}

export async function getEntity(id: string): Promise<Entity> {
  const data = await fetchAPI<unknown>(`/entities/${id}`);
  return unwrap<Entity>(data, 'entity');
}

export async function createEntity(data: Partial<Entity>): Promise<Entity> {
  const result = await fetchAPI<unknown>('/entities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return unwrap<Entity>(result, 'entity');
}

export async function updateEntity(id: string, data: Partial<Entity>): Promise<Entity> {
  const result = await fetchAPI<unknown>(`/entities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return unwrap<Entity>(result, 'entity');
}

// ============================================================
// COMPANY PACKS (GROUPS)
// ============================================================
export interface PackEntitySummary {
  code: string;
  legalName: string;
  countryCode: string;
  localCurrency: string;
}

export interface PackSummary {
  id: string;
  name: string;
  description: string;
  period: string;
  entities: PackEntitySummary[];
  projects: string[];
}

export async function getPacks(): Promise<PackSummary[]> {
  const data = await fetchAPI<unknown>('/packs');
  return unwrap<PackSummary[]>(data, 'packs');
}

export async function loadPack(packId: string, reset: boolean = true): Promise<ActionResult> {
  return fetchAPI<ActionResult>('/packs', {
    method: 'POST',
    body: JSON.stringify({ packId, reset }),
  });
}

export async function createGroup(name: string, period?: string): Promise<ActionResult> {
  return fetchAPI<ActionResult>('/packs', {
    method: 'POST',
    body: JSON.stringify({ newGroup: { name, ...(period ? { period } : {}) } }),
  });
}

// ============================================================
// CONSOLIDATION
// ============================================================
export interface ConsolidationRequest {
  period: string;
  entityCodes: string[];
  scenarioType: string;
}

export async function runConsolidation(request: ConsolidationRequest): Promise<ConsolidatedResult> {
  const data = await fetchAPI<unknown>('/consolidation', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return unwrap<ConsolidatedResult>(data, 'result');
}

// Raw audit-trail row as persisted by the consolidation engine (see prisma
// ConsolidationRun). The dashboard/consolidation views map this into their own
// display shape.
export interface ConsolidationRunRecord {
  id: string;
  period: string;
  entityCodes: string;
  scenarioType: string;
  status: string;
  eliminationsApplied: number;
  totalRevenue: number | null;
  totalEBITDA: number | null;
  totalNetIncome: number | null;
  totalAssets: number | null;
  netDebt: number | null;
  ebitdaMargin: number | null;
  leverage: number | null;
  processingTimeMs: number | null;
  createdAt: string;
}

export async function getConsolidationRuns(): Promise<ConsolidationRunRecord[]> {
  const data = await fetchAPI<unknown>('/consolidation');
  return unwrap<ConsolidationRunRecord[]>(data, 'runs');
}

// ============================================================
// KPIs
// ============================================================
export async function getKPIs(period: string, scenarioType: string = 'base'): Promise<{ kpis: KPIs; entityBreakdown: unknown[] }> {
  return fetchAPI(`/kpis?period=${period}&scenarioType=${scenarioType}`);
}

// ============================================================
// SCENARIOS
// ============================================================
export async function getScenarios(): Promise<Scenario[]> {
  const data = await fetchAPI<unknown>('/scenarios');
  return unwrap<Scenario[]>(data, 'scenarios');
}

export async function createScenario(data: Partial<Scenario>): Promise<Scenario> {
  const result = await fetchAPI<unknown>('/scenarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return unwrap<Scenario>(result, 'scenario');
}

export async function runScenario(scenarioId: string, basePeriod: string, entityCodes: string[]): Promise<ActionResult> {
  return fetchAPI<ActionResult>('/scenarios/run', {
    method: 'POST',
    body: JSON.stringify({ scenarioId, basePeriod, entityCodes }),
  });
}

// ============================================================
// VARIANCE
// ============================================================
export async function getVariance(period: string): Promise<VarianceData[]> {
  const data = await fetchAPI<unknown>(`/variance?period=${period}`);
  return unwrap<VarianceData[]>(data, 'varianceData');
}

// ============================================================
// EXCHANGE RATES
// ============================================================
export async function getExchangeRates(currency?: string, rateType?: string): Promise<ExchangeRateInfo[]> {
  const params = new URLSearchParams();
  if (currency) params.set('currency', currency);
  if (rateType) params.set('rateType', rateType);
  const qs = params.toString();
  const data = await fetchAPI<unknown>(`/exchange-rates${qs ? `?${qs}` : ''}`);
  return unwrap<ExchangeRateInfo[]>(data, 'rates');
}

export async function createExchangeRate(data: Partial<ExchangeRateInfo>): Promise<ExchangeRateInfo> {
  const result = await fetchAPI<unknown>('/exchange-rates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return unwrap<ExchangeRateInfo>(result, 'rate');
}

// ============================================================
// CHART OF ACCOUNTS
// ============================================================
export async function getCOA(): Promise<COAAccount[]> {
  const data = await fetchAPI<unknown>('/coa?limit=100');
  return unwrap<COAAccount[]>(data, 'accounts');
}

export async function getCOAMappings(entityCode?: string): Promise<COAMapping[]> {
  const params = entityCode ? `?entityCode=${encodeURIComponent(entityCode)}` : '';
  const data = await fetchAPI<unknown>(`/coa/mappings${params}`);
  return unwrap<COAMapping[]>(data, 'mappings');
}

export async function createCOAAccount(data: Partial<COAAccount>): Promise<COAAccount> {
  const result = await fetchAPI<unknown>('/coa', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return unwrap<COAAccount>(result, 'account');
}

// ============================================================
// SEED
// ============================================================
export async function seedDatabase(): Promise<ActionResult> {
  return fetchAPI<ActionResult>('/seed', { method: 'POST' });
}

// ============================================================
// DATA IMPORT
// ============================================================
export async function importTrialBalance(records: ImportRecord[]): Promise<{ imported: number; errors: string[] }> {
  return fetchAPI<{ imported: number; errors: string[] }>('/import', {
    method: 'POST',
    body: JSON.stringify({ records }),
  });
}

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  const data = await fetchAPI<unknown>('/import');
  return unwrap<ImportHistoryEntry[]>(data, 'history');
}

// ============================================================
// AUDIT TRAIL
// ============================================================
export async function getAuditTrail(filters?: { actionType?: string; dateFrom?: string; dateTo?: string }): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (filters?.actionType) params.set('actionType', filters.actionType);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  const data = await fetchAPI<unknown>(`/audit${qs ? `?${qs}` : ''}`);
  return unwrap<AuditEntry[]>(data, 'entries');
}

// ============================================================
// INTERCOMPANY TRANSACTIONS
// ============================================================
export async function getICTransactions(filters?: { entity?: string; type?: string; status?: string; period?: string }): Promise<ICTransaction[]> {
  const params = new URLSearchParams();
  if (filters?.entity) params.set('entity', filters.entity);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.period) params.set('period', filters.period);
  const qs = params.toString();
  const data = await fetchAPI<unknown>(`/ic-transactions${qs ? `?${qs}` : ''}`);
  return unwrap<ICTransaction[]>(data, 'transactions');
}

export async function runEliminations(period: string, entityCodes?: string[]): Promise<{ eliminated: number; errors: string[] }> {
  return fetchAPI<{ eliminated: number; errors: string[] }>('/ic-transactions/eliminate', {
    method: 'POST',
    body: JSON.stringify({ period, entityCodes }),
  });
}

// ============================================================
// REPORTS
// ============================================================
export async function getReports(): Promise<GeneratedReport[]> {
  const data = await fetchAPI<unknown>('/reports');
  return unwrap<GeneratedReport[]>(data, 'reports');
}

export async function generateReport(params: { reportType: string; period: string; scenarioType?: string; entityCodes?: string[] }): Promise<GeneratedReport> {
  const data = await fetchAPI<unknown>('/reports', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return unwrap<GeneratedReport>(data, 'report');
}

// ============================================================
// BUDGET VS ACTUAL
// ============================================================
export async function getBudgetVsActual(params?: { period?: string; entityCode?: string }): Promise<{ summary: BudgetVsActualSummary; budget: unknown[]; actuals: unknown[] }> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  return fetchAPI(`/budget?${query.toString()}`);
}

export async function getBudgetVariance(params?: { period?: string; entityCode?: string }): Promise<{ varianceData: BudgetVarianceDetail[] }> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  return fetchAPI(`/budget/variance?${query.toString()}`);
}

export async function saveBudgetEntry(entry: { entityCode: string; period: string; entries: Array<{ groupCOACode: string; budgetAmount: number }> }): Promise<ActionResult> {
  return fetchAPI<ActionResult>('/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
}

// ============================================================
// TREND ANALYSIS
// ============================================================
export async function getTrendAnalysis(params?: { metric?: string; periods?: string; entityCode?: string }): Promise<TrendData> {
  const query = new URLSearchParams();
  if (params?.metric) query.set('metric', params.metric);
  if (params?.periods) query.set('periods', params.periods);
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  return fetchAPI<TrendData>(`/trends?${query.toString()}`);
}

// ============================================================
// SETTINGS
// ============================================================
export async function getSettings(): Promise<SystemSettings> {
  const data = await fetchAPI<unknown>('/settings');
  return unwrap<SystemSettings>(data, 'settings');
}

export async function updateSettings(category: string, settings: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
  return fetchAPI<{ success: boolean; message: string }>('/settings', {
    method: 'POST',
    body: JSON.stringify({ category, settings }),
  });
}

// ============================================================
// CASH FLOW FORECAST
// ============================================================
export async function getForecast(params?: { period?: string; scenario?: string }): Promise<CashFlowForecast> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.scenario) query.set('scenario', params.scenario);
  return fetchAPI<CashFlowForecast>(`/forecast?${query.toString()}`);
}

export async function saveForecastAssumptions(assumptions: {
  revenueGrowthRate: number;
  capexGrowthRate: number;
  workingCapitalDays: number;
  debtRepaymentSchedule: number;
}): Promise<{ success: boolean; message: string; data: CashFlowForecast }> {
  return fetchAPI<{ success: boolean; message: string; data: CashFlowForecast }>('/forecast', {
    method: 'POST',
    body: JSON.stringify(assumptions),
  });
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function getNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number; total: number }> {
  return fetchAPI<{ notifications: AppNotification[]; unreadCount: number; total: number }>('/notifications');
}

export async function markNotificationsRead(notificationIds: string[]): Promise<{ success: boolean; markedRead: number; unreadCount: number }> {
  return fetchAPI<{ success: boolean; markedRead: number; unreadCount: number }>('/notifications', {
    method: 'POST',
    body: JSON.stringify({ notificationIds }),
  });
}

// ============================================================
// AI CHAT
// ============================================================
export async function sendAIChatMessage(
  message: string,
  sessionId?: string,
  context?: { period?: string; scenarioType?: string; entityCodes?: string[] }
): Promise<{ response: string; sessionId: string; timestamp: string }> {
  return fetchAPI<{ response: string; sessionId: string; timestamp: string }>('/ai-chat', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId, context }),
  });
}

// ============================================================
// EXCEL EXPORT
// ============================================================
export async function exportExcel(params: {
  reportType: string;
  period: string;
  scenarioType?: string;
  entityCodes?: string[];
}): Promise<Blob> {
  const query = new URLSearchParams();
  query.set('reportType', params.reportType);
  query.set('period', params.period);
  if (params.scenarioType) query.set('scenarioType', params.scenarioType);
  if (params.entityCodes) query.set('entityCodes', params.entityCodes.join(','));
  const res = await fetch(`/api/export/excel?${query.toString()}`);
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}

// ============================================================
// PDF EXPORT
// ============================================================
export async function exportPDF(params: { reportType: string; period: string; scenarioType?: string; entityCodes?: string[] }): Promise<Blob> {
  const query = new URLSearchParams();
  query.set('reportType', params.reportType);
  query.set('period', params.period);
  if (params.scenarioType) query.set('scenarioType', params.scenarioType);
  if (params.entityCodes) query.set('entityCodes', params.entityCodes.join(','));
  const res = await fetch(`/api/export/pdf?${query.toString()}`);
  if (!res.ok) throw new Error('PDF export failed');
  return res.blob();
}

// ============================================================
// COMPLIANCE
// ============================================================
export interface ComplianceData {
  overallScore: number;
  overallStatus: 'compliant' | 'warning' | 'non-compliant';
  checks: ComplianceCheck[];
  entities: EntityCompliance[];
  jurisdictions: JurisdictionCompliance[];
  taxByJurisdiction: TaxJurisdiction[];
  recentViolations: Violation[];
  trend: { period: string; score: number }[];
  lastChecked: string;
}

export async function getCompliance(params?: { period?: string }): Promise<ComplianceData> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  const data = await fetchAPI<ComplianceData>(`/compliance?${query.toString()}`);
  return data;
}

// ============================================================
// JOURNAL ENTRIES
// ============================================================
export async function getJournalEntries(params?: { period?: string }): Promise<JournalEntry[]> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  const data = await fetchAPI<unknown>(`/journal-entries${query.toString() ? `?${query.toString()}` : ''}`);
  return unwrap<JournalEntry[]>(data, 'entries');
}

export async function createJournalEntry(request: JournalEntryCreateRequest): Promise<JournalEntry> {
  const data = await fetchAPI<unknown>('/journal-entries', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return unwrap<JournalEntry>(data, 'entry');
}

// ============================================================
// WORKFLOW
// ============================================================
export async function getWorkflow(params?: { period?: string }): Promise<WorkflowData> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  const data = await fetchAPI<unknown>(`/workflow${query.toString() ? `?${query.toString()}` : ''}`);
  return unwrap<WorkflowData>(data, 'workflow');
}

// ============================================================
// OPERATIONS
// ============================================================
export async function getOperations(params?: { entityCode?: string }): Promise<OperationsData> {
  const query = new URLSearchParams();
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  return fetchAPI<OperationsData>(`/operations${query.toString() ? `?${query.toString()}` : ''}`);
}
