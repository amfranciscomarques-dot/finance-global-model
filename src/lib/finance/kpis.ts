// ============================================================
// FINANCE DOMAIN — KPI calculation (pure)
// ============================================================

import type { BalanceSheetData, CashFlowData, IncomeStatementData } from './account-maps';

export interface ConsolidatedKPIs {
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

/** Headline KPIs from consolidated statements. */
export function calculateKPIs(
  is: IncomeStatementData,
  bs: BalanceSheetData,
  _cf: CashFlowData,
): ConsolidatedKPIs {
  const totalRevenue = is.revenue;
  const totalEBITDA = is.ebitda;
  const ebitdaMargin = totalRevenue > 0 ? (totalEBITDA / totalRevenue) * 100 : 0;
  const netIncome = is.netIncome + is.minorityInterest;
  const totalAssets = bs.totalAssets;
  const netDebt = bs.shortTermDebt + bs.longTermDebt - bs.cash;
  const totalEquity = bs.totalEquity;
  const leverage = totalEBITDA !== 0 ? netDebt / totalEBITDA : 0;
  const roe = totalEquity !== 0 ? (netIncome / totalEquity) * 100 : 0;
  const roce = (totalAssets - bs.currentLiabilities) !== 0
    ? (is.ebit / (totalAssets - bs.currentLiabilities)) * 100 : 0;
  const liquidityRatio = bs.currentLiabilities !== 0
    ? bs.currentAssets / bs.currentLiabilities : 0;

  return {
    totalRevenue,
    totalEBITDA,
    ebitdaMargin: Math.round(ebitdaMargin * 10) / 10,
    netIncome,
    totalAssets,
    netDebt: Math.round(netDebt),
    leverage: Math.round(leverage * 100) / 100,
    roe: Math.round(roe * 10) / 10,
    roce: Math.round(roce * 10) / 10,
    liquidityRatio: Math.round(liquidityRatio * 100) / 100,
  };
}
