// ============================================================
// Shared reference data: Group Chart of Accounts, FX rates, scenarios.
// Shared by every company pack (loaded via POST /api/packs). Kept separate so
// the group COA is a single source of truth for new seeds.
// ============================================================

export interface CoaDef {
  code: string;
  name: string;
  accountType: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity';
  statementType: 'income' | 'balance' | 'cashflow';
  level: number;
  isIntercompany?: boolean;
  sortOrder: number;
}

export const CHART_OF_ACCOUNTS: CoaDef[] = [
  // Revenue
  { code: 'REV-001', name: 'Vendas (VN)', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 1 },
  { code: 'REV-002', name: 'Prestação de Serviços', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 2 },
  { code: 'REV-003', name: 'Licensing Revenue', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 3 },
  { code: 'REV-004', name: 'Support & Maintenance', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 4 },
  { code: 'REV-005', name: 'Consulting Revenue', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 5 },
  { code: 'REV-006', name: 'Cloud SaaS Revenue', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 6 },
  { code: 'REV-007', name: 'Training Revenue', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 7 },
  { code: 'REV-008', name: 'Outros Rendimentos', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 8 },
  { code: 'REV-009', name: 'IC Sales Revenue', accountType: 'revenue', statementType: 'income', level: 2, isIntercompany: true, sortOrder: 9 },
  { code: 'REV-010', name: 'Variação Inventários da Produção', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 10 },

  // COGS
  { code: 'COGS-001', name: 'CMVMC', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 11 },
  { code: 'COGS-002', name: 'Direct Labor', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 12 },
  { code: 'COGS-003', name: 'Manufacturing Overhead', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 13 },
  { code: 'COGS-004', name: 'Subcontracted Services', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 14 },
  { code: 'COGS-005', name: 'IC Purchase Costs', accountType: 'expense', statementType: 'income', level: 2, isIntercompany: true, sortOrder: 15 },

  // OPEX
  { code: 'OPX-001', name: 'Rent & Facilities', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 16 },
  { code: 'OPX-002', name: 'Marketing & Sales', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 17 },
  { code: 'OPX-003', name: 'IT & Technology', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 18 },
  { code: 'OPX-004', name: 'FSE (Fornecimentos e Serviços Externos)', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 19 },
  { code: 'OPX-005', name: 'Travel & Entertainment', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 20 },
  { code: 'OPX-006', name: 'Insurance', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 21 },
  { code: 'OPX-007', name: 'Office Supplies', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 22 },
  { code: 'OPX-008', name: 'Utilities', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 23 },
  { code: 'OPX-009', name: 'R&D Expenses', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 24 },
  { code: 'OPX-010', name: 'Outros Gastos e Imparidades', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 25 },

  // Payroll
  { code: 'PAY-001', name: 'Gastos com Pessoal', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 26 },
  { code: 'PAY-002', name: 'Social Security Contributions', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 27 },
  { code: 'PAY-003', name: 'Pension Costs', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 28 },
  { code: 'PAY-004', name: 'Employee Benefits', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 29 },
  { code: 'PAY-005', name: 'Bonus & Incentives', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 30 },

  // Depreciation
  { code: 'DEP-001', name: 'Depreciation - Buildings', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 31 },
  { code: 'DEP-002', name: 'Depreciações e Amortizações', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 32 },
  { code: 'DEP-003', name: 'Depreciation - Vehicles', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 33 },
  { code: 'DEP-004', name: 'Amortization - Intangibles', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 34 },
  { code: 'DEP-005', name: 'Amortization - Goodwill', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 35 },

  // Interest
  { code: 'INT-001', name: 'Juros e Gastos de Financiamento', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 36 },
  { code: 'INT-002', name: 'Interest Expense - Bonds', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 37 },
  { code: 'INT-003', name: 'Rendimentos Financeiros', accountType: 'revenue', statementType: 'income', level: 2, sortOrder: 38 },

  // Tax
  { code: 'TAX-001', name: 'IRC (Imposto sobre o Rendimento)', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 39 },
  { code: 'TAX-002', name: 'Deferred Tax', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 40 },
  { code: 'TAX-003', name: 'Other Taxes', accountType: 'expense', statementType: 'income', level: 2, sortOrder: 41 },

  // Assets
  { code: 'AST-001', name: 'Caixa e Depósitos', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 42 },
  { code: 'AST-002', name: 'Clientes', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 43 },
  { code: 'AST-003', name: 'Inventários', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 44 },
  { code: 'AST-004', name: 'Outros Ativos Correntes', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 45 },
  { code: 'AST-005', name: 'Ativos Fixos Tangíveis', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 46 },
  { code: 'AST-006', name: 'Ativos Intangíveis', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 47 },
  { code: 'AST-007', name: 'Goodwill', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 48 },
  { code: 'AST-008', name: 'Outros Ativos Não Correntes', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 49 },
  { code: 'AST-009', name: 'IC Receivable', accountType: 'asset', statementType: 'balance', level: 2, isIntercompany: true, sortOrder: 50 },
  { code: 'AST-010', name: 'Deferred Tax Asset', accountType: 'asset', statementType: 'balance', level: 2, sortOrder: 51 },

  // Liabilities
  { code: 'LIA-001', name: 'Fornecedores', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 52 },
  { code: 'LIA-002', name: 'Empréstimos Correntes', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 53 },
  { code: 'LIA-003', name: 'Other Current Liabilities', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 54 },
  { code: 'LIA-004', name: 'Empréstimos Não Correntes', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 55 },
  { code: 'LIA-005', name: 'Other Non-Current Liabilities', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 56 },
  { code: 'LIA-006', name: 'IC Payable', accountType: 'liability', statementType: 'balance', level: 2, isIntercompany: true, sortOrder: 57 },
  { code: 'LIA-007', name: 'Outros Passivos Correntes', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 58 },
  { code: 'LIA-008', name: 'Tax Payable', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 59 },
  { code: 'LIA-009', name: 'Pension Obligations', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 60 },
  { code: 'LIA-010', name: 'Deferred Revenue', accountType: 'liability', statementType: 'balance', level: 2, sortOrder: 61 },

  // Equity
  { code: 'EQY-001', name: 'Capital Social', accountType: 'equity', statementType: 'balance', level: 2, sortOrder: 62 },
  { code: 'EQY-002', name: 'Reservas e Resultados Transitados', accountType: 'equity', statementType: 'balance', level: 2, sortOrder: 63 },
  { code: 'EQY-003', name: 'Interesses Minoritários', accountType: 'equity', statementType: 'balance', level: 2, sortOrder: 64 },
  { code: 'EQY-004', name: 'Other Reserves', accountType: 'equity', statementType: 'balance', level: 2, sortOrder: 65 },
  { code: 'EQY-005', name: 'Current Year Earnings', accountType: 'equity', statementType: 'balance', level: 2, sortOrder: 66 },

  // Intercompany
  { code: 'IC-001', name: 'IC Sales - Goods', accountType: 'revenue', statementType: 'income', level: 2, isIntercompany: true, sortOrder: 67 },
  { code: 'IC-002', name: 'IC Sales - Services', accountType: 'revenue', statementType: 'income', level: 2, isIntercompany: true, sortOrder: 68 },
  { code: 'IC-003', name: 'IC Purchases - Goods', accountType: 'expense', statementType: 'income', level: 2, isIntercompany: true, sortOrder: 69 },
  { code: 'IC-004', name: 'IC Loans Receivable', accountType: 'asset', statementType: 'balance', level: 2, isIntercompany: true, sortOrder: 70 },
  { code: 'IC-005', name: 'IC Loans Payable', accountType: 'liability', statementType: 'balance', level: 2, isIntercompany: true, sortOrder: 71 },

  // Cash flow adjustments
  { code: 'CFA-001', name: 'Changes in Working Capital', accountType: 'asset', statementType: 'cashflow', level: 2, sortOrder: 72 },
  { code: 'CFA-002', name: 'Capital Expenditure', accountType: 'asset', statementType: 'cashflow', level: 2, sortOrder: 73 },
  { code: 'CFA-003', name: 'Debt Issuance', accountType: 'liability', statementType: 'cashflow', level: 2, sortOrder: 74 },
  { code: 'CFA-004', name: 'Debt Repayment', accountType: 'liability', statementType: 'cashflow', level: 2, sortOrder: 75 },
  { code: 'CFA-005', name: 'Dividends Paid', accountType: 'equity', statementType: 'cashflow', level: 2, sortOrder: 76 },
];

export const EXCHANGE_RATES = [
  { currency: 'EUR', rateDate: '2024-12-31', rateType: 'closing', rate: 1.0000, source: 'ECB' },
  { currency: 'USD', rateDate: '2024-12-31', rateType: 'closing', rate: 1.0820, source: 'ECB' },
  { currency: 'USD', rateDate: '2024-12-31', rateType: 'average', rate: 1.0790, source: 'ECB' },
  { currency: 'USD', rateDate: '2024-01-01', rateType: 'historical', rate: 1.1040, source: 'ECB' },
  { currency: 'GBP', rateDate: '2024-12-31', rateType: 'closing', rate: 0.8571, source: 'ECB' },
];

export const SCENARIOS = [
  { name: 'Base Case', scenarioType: 'base', inflationRate: 2.0, interestRate: 4.15, fxVolatility: 5.0, revenueGrowthFactor: 1.0, opexGrowthFactor: 1.0, capexGrowthFactor: 1.0, description: 'Base trajectory (actuals)' },
  { name: 'Optimistic', scenarioType: 'optimistic', inflationRate: 1.8, interestRate: 3.75, fxVolatility: 3.0, revenueGrowthFactor: 1.12, opexGrowthFactor: 0.96, capexGrowthFactor: 1.05, description: 'Procura forte, custos controlados' },
  { name: 'Pessimistic', scenarioType: 'pessimistic', inflationRate: 4.0, interestRate: 5.25, fxVolatility: 12.0, revenueGrowthFactor: 0.88, opexGrowthFactor: 1.10, capexGrowthFactor: 0.90, description: 'Estagflação, custos a subir' },
];
