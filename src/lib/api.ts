import { Entity, ConsolidatedResult, Scenario, VarianceData, ExchangeRateInfo, KPIs, COAAccount, COAMapping, ImportRecord, ImportHistoryEntry, AuditEntry, ICTransaction, GeneratedReport, BudgetVsActualSummary, BudgetVarianceDetail, TrendData, SystemSettings, CashFlowForecast, AppNotification, ChatMessage, ComplianceCheck, EntityCompliance, JurisdictionCompliance, Violation, JournalEntry, JournalEntryCreateRequest, WorkflowData } from './types';

const BASE_URL = '/api';

async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// ENTITIES
// ============================================================
export async function getEntities(search?: string): Promise<Entity[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const data = await fetchAPI<any>(`/entities${params}`);
  return data.entities || data;
}

export async function getEntity(id: string): Promise<Entity> {
  const data = await fetchAPI<any>(`/entities/${id}`);
  return data.entity || data;
}

export async function createEntity(data: Partial<Entity>): Promise<Entity> {
  const result = await fetchAPI<any>('/entities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.entity || result;
}

export async function updateEntity(id: string, data: Partial<Entity>): Promise<Entity> {
  const result = await fetchAPI<any>(`/entities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return result.entity || result;
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
  const data = await fetchAPI<any>('/packs');
  return data.packs || data;
}

export async function loadPack(packId: string, reset: boolean = true): Promise<any> {
  return fetchAPI('/packs', {
    method: 'POST',
    body: JSON.stringify({ packId, reset }),
  });
}

export async function createGroup(name: string, period?: string): Promise<any> {
  return fetchAPI('/packs', {
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
  const data = await fetchAPI<any>('/consolidation', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return data.result || data;
}

export async function getConsolidationRuns() {
  const data = await fetchAPI<any>('/consolidation');
  return data.runs || data;
}

// ============================================================
// KPIs
// ============================================================
export async function getKPIs(period: string, scenarioType: string = 'base'): Promise<{ kpis: KPIs; entityBreakdown: any[] }> {
  return fetchAPI(`/kpis?period=${period}&scenarioType=${scenarioType}`);
}

// ============================================================
// SCENARIOS
// ============================================================
export async function getScenarios(): Promise<Scenario[]> {
  const data = await fetchAPI<any>('/scenarios');
  return data.scenarios || data;
}

export async function createScenario(data: Partial<Scenario>): Promise<Scenario> {
  const result = await fetchAPI<any>('/scenarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.scenario || result;
}

export async function runScenario(scenarioId: string, basePeriod: string, entityCodes: string[]): Promise<any> {
  return fetchAPI('/scenarios/run', {
    method: 'POST',
    body: JSON.stringify({ scenarioId, basePeriod, entityCodes }),
  });
}

// ============================================================
// VARIANCE
// ============================================================
export async function getVariance(period: string): Promise<VarianceData[]> {
  const data = await fetchAPI<any>(`/variance?period=${period}`);
  return data.varianceData || data;
}

// ============================================================
// EXCHANGE RATES
// ============================================================
export async function getExchangeRates(currency?: string, rateType?: string): Promise<ExchangeRateInfo[]> {
  const params = new URLSearchParams();
  if (currency) params.set('currency', currency);
  if (rateType) params.set('rateType', rateType);
  const qs = params.toString();
  const data = await fetchAPI<any>(`/exchange-rates${qs ? `?${qs}` : ''}`);
  return data.rates || data;
}

export async function createExchangeRate(data: Partial<ExchangeRateInfo>): Promise<ExchangeRateInfo> {
  const result = await fetchAPI<any>('/exchange-rates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.rate || result;
}

// ============================================================
// CHART OF ACCOUNTS
// ============================================================
export async function getCOA(): Promise<COAAccount[]> {
  const data = await fetchAPI<any>('/coa?limit=100');
  return data.accounts || data;
}

export async function getCOAMappings(entityCode?: string): Promise<COAMapping[]> {
  const params = entityCode ? `?entityCode=${encodeURIComponent(entityCode)}` : '';
  const data = await fetchAPI<any>(`/coa/mappings${params}`);
  return data.mappings || data;
}

export async function createCOAAccount(data: Partial<COAAccount>): Promise<COAAccount> {
  const result = await fetchAPI<any>('/coa', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.account || result;
}

// ============================================================
// SEED
// ============================================================
export async function seedDatabase(): Promise<any> {
  return fetchAPI('/seed', { method: 'POST' });
}

// ============================================================
// DATA IMPORT
// ============================================================
export async function importTrialBalance(records: ImportRecord[]): Promise<{ imported: number; errors: string[] }> {
  const data = await fetchAPI<any>('/import', {
    method: 'POST',
    body: JSON.stringify({ records }),
  });
  return data;
}

export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  const data = await fetchAPI<any>('/import');
  return data.history || data;
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
  const data = await fetchAPI<any>(`/audit${qs ? `?${qs}` : ''}`);
  return data.entries || data;
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
  const data = await fetchAPI<any>(`/ic-transactions${qs ? `?${qs}` : ''}`);
  return data.transactions || data;
}

export async function runEliminations(period: string, entityCodes?: string[]): Promise<{ eliminated: number; errors: string[] }> {
  const data = await fetchAPI<any>('/ic-transactions/eliminate', {
    method: 'POST',
    body: JSON.stringify({ period, entityCodes }),
  });
  return data;
}

// ============================================================
// REPORTS
// ============================================================
export async function getReports(): Promise<GeneratedReport[]> {
  const data = await fetchAPI<any>('/reports');
  return data.reports || data;
}

export async function generateReport(params: { reportType: string; period: string; scenarioType?: string; entityCodes?: string[] }): Promise<GeneratedReport> {
  const data = await fetchAPI<any>('/reports', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.report || data;
}

// ============================================================
// BUDGET VS ACTUAL
// ============================================================
export async function getBudgetVsActual(params?: { period?: string; entityCode?: string }): Promise<{ summary: BudgetVsActualSummary; budget: any[]; actuals: any[] }> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  const data = await fetchAPI<any>(`/budget?${query.toString()}`);
  return data;
}

export async function getBudgetVariance(params?: { period?: string; entityCode?: string }): Promise<{ varianceData: BudgetVarianceDetail[] }> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  const data = await fetchAPI<any>(`/budget/variance?${query.toString()}`);
  return data;
}

export async function saveBudgetEntry(entry: { entityCode: string; period: string; entries: Array<{ groupCOACode: string; budgetAmount: number }> }) {
  const data = await fetchAPI<any>('/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return data;
}

// ============================================================
// TREND ANALYSIS
// ============================================================
export async function getTrendAnalysis(params?: { metric?: string; periods?: string; entityCode?: string }): Promise<TrendData> {
  const query = new URLSearchParams();
  if (params?.metric) query.set('metric', params.metric);
  if (params?.periods) query.set('periods', params.periods);
  if (params?.entityCode) query.set('entityCode', params.entityCode);
  const data = await fetchAPI<any>(`/trends?${query.toString()}`);
  return data;
}

// ============================================================
// SETTINGS
// ============================================================
export async function getSettings(): Promise<SystemSettings> {
  const data = await fetchAPI<any>('/settings');
  return data.settings || data;
}

export async function updateSettings(category: string, settings: Record<string, any>): Promise<{ success: boolean; message: string }> {
  const data = await fetchAPI<any>('/settings', {
    method: 'POST',
    body: JSON.stringify({ category, settings }),
  });
  return data;
}

// ============================================================
// CASH FLOW FORECAST
// ============================================================
export async function getForecast(params?: { period?: string; scenario?: string }): Promise<CashFlowForecast> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.scenario) query.set('scenario', params.scenario);
  const data = await fetchAPI<any>(`/forecast?${query.toString()}`);
  return data;
}

export async function saveForecastAssumptions(assumptions: {
  revenueGrowthRate: number;
  capexGrowthRate: number;
  workingCapitalDays: number;
  debtRepaymentSchedule: number;
}): Promise<{ success: boolean; message: string; data: CashFlowForecast }> {
  const data = await fetchAPI<any>('/forecast', {
    method: 'POST',
    body: JSON.stringify(assumptions),
  });
  return data;
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function getNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number; total: number }> {
  const data = await fetchAPI<any>('/notifications');
  return data;
}

export async function markNotificationsRead(notificationIds: string[]): Promise<{ success: boolean; markedRead: number; unreadCount: number }> {
  const data = await fetchAPI<any>('/notifications', {
    method: 'POST',
    body: JSON.stringify({ notificationIds }),
  });
  return data;
}

// ============================================================
// AI CHAT
// ============================================================
export async function sendAIChatMessage(
  message: string,
  sessionId?: string,
  context?: { period?: string; scenarioType?: string; entityCodes?: string[] }
): Promise<{ response: string; sessionId: string; timestamp: string }> {
  const data = await fetchAPI<any>('/ai-chat', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId, context }),
  });
  return data;
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
  const data = await fetchAPI<any>(`/journal-entries${query.toString() ? `?${query.toString()}` : ''}`);
  return data.entries || data;
}

export async function createJournalEntry(request: JournalEntryCreateRequest): Promise<JournalEntry> {
  const data = await fetchAPI<any>('/journal-entries', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return data.entry || data;
}

// ============================================================
// WORKFLOW
// ============================================================
export async function getWorkflow(params?: { period?: string }): Promise<WorkflowData> {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  const data = await fetchAPI<any>(`/workflow${query.toString() ? `?${query.toString()}` : ''}`);
  return data.workflow || data;
}
