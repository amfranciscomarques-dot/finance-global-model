import type { BalanceSheetData, CashFlowData, IncomeStatementData } from './finance/account-maps';

export interface Entity {
  id: string;
  code: string;
  legalName: string;
  countryCode: string;
  localCurrency: string;
  consolidationMethod: string;
  ownershipPercentage: number;
  sector: string | null;
  isActive: boolean;
}

export interface KPIs {
  totalRevenue: number;
  totalEBITDA: number;
  ebitdaMargin: number;
  netIncome: number;
  totalAssets: number;
  netDebt: number;
  leverage: number;
  roe: number;
  roce: number;
  liquidityRatio: number;
}

export interface IncomeStatement {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interestExpense: number;
  ebt: number;
  taxExpense: number;
  netIncome: number;
  minorityInterest: number;
}

export interface BalanceSheet {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  currentAssets: number;
  ppe: number;
  intangibleAssets: number;
  goodwill: number;
  nonCurrentAssets: number;
  totalAssets: number;
  accountsPayable: number;
  shortTermDebt: number;
  currentLiabilities: number;
  longTermDebt: number;
  nonCurrentLiabilities: number;
  totalLiabilities: number;
  shareCapital: number;
  retainedEarnings: number;
  minorityEquity: number;
  totalEquity: number;
  balanceCheck: number;
}

export interface CashFlowStatement {
  netIncome: number;
  depreciation: number;
  changesInWorkingCapital: number;
  operatingCashFlow: number;
  capex: number;
  investingCashFlow: number;
  debtIssuance: number;
  debtRepayment: number;
  dividendsPaid: number;
  financingCashFlow: number;
  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;
}

export interface EntityBreakdown {
  entityCode: string;
  legalName: string;
  localCurrency: string;
  ownershipPercentage: number;
  consolidationMethod: string;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
}

export interface ConsolidatedResult {
  period: string;
  entities: string[];
  scenario: string;
  status?: string;
  balanceCheck?: number;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
  kpis: KPIs;
  eliminationsApplied: number;
  entityBreakdown?: EntityBreakdown[];
  eliminationDetails?: string[];
}

export interface Scenario {
  id: string;
  name: string;
  scenarioType: string;
  inflationRate: number;
  interestRate: number;
  fxVolatility: number;
  revenueGrowthFactor: number;
  opexGrowthFactor: number;
  capexGrowthFactor: number;
}

export interface VarianceData {
  metric: string;
  actual: number;
  budget: number;
  forecast: number;
  varianceVsBudget: number;
  varianceVsForecast: number;
  variancePctBudget: number;
}

export interface ExchangeRateInfo {
  id: string;
  currency: string;
  rateDate: string;
  rateType: string;
  rate: number;
  source: string;
}

// ============================================================
// CHART OF ACCOUNTS
// ============================================================

export interface COAAccount {
  id: string;
  code: string;
  name: string;
  accountType: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity';
  statementType: 'income' | 'balance' | 'cashflow';
  parentCode: string | null;
  level: number;
  isIntercompany: boolean;
  sortOrder: number;
  localMappings?: COAMapping[];
}

export interface COAMapping {
  id: string;
  entityCode: string;
  localAccountCode: string;
  localAccountName: string;
  localCOAType: string; // SNC, PGC, HGB, IFRS
  groupCOACode: string;
  groupCOA?: {
    code: string;
    name: string;
    accountType: string;
    statementType: string;
  };
}

// ============================================================
// DATA IMPORT
// ============================================================

export interface ImportRecord {
  entityCode: string;
  period: string;
  groupCOACode: string;
  amountLocal: number;
  currency: string;
  amountEUR?: number;
  exchangeRateUsed?: number;
  sourceSystem?: string;
  isIntercompany?: boolean;
  icPartnerEntityId?: string;
}

export interface ImportHistoryEntry {
  id: string;
  fileName: string;
  recordCount: number;
  entityCount: number;
  dateRange: string;
  totalAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  importedAt: string;
  errors?: string[];
}

// ============================================================
// AUDIT TRAIL
// ============================================================

export type AuditActionType = 'consolidation' | 'entity' | 'import' | 'fx';

export interface AuditEntry {
  id: string;
  timestamp: string;
  actionType: AuditActionType;
  description: string;
  user: string;
  affectedEntities: string[];
  details?: Record<string, unknown>;
}

// ============================================================
// INTERCOMPANY TRANSACTIONS
// ============================================================

export interface ICTransaction {
  id: string;
  transactionId: string;
  fromEntityId: string;
  fromEntityCode?: string;
  fromEntityName?: string;
  toEntityId: string;
  toEntityCode?: string;
  toEntityName?: string;
  amount: number;
  currency: string;
  amountEUR: number;
  transactionType: 'sale' | 'purchase' | 'service' | 'loan' | 'dividend';
  matchingReference: string | null;
  period: string;
  isEliminated: boolean;
  eliminationGroup: string | null;
  createdAt: string;
}

// ============================================================
// REPORTS
// ============================================================

export interface ReportTemplate {
  id: string;
  reportType: string;
  title: string;
  description: string;
  icon: string;
  lastGenerated: string | null;
  category: 'financial' | 'analysis' | 'compliance';
}

export interface GeneratedReport {
  id: string;
  reportType: string;
  title: string;
  period: string;
  scenarioType: string;
  entityCodes: string[];
  generatedAt: string;
  format: string;
  data?: Record<string, unknown>;
}

// ============================================================
// BUDGET VS ACTUAL
// ============================================================

export interface BudgetEntry {
  id: string;
  entityCode: string;
  period: string;
  groupCOACode: string;
  budgetAmount: number;
  actualAmount?: number;
  variance?: number;
  variancePct?: number;
}

export interface BudgetVsActualSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  variancePct: number;
  entityBreakdown: Array<{
    entityCode: string;
    entityName: string;
    totalBudget: number;
    totalActual: number;
    variance: number;
    variancePct: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    totalBudget: number;
    totalActual: number;
    variance: number;
    variancePct: number;
  }>;
}

export interface BudgetVarianceDetail {
  entityCode: string;
  entityName: string;
  groupCOACode: string;
  accountName: string;
  accountType: string;
  category: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
}

// ============================================================
// SYSTEM SETTINGS
// ============================================================

export interface ApiEndpointStatus {
  path: string;
  method: string;
  status: string;
  avgResponseTime: string;
}

export interface VersionHistoryEntry {
  version: string;
  date: string;
  notes: string;
}

export interface EnvironmentInfo {
  nodeVersion: string;
  dbType: string;
  cacheStatus: string;
  platform: string;
  runtime: string;
}

export interface SystemSettings {
  consolidation: {
    roundingTolerance: number;
    eliminationThreshold: number;
    minorityInterestMethod: string;
    balanceSheetTolerance: number;
    autoConsolidation: boolean;
  };
  currency: {
    baseCurrency: string;
    rateTypePreference: string;
    ecbApiEnabled: boolean;
    refreshFrequencyHours: number;
    exchangeRateProvider?: string;
  };
  validationRules: Array<{
    id: string;
    name: string;
    entityScope: string;
    severity: 'error' | 'warning';
    isActive: boolean;
    description: string;
  }>;
  system: {
    version: string;
    dbSize: string;
    recordCount: number;
    lastBackup: string;
    nodeVersion: string;
    // Optional extended fields returned by GET /api/settings (live DB stats)
    apiEndpoints?: ApiEndpointStatus[];
    versionHistory?: VersionHistoryEntry[];
    environment?: EnvironmentInfo;
    entityCount?: number;
    coaCount?: number;
    coaMappingCount?: number;
    exchangeRateCount?: number;
    trialBalanceCount?: number;
    icTransactionCount?: number;
    budgetEntryCount?: number;
    forecastCount?: number;
    consolidationRunCount?: number;
    scenarioCount?: number;
  };
}

export interface CurrencyPair {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rateType: string;
  lastUpdated: string;
  source: string;
}

// ============================================================
// TREND ANALYSIS
// ============================================================

export interface TrendPeriod {
  period: string;
  value: number;
  entityBreakdown: Array<{
    entityCode: string;
    entityName: string;
    value: number;
  }>;
}

export interface TrendData {
  metric: string;
  periods: TrendPeriod[];
  qoqChanges: Array<{
    fromPeriod: string;
    toPeriod: string;
    change: number;
    changePct: number;
  }>;
  yoyChanges: Array<{
    fromPeriod: string;
    toPeriod: string;
    change: number;
    changePct: number;
  }>;
  entityTrends: Array<{
    entityCode: string;
    entityName: string;
    currentPeriod: string;
    currentValue: number;
    previousValue: number;
    change: number;
    changePct: number;
    sparklineData: number[];
  }>;
}

// ============================================================
// CASH FLOW FORECAST
// ============================================================

export interface ForecastPeriod {
  month: string;
  isForecast: boolean;
  operatingCF: number;
  investingCF: number;
  financingCF: number;
  netChange: number;
  cumulativeCash: number;
  operatingCFHigh: number;
  operatingCFLow: number;
  investingCFHigh: number;
  investingCFLow: number;
  financingCFHigh: number;
  financingCFLow: number;
  netChangeHigh: number;
  netChangeLow: number;
  cumulativeCashHigh: number;
  cumulativeCashLow: number;
}

export interface CashFlowForecast {
  periods: ForecastPeriod[];
  assumptions: {
    revenueGrowthRate: number;
    capexGrowthRate: number;
    workingCapitalDays: number;
    debtRepaymentSchedule: number;
  };
  keyMetrics: {
    currentCashPosition: number;
    projected6MCash: number;
    operatingCFForecast: number;
    freeCashFlowForecast: number;
    cashRunwayMonths: number;
    breakevenMonth: string;
    minCashPosition: number;
    minCashMonth: string;
  };
  scenarioComparison: {
    optimistic: { totalNetChange: number; label: string };
    base: { totalNetChange: number; label: string };
    pessimistic: { totalNetChange: number; label: string };
  };
  // Driver-based annual projection from the pure kernel (finance/project.ts):
  // full, balanced IS/BS/CF for each forecast year. Backward-compatible addition
  // — older clients ignore it; the cash-flow chart still reads `periods`.
  projection?: ForecastProjection;
}

export interface ForecastProjectionYear {
  year: number;
  incomeStatement: IncomeStatementData;
  balanceSheet: BalanceSheetData;
  cashFlow: CashFlowData;
}

export interface ForecastProjection {
  /** Driver assumptions actually applied to the kernel (fractions, not %). */
  drivers: {
    revenueGrowthRate: number;
    grossMarginRate: number;
    receivableDays: number;
    capex: number;
    netDebtChange: number;
  };
  years: ForecastProjectionYear[];
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export type NotificationType = 'consolidation_complete' | 'fx_rate_change' | 'validation_warning' | 'data_import' | 'system_alert';
export type NotificationPriority = 'low' | 'medium' | 'high';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  priority: NotificationPriority;
  entityCode?: string;
}

// ============================================================
// AI INSIGHTS CHAT
// ============================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIChatSession {
  sessionId: string;
  messages: ChatMessage[];
  createdAt: string;
  lastActive: string;
}

// ============================================================
// COMPLIANCE
// ============================================================

export interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  category: 'financial' | 'regulatory' | 'operational';
  status: 'pass' | 'warning' | 'fail';
  score: number;
  details: string;
  affectedEntities: string[];
}

export interface EntityCompliance {
  entityCode: string;
  entityName: string;
  country: string;
  overallScore: number;
  checks: { checkId: string; status: 'pass' | 'warning' | 'fail'; details: string }[];
}

export interface JurisdictionCompliance {
  countryCode: string;
  countryName: string;
  flag: string;
  framework: string;
  complianceScore: number;
  filings: { name: string; deadline: string; status: 'filed' | 'pending' | 'overdue' }[];
}

export interface Violation {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  entityCode: string;
  description: string;
  detectedAt: string;
  remediation: string;
  status: 'open' | 'in_progress' | 'resolved';
}

// ============================================================
// JOURNAL ENTRIES
// ============================================================

export interface JournalEntryLine {
  entityCode: string;
  accountCode: string;
  accountName?: string;
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  period: string;
  description: string;
  lines: JournalEntryLine[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  status: 'draft' | 'posted' | 'reversed';
  createdAt: string;
  createdBy?: string;
}

export interface JournalEntryCreateRequest {
  period: string;
  description: string;
  lines: JournalEntryLine[];
}

// ============================================================
// WORKFLOW
// ============================================================

export type WorkflowStepStatus = 'complete' | 'pending' | 'in_progress';

export interface WorkflowStep {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  completedAt: string | null;
  description: string;
  metrics?: string;
  navigateTo?: string;
  navigateLabel?: string;
}

export interface WorkflowData {
  steps: WorkflowStep[];
  overallProgress: number;
  lastCompletedStep: string | null;
  estimatedTimeRemaining: string;
}

// ============================================================
// OPERATIONS (bottom-up product / material / market / channel detail)
// ============================================================

export type OperationalProductType = 'manufactured' | 'merchandise';

export interface OperationalProductLine {
  code: string;
  name: string;
  productType: OperationalProductType;
  volume: number;
  pricePerUnit: number;
  unitCost: number;       // CIP — full unit cost
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number; // 0..1
}

export interface OperationalStatement {
  entityCode: string;
  revenueTotal: number;
  cogs: { materials: number; labor: number; overhead: number; total: number };
  grossProfit: number;
  grossMarginPct: number;
  byProduct: OperationalProductLine[];
  byMaterial: Array<{ code: string; name: string; cost: number; unit?: string; unitCost?: number }>;
  byMarket: Array<{ market: string; revenue: number; volume: number }>;
  byChannel: Array<{ channel: string; revenue: number; volume: number }>;
  allocations: Array<{ productCode: string; productName: string; market: string; channel: string; revenue: number; volume: number }>;
}

export interface OperationsData {
  statement: OperationalStatement | null;
  entityCode?: string;
  entityCodes: string[];
}
