import { describe, expect, it } from 'vitest';
import {
  applyEliminations,
  buildEliminationEntries,
  buildSaleEliminationEntries,
  counterpartyPair,
  eliminationKey,
  summarizeEliminations,
  type ICSaleFlow,
} from './eliminations';
import {
  aggregateFinancials,
  assertBalanced,
  deriveBalanceSheet,
  deriveIncomeStatement,
  type FinancialStatements,
} from './statements';
import { createEmptyBS, createEmptyCF, createEmptyIS } from './account-maps';

// Pure unit tests for the intercompany elimination module (MEDIUM.3/4/5).

function statements(): FinancialStatements {
  return { incomeStatement: createEmptyIS(), balanceSheet: createEmptyBS(), cashFlow: createEmptyCF() };
}

describe('counterpartyPair / eliminationKey', () => {
  it('is order-independent', () => {
    expect(counterpartyPair('MUSA', 'MERID')).toBe('MERID~MUSA');
    expect(counterpartyPair('MERID', 'MUSA')).toBe('MERID~MUSA');
  });

  it('keys an entry on (period, pair, account)', () => {
    const [entry] = buildSaleEliminationEntries('2024-12', { seller: 'A', buyer: 'B', revenue: 100 });
    expect(eliminationKey(entry)).toBe('2024-12|A~B|REV/COGS');
  });
});

describe('internal sale elimination (MEDIUM.5)', () => {
  it('de-grosses revenue and COGS by the transfer price, net-zero on EBITDA', () => {
    const [entry] = buildSaleEliminationEntries('2024-12', { seller: 'A', buyer: 'B', revenue: 1000 });
    expect(entry.kind).toBe('ic_sale');
    expect(entry.legs).toEqual([
      { statement: 'incomeStatement', line: 'revenue', delta: -1000 },
      { statement: 'incomeStatement', line: 'cogs', delta: +1000 },
    ]);
  });

  it('removes internal volume from the consolidated P&L without touching EBITDA', () => {
    // Seller A: revenue 1000, cogs -600. Buyer B on-sells everything: revenue
    // 1500 (to third parties), cogs -1000 (the 1000 it paid A). Group should show
    // external revenue 1500, external cost -600 → EBITDA 900 either way.
    const a = statements();
    a.incomeStatement.revenue = 1000; a.incomeStatement.cogs = -600;
    const b = statements();
    b.incomeStatement.revenue = 1500; b.incomeStatement.cogs = -1000;
    const consol = aggregateFinancials([a, b]);
    const ebitdaBefore = consol.incomeStatement.ebitda; // 2500 - 1600 = 900

    const entries = buildEliminationEntries('2024-12', [{ seller: 'A', buyer: 'B', revenue: 1000 }]);
    applyEliminations(consol, entries);

    expect(consol.incomeStatement.revenue).toBe(1500);
    expect(consol.incomeStatement.cogs).toBe(-600);
    expect(consol.incomeStatement.ebitda).toBe(900);
    expect(consol.incomeStatement.ebitda).toBe(ebitdaBefore); // EBITDA unchanged
  });
});

describe('unrealized inventory profit elimination (MEDIUM.4)', () => {
  it('reduces inventory and net income by the locked-in margin', () => {
    // A sells 1000 to B at 25% margin; B still holds half in inventory.
    // Unrealized profit = 1000 * 0.5 * 0.25 = 125.
    const flow: ICSaleFlow = {
      seller: 'A', buyer: 'B', revenue: 1000, margin: 0.25, fractionInEndingInventory: 0.5,
    };
    const entries = buildSaleEliminationEntries('2024-12', flow);
    const profit = entries.find((e) => e.kind === 'unrealized_inventory_profit')!;
    expect(profit.amount).toBe(125);
    expect(profit.legs).toEqual([
      { statement: 'balanceSheet', line: 'inventory', delta: -125 },
      { statement: 'incomeStatement', line: 'cogs', delta: -125 },
    ]);
  });

  it('keeps the consolidated sheet balanced after eliminating unrealized profit', () => {
    // Minimal balanced group, then add an internal sale leaving profit in stock.
    const e = statements();
    e.incomeStatement.revenue = 1000; e.incomeStatement.cogs = -750;
    e.balanceSheet.inventory = 500; e.balanceSheet.cash = 500;
    e.balanceSheet.shareCapital = 750;
    const consol = aggregateFinancials([e]);
    // net income 250 → retained earnings 250; assets 1000 = equity (750+250)
    expect(assertBalanced(consol.balanceSheet).balanced).toBe(true);

    const entries = buildEliminationEntries('2024-12', [
      { seller: 'A', buyer: 'B', revenue: 0, margin: 0.25, fractionInEndingInventory: 0.5, },
    ]);
    // revenue 0 ⇒ no sale entry; force an inventory-profit-only flow:
    const profitFlow = buildEliminationEntries('2024-12', [
      { seller: 'A', buyer: 'B', revenue: 400, margin: 0.25, fractionInEndingInventory: 1 },
    ]).filter((x) => x.kind === 'unrealized_inventory_profit');
    expect(entries.length).toBe(0); // revenue 0 and frac*margin*0 = 0

    applyEliminations(consol, profitFlow); // unrealized = 400*1*0.25 = 100
    expect(consol.balanceSheet.inventory).toBe(400);     // 500 - 100
    expect(consol.incomeStatement.netIncome).toBe(150);  // 250 - 100
    expect(assertBalanced(consol.balanceSheet).balanced).toBe(true);
  });
});

describe('intercompany receivable/payable elimination (MEDIUM.3)', () => {
  it('nets equal same-currency legs to zero with no FX residual', () => {
    const [entry] = buildSaleEliminationEntries('2024-12', {
      seller: 'A', buyer: 'B', revenue: 0, openBalance: { receivable: 300, payable: 300 },
    });
    expect(entry.kind).toBe('ic_balance');
    expect(entry.legs).toEqual([
      { statement: 'balanceSheet', line: 'icReceivable', delta: -300 },
      { statement: 'balanceSheet', line: 'icPayable', delta: -300 },
    ]);
  });

  it('removes the IC receivable and payable from the consolidated sheet', () => {
    const e = statements();
    e.balanceSheet.cash = 1000;
    e.balanceSheet.icReceivable = 300; // seller's leg
    e.balanceSheet.icPayable = 300;    // buyer's leg
    e.balanceSheet.shareCapital = 1000;
    const consol = aggregateFinancials([e]);
    expect(consol.balanceSheet.totalAssets).toBe(1300);

    const entries = buildEliminationEntries('2024-12', [
      { seller: 'A', buyer: 'B', revenue: 0, openBalance: { receivable: 300, payable: 300 } },
    ]);
    applyEliminations(consol, entries);

    expect(consol.balanceSheet.icReceivable).toBe(0);
    expect(consol.balanceSheet.icPayable).toBe(0);
    expect(consol.balanceSheet.totalAssets).toBe(1000);
    expect(assertBalanced(consol.balanceSheet).balanced).toBe(true);
  });
});

describe('summarizeEliminations', () => {
  it('totals each elimination kind', () => {
    const entries = buildEliminationEntries('2024-12', [
      { seller: 'A', buyer: 'B', revenue: 1000, margin: 0.2, fractionInEndingInventory: 0.5, openBalance: { receivable: 200, payable: 200 } },
    ]);
    const s = summarizeEliminations(entries);
    expect(s.count).toBe(3);
    expect(s.internalSales).toBe(1000);
    expect(s.unrealizedProfit).toBe(100); // 1000*0.5*0.2
    expect(s.icBalances).toBe(200);
  });
});

describe('MERID (PT) → MUSA (US) cross-border stress test', () => {
  // The PLAN.md stress test: MERID sells to MUSA at 30% markup; MUSA has on-sold
  // only half by period end; the IC balance legs sit at different FX rates.
  // Exercises ic_sale + unrealized_inventory_profit + ic_balance (with FX) at once.
  it('eliminates sale, unrealized profit and the FX-mismatched IC balance, staying balanced', () => {
    // 30% markup on cost ⇒ margin on price = 0.30 / 1.30.
    const markup = 0.30;
    const marginOnPrice = markup / (1 + markup);
    const transferPrice = 1_300_000; // EUR equivalent of the internal sale

    // MERID (seller, EUR): recognised 1,300,000 internal revenue, cost 1,000,000.
    // Opening equity chosen so its standalone sheet balances.
    const merid = statements();
    merid.incomeStatement.revenue = 1_300_000;
    merid.incomeStatement.cogs = -1_000_000;          // net income 300,000
    merid.balanceSheet.icReceivable = 1_300_000;      // unpaid at year end (EUR book)
    merid.balanceSheet.cash = 1_000_000;
    merid.balanceSheet.shareCapital = 1_000_000;
    merid.balanceSheet.historicalRetainedEarnings = 1_000_000;
    // assets 2,300,000 = equity (1,000,000 + 1,300,000)

    // MUSA (buyer, USD→EUR): on-sold half of the goods for 900,000 to third
    // parties; cost of the half sold = 650,000 (half of the 1,300,000 it paid);
    // the other half (650,000) sits in inventory. Its IC payable was translated
    // at a weaker USD closing rate, so it lands at 1,260,000 EUR (vs MERID's
    // 1,300,000) — a 40,000 FX mismatch that surfaces only when the legs are netted.
    const musa = statements();
    musa.incomeStatement.revenue = 900_000;
    musa.incomeStatement.cogs = -650_000;             // net income 250,000
    musa.balanceSheet.inventory = 650_000;
    musa.balanceSheet.icPayable = 1_260_000;
    musa.balanceSheet.cash = 900_000;
    musa.balanceSheet.historicalRetainedEarnings = 40_000;
    // assets 1,550,000 = liab 1,260,000 + equity (40,000 + 250,000)

    const consol = aggregateFinancials([merid, musa]);
    expect(assertBalanced(consol.balanceSheet).balanced).toBe(true); // balanced before eliminating

    const flow: ICSaleFlow = {
      seller: 'MERID',
      buyer: 'MUSA',
      revenue: transferPrice,
      margin: marginOnPrice,
      fractionInEndingInventory: 0.5,
      openBalance: { receivable: 1_300_000, payable: 1_260_000 },
    };
    const entries = buildEliminationEntries('2024-12', flow ? [flow] : []);
    expect(entries.map((e) => e.kind)).toEqual([
      'ic_sale',
      'unrealized_inventory_profit',
      'ic_balance',
    ]);

    applyEliminations(consol, entries);

    // Internal sale gone: consolidated revenue = MUSA's external 900,000 only.
    expect(consol.incomeStatement.revenue).toBe(900_000);
    // Unrealized profit on the unsold half = 1,300,000 * 0.5 * (0.30/1.30) = 150,000.
    const unrealized = 1_300_000 * 0.5 * marginOnPrice;
    expect(unrealized).toBeCloseTo(150_000, 4);
    expect(consol.balanceSheet.inventory).toBeCloseTo(650_000 - 150_000, 2); // 500,000

    // IC balance netted; the 40,000 FX residual went to the CTA.
    expect(consol.balanceSheet.icReceivable).toBe(0);
    expect(consol.balanceSheet.icPayable).toBe(0);
    expect(consol.balanceSheet.cta).toBeCloseTo(1_260_000 - 1_300_000, 2); // -40,000

    // And the consolidated sheet still reconciles to the cent.
    expect(assertBalanced(consol.balanceSheet).balanced).toBe(true);
  });
});
