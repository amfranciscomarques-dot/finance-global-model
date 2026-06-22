import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { projectConsolidation, runConsolidation } from '@/lib/consolidation-engine';

// ============================================================
// GOLDEN-VALUE TESTS — lock the consolidation numbers so any refactor of the
// financial-domain logic is caught. The expected figures are derived by hand
// from the demo pack (src/lib/company-packs/template.ts), whose round numbers
// are chosen so every statement reconciles exactly.
//
// These run against an isolated DB (see src/test/setup-db.ts), re-seeded fresh
// here so intercompany-elimination flags start clean and results are
// deterministic across runs.
// ============================================================

const EUR = 0.01; // tolerance: numbers reconcile to the cent
const seed = () => seedCompanyPack(db, getCompanyPack('template')!, { reset: true });

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await db.$disconnect();
});

describe('runConsolidation — Meridian group, 2024-12 base', () => {
  it('reproduces the parent (MERID) standalone P&L and a balanced sheet', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    const merid = result.entityBreakdown.find((e) => e.entityCode === 'MERID');
    expect(merid).toBeDefined();

    // EBITDA / EBT / net income built up from the trial balance.
    expect(merid!.incomeStatement.ebitda).toBeCloseTo(5_000_000, 2);
    expect(merid!.incomeStatement.ebt).toBeCloseTo(2_000_000, 2);
    expect(merid!.incomeStatement.netIncome).toBeCloseTo(1_500_000, 2);

    // Balance sheet reconciles exactly.
    expect(Math.abs(merid!.balanceSheet.balanceCheck)).toBeLessThan(EUR);
  });

  it('anchors the subcontracting sub (MSUB) standalone net income to 250,000', async () => {
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    const msub = result.entityBreakdown.find((e) => e.entityCode === 'MSUB');
    expect(msub).toBeDefined();
    expect(msub!.incomeStatement.netIncome).toBeCloseTo(250_000, 2);
    expect(msub!.incomeStatement.ebitda).toBeCloseTo(600_000, 2);
  });

  it('eliminates the MSUB→MERID intercompany volume net-zero on EBITDA', async () => {
    // Re-seed so IC flags are pending again (the previous runs marked them).
    await seed();

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // €6,000,000 + €1,500,000 of internal sales removed from group revenue,
    // with the matching cost removed from COGS → net-zero EBITDA impact.
    expect(result.eliminationsApplied).toBeCloseTo(-7_500_000, 2);

    // Consolidated EBITDA / net income are the sum of the standalone figures.
    expect(result.incomeStatement.ebitda).toBeCloseTo(5_600_000, 2);
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);

    // Group balance sheet still reconciles.
    expect(Math.abs(result.balanceSheet.balanceCheck)).toBeLessThan(EUR);

    // A reconciling sheet must be reported as a completed (not failed) run.
    expect(result.status).toBe('completed');
    expect(Math.abs(result.balanceCheck)).toBeLessThan(EUR);
  });

  it('FAILS the run and records the imbalance when a trial balance is broken (integrity gate)', async () => {
    // Re-seed so the book starts reconciled, then deliberately corrupt the
    // parent's trial balance: inflate cash with no matching liability/equity,
    // so assets no longer equal liabilities + equity. This is the demo moment —
    // the gate must refuse to mark a broken book as a completed run.
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    expect(merid).toBeDefined();

    const periodDate = new Date('2024-12-01');
    const cashRow = await db.trialBalance.findFirst({
      where: { entityId: merid!.id, period: periodDate, groupCOACode: 'AST-001' },
    });
    expect(cashRow).toBeDefined();

    const BREAK = 1_000_000; // EUR of phantom cash, balancing nothing
    await db.trialBalance.update({
      where: { id: cashRow!.id },
      data: { amountEUR: cashRow!.amountEUR + BREAK },
    });

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // The gate refuses to mark a broken book completed...
    expect(result.status).toBe('failed');
    // ...and surfaces the signed imbalance (≈ the phantom asset we injected).
    expect(result.balanceCheck).toBeCloseTo(BREAK, 2);

    // The persisted audit row records BOTH the failure and the imbalance, so the
    // break is auditable after the fact (not just transient in the response).
    const run = await db.consolidationRun.findUnique({ where: { id: result.runId } });
    expect(run?.status).toBe('failed');
    expect(run?.balanceCheck ?? 0).toBeCloseTo(BREAK, 2);

    // Restore the reconciled book for any later tests.
    await seed();
  });

  it('does not double-net an IC flow present in BOTH the transaction table and matched TB rows (TOP.3)', async () => {
    // Re-seed so the demo IC flows (MSUB→MERID services, €7,500,000) start clean.
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    const msub = await db.entity.findFirst({ where: { code: 'MSUB' } });
    const periodDate = new Date('2024-12-01');

    // The SAME €3,000,000 internal sale, recorded twice: once as an
    // IntercompanyTransaction and once as a bilaterally-matched IC trial-balance
    // pair (REV-003 on both legs, an IS account). Pre-TOP.3 the engine netted it
    // from BOTH sources → −13,500,000. With the (pair, amount) dedup it is netted
    // once → −10,500,000 (the €7,500,000 demo services + this €3,000,000 sale).
    await db.intercompanyTransaction.create({
      data: {
        transactionId: 'IC-TEST-DEDUP-2024',
        fromEntityId: merid!.id,
        toEntityId: msub!.id,
        amount: 3_000_000,
        currency: 'EUR',
        amountEUR: 3_000_000,
        transactionType: 'sale',
        matchingReference: 'IC-TEST-DEDUP-2024',
        period: periodDate,
        isEliminated: false,
      },
    });
    for (const [entityId, partnerId] of [[merid!.id, msub!.id], [msub!.id, merid!.id]] as const) {
      await db.trialBalance.create({
        data: {
          entityId,
          period: periodDate,
          periodType: 'actual',
          groupCOACode: 'REV-003',
          amountLocal: 3_000_000,
          amountEUR: 3_000_000,
          currency: 'EUR',
          isIntercompany: true,
          icPartnerEntityId: partnerId,
          eliminationStatus: 'pending',
        },
      });
    }

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    expect(result.eliminationsApplied).toBeCloseTo(-10_500_000, 2);
    expect(result.eliminationsDeduped).toBe(1);

    await seed(); // restore the clean book for later tests
  });

  it('eliminates a matched IC receivable/payable off the consolidated sheet (MEDIUM.3)', async () => {
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    const msub = await db.entity.findFirst({ where: { code: 'MSUB' } });
    const periodDate = new Date('2024-12-01');
    const IC = 1_000_000;

    // MERID is owed €1,000,000 by MSUB (AST-009), balanced by extra reserves;
    // MSUB owes it (LIA-006), balanced by extra cash. The group is balanced
    // before elimination, and the two IC legs must net to zero after.
    await db.trialBalance.createMany({
      data: [
        { entityId: merid!.id, period: periodDate, periodType: 'actual', groupCOACode: 'AST-009', amountLocal: IC, amountEUR: IC, currency: 'EUR', isIntercompany: true, icPartnerEntityId: msub!.id },
        { entityId: merid!.id, period: periodDate, periodType: 'actual', groupCOACode: 'EQY-002', amountLocal: IC, amountEUR: IC, currency: 'EUR' },
        { entityId: msub!.id, period: periodDate, periodType: 'actual', groupCOACode: 'LIA-006', amountLocal: IC, amountEUR: IC, currency: 'EUR', isIntercompany: true, icPartnerEntityId: merid!.id },
        { entityId: msub!.id, period: periodDate, periodType: 'actual', groupCOACode: 'AST-001', amountLocal: IC, amountEUR: IC, currency: 'EUR' },
      ],
    });

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // Both IC legs netted to zero on the consolidated balance sheet…
    expect(result.balanceSheet.icReceivable).toBeCloseTo(0, 2);
    expect(result.balanceSheet.icPayable).toBeCloseTo(0, 2);
    // …via an explicit, auditable elimination entry…
    expect(result.eliminationEntries.some((e) => e.kind === 'ic_balance')).toBe(true);
    // …and the sheet still reconciles (a completed, not failed, run).
    expect(result.status).toBe('completed');
    expect(Math.abs(result.balanceCheck)).toBeLessThan(EUR);

    await seed(); // restore the clean book for later tests
  });

  it('is idempotent — re-running the same period yields identical numbers (regression)', async () => {
    // Elimination flags used to be flipped permanently, so a second run found
    // zero pending IC transactions and reported overstated revenue.
    await seed();

    const input = { period: '2024-12', entityCodes: ['MERID', 'MSUB'], scenarioType: 'base' };
    const first = await runConsolidation(input);
    const second = await runConsolidation(input);

    expect(second.eliminationsApplied).toBeCloseTo(first.eliminationsApplied, 2);
    expect(second.eliminationsApplied).toBeCloseTo(-7_500_000, 2);
    expect(second.incomeStatement.revenue).toBeCloseTo(first.incomeStatement.revenue, 2);
    expect(second.incomeStatement.ebitda).toBeCloseTo(5_600_000, 2);
    expect(second.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);
  });
});

describe('projectConsolidation — multi-period roll-forward (MEDIUM.7)', () => {
  it('rolls the consolidated state forward, each period balanced and RE linked', async () => {
    await seed();
    const { base, periods } = await projectConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
      years: 3,
      assumptionOverrides: { revenueGrowthRate: 0.05 },
    });

    expect(periods).toHaveLength(3);

    // Every projected consolidated balance sheet reconciles by construction.
    for (const p of periods) expect(Math.abs(p.balanceSheet.balanceCheck)).toBeLessThan(EUR);

    // Roll-forward linkage: each period's opening (historical) retained earnings
    // equals the PRIOR period's closing retained earnings, net of dividends paid.
    expect(periods[0].balanceSheet.historicalRetainedEarnings).toBeCloseTo(
      base.balanceSheet.retainedEarnings - periods[0].cashFlow.dividendsPaid,
      2,
    );
    expect(periods[1].balanceSheet.historicalRetainedEarnings).toBeCloseTo(
      periods[0].balanceSheet.retainedEarnings - periods[1].cashFlow.dividendsPaid,
      2,
    );

    // Revenue compounds at the override growth rate off the consolidated base.
    expect(periods[0].incomeStatement.revenue).toBeCloseTo(base.incomeStatement.revenue * 1.05, 2);
    expect(periods[1].incomeStatement.revenue).toBeCloseTo(periods[0].incomeStatement.revenue * 1.05, 2);
  });
});

describe('runConsolidation — minority interest on the balance sheet (MEDIUM.6)', () => {
  it('books NCI as (1 − ownership) × the subsidiary total equity, not just stored EQY-003', async () => {
    await seed();

    // An 80%-owned, fully consolidated subsidiary with NO stored EQY-003. Its
    // equity is share capital 1,000,000 + historical reserves 500,000 = 1,500,000
    // opening, plus 400,000 of current-year profit (REV 1,000,000 − COGS 600,000),
    // funded by 1,900,000 of cash so the standalone book reconciles.
    const nci = await db.entity.create({
      data: {
        code: 'MNCI', legalName: 'Meridian Partial S.A.', countryCode: 'PT',
        localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 0.8, sector: 'Manufacturing',
      },
    });
    const rows: Array<[string, number]> = [
      ['EQY-001', 1_000_000],   // share capital
      ['EQY-002', 500_000],     // historical reserves
      ['REV-001', 1_000_000],   // revenue
      ['COGS-001', -600_000],   // cost of sales → net income 400,000
      ['AST-001', 1_900_000],   // cash = opening equity 1,500,000 + profit 400,000
    ];
    for (const [code, amt] of rows) {
      await db.trialBalance.create({
        data: {
          entityId: nci.id, period: new Date('2024-12-01'), periodType: 'actual',
          groupCOACode: code, amountLocal: amt, amountEUR: amt, currency: 'EUR',
        },
      });
    }

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB', 'MNCI'],
      scenarioType: 'base',
    });

    // Minority's share of NET INCOME is carved out on the IS: 20% × 400,000.
    // (MERID/MSUB are wholly owned, so they contribute nothing here.)
    expect(result.incomeStatement.minorityInterest).toBeCloseTo(-80_000, 2);

    // Minority equity on the consolidated sheet is the FULL non-controlling share
    // of the subsidiary's equity — opening 1,500,000 + profit 400,000 = 1,900,000,
    // so 20% × 1,900,000 = 380,000. A stored-EQY-003-only reading would have shown 0.
    expect(result.balanceSheet.minorityEquity).toBeCloseTo(380_000, 2);

    // Reclassification is equity-total-neutral, so the group still reconciles.
    expect(result.status).toBe('completed');
    expect(Math.abs(result.balanceCheck)).toBeLessThan(EUR);

    await seed(); // restore the clean book for later tests
  });
});

describe('runConsolidation — tax reconciliation (B1/B2/B4)', () => {
  it('attaches an informational tax reconciliation without changing actual net income (B1)', async () => {
    await seed();
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // Net income on ACTUALS is untouched by reconciliation (golden value holds).
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);
    // PT group: stored 600,000 vs modelled 543,750 → +56,250 drift, comparable.
    expect(result.taxReconciliation.comparable).toBe(true);
    expect(result.taxReconciliation.drift).toBeCloseTo(56_250, 0);
  });

  it('flags the group non-comparable when an unmodelled jurisdiction is in scope (B2)', async () => {
    await seed();
    const de = await db.entity.create({
      data: {
        code: 'MDEU', legalName: 'Meridian Deutschland GmbH', countryCode: 'DE',
        localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Manufacturing',
      },
    });
    for (const [code, amt] of [['AST-001', 1_000_000], ['EQY-001', 1_000_000]] as const) {
      await db.trialBalance.create({
        data: {
          entityId: de.id, period: new Date('2024-12-01'), periodType: 'actual',
          groupCOACode: code, amountLocal: amt, amountEUR: amt, currency: 'EUR',
        },
      });
    }

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB', 'MDEU'],
      scenarioType: 'base',
    });
    expect(result.taxReconciliation.comparable).toBe(false);

    await seed(); // restore the clean book
  });

  it('replaces forecast tax with modelled IRC and keeps the group balanced (B4)', async () => {
    await seed();
    const base = await runConsolidation({ period: '2024-12', entityCodes: ['MERID', 'MSUB'], scenarioType: 'base' });
    const proj = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'optimistic',
      computeTaxForProjections: true,
    });

    // Modelled IRC (543,750) is lower than the booked 600,000 → higher net income.
    expect(proj.incomeStatement.netIncome).toBeGreaterThan(base.incomeStatement.netIncome);
    // After the override booked == modelled, so the drift collapses to ~0…
    expect(Math.abs(proj.taxReconciliation.drift)).toBeLessThan(1);
    // …and the incremental tax accrued as a payable keeps the sheet balanced.
    expect(proj.status).toBe('completed');
    expect(Math.abs(proj.balanceCheck)).toBeLessThan(1);
  });

  it('leaves forecast tax booked when the override flag is off (default)', async () => {
    await seed();
    const proj = await runConsolidation({ period: '2024-12', entityCodes: ['MERID', 'MSUB'], scenarioType: 'optimistic' });
    // No forecast rows → falls back to actuals; booked tax retained → same drift.
    expect(proj.taxReconciliation.drift).toBeCloseTo(56_250, 0);
  });
});

describe('runConsolidation — deferred tax (IAS 12, MEDIUM.8b)', () => {
  it('attaches a deferred-tax reconciliation without changing actual net income', async () => {
    await seed();
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // Actuals are untouched (golden value holds) — surfacing is additive.
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);

    // The demo books no AST-010 and a single actual period generates no
    // carryforwards, so both the booked and computed DTA are 0 — but the IAS 12
    // block is present and comparable, ready to go dynamic once openings are fed.
    expect(result.deferredTax.comparable).toBe(true);
    expect(result.deferredTax.storedDTA).toBeCloseTo(0, 2);
    expect(result.deferredTax.computedDTA).toBeCloseTo(0, 2);
    expect(result.deferredTax.drift).toBeCloseTo(0, 2);
    expect(result.deferredTax.perEntity).toHaveLength(2);
  });

  it('captures a booked AST-010 and surfaces it as drift against the modelled DTA', async () => {
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    const periodDate = new Date('2024-12-01');
    const DTA = 200_000;

    // Book a deferred tax asset (AST-010), balanced by extra reserves so the
    // standalone sheet still reconciles. AST-010 rolls into otherNonCurrentAssets
    // on the sheet, but the engine captures it separately for the IAS 12 reconciliation.
    await db.trialBalance.createMany({
      data: [
        { entityId: merid!.id, period: periodDate, periodType: 'actual', groupCOACode: 'AST-010', amountLocal: DTA, amountEUR: DTA, currency: 'EUR' },
        { entityId: merid!.id, period: periodDate, periodType: 'actual', groupCOACode: 'EQY-002', amountLocal: DTA, amountEUR: DTA, currency: 'EUR' },
      ],
    });

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // Booked DTA is captured; the modelled DTA (no carryforwards) is 0, so the
    // whole booked balance shows as the unsubstantiated drift.
    expect(result.deferredTax.storedDTA).toBeCloseTo(DTA, 2);
    expect(result.deferredTax.computedDTA).toBeCloseTo(0, 2);
    expect(result.deferredTax.drift).toBeCloseTo(DTA, 2);
    const meridDt = result.deferredTax.perEntity.find((e) => e.entityCode === 'MERID');
    expect(meridDt!.storedDTA).toBeCloseTo(DTA, 2);

    // The booked DTA is an asset balanced by equity, so the group still reconciles.
    expect(result.status).toBe('completed');
    expect(Math.abs(result.balanceCheck)).toBeLessThan(EUR);

    await seed(); // restore the clean book for later tests
  });
});

describe('runConsolidation — carryforward persistence (MEDIUM.8b)', () => {
  it('persists a loss year\'s NOL pool and feeds it back as the next year\'s opening, going dynamic on deferred tax', async () => {
    await seed();

    // A PT entity that books a 2024 loss: EBITDA −500,000 (no D&A/interest/tax),
    // funded so the standalone sheet still reconciles (share capital 1,000,000,
    // cash 500,000 = equity 1,000,000 + result −500,000).
    const loss = await db.entity.create({
      data: {
        code: 'MLOSS', legalName: 'Meridian Loss-Maker S.A.', countryCode: 'PT',
        localCurrency: 'EUR', consolidationMethod: 'full', ownershipPercentage: 1.0, sector: 'Manufacturing',
      },
    });
    const tb = (period: string, rows: Array<[string, number]>) =>
      db.trialBalance.createMany({
        data: rows.map(([code, amt]) => ({
          entityId: loss.id, period: new Date(period), periodType: 'actual',
          groupCOACode: code, amountLocal: amt, amountEUR: amt, currency: 'EUR',
        })),
      });

    await tb('2024-12-01', [
      ['REV-001', 1_000_000],
      ['COGS-001', -1_500_000], // → EBT −500,000
      ['EQY-001', 1_000_000],
      ['AST-001', 500_000],
    ]);

    // Year 1 (2024): the loss becomes a 500,000 NOL pool, persisted for 2024.
    const y2024 = await runConsolidation({ period: '2024-12', entityCodes: ['MLOSS'], scenarioType: 'base' });
    const cf2024 = y2024.taxCarryforwards.find((c) => c.entityCode === 'MLOSS');
    expect(cf2024!.nolClosing).toBeCloseTo(500_000, 2);
    // No prior pool yet, so the deferred tax this year still measures only the
    // closing loss × rate (2024 IRC 21%): 500,000 × 0.21 = 105,000.
    expect(y2024.deferredTax.computedDTA).toBeCloseTo(105_000, 2);

    const stored = await db.taxCarryforward.findFirst({
      where: { entityId: loss.id, year: 2024, scenarioType: 'base' },
    });
    expect(stored!.nolClosing).toBeCloseTo(500_000, 2);

    // Year 2 (2025): a break-even book (no P&L). The 2024 pool must feed back as
    // the 2025 opening, so the deferred tax is driven by the carried loss alone:
    // 500,000 × 0.20 (2025 IRC) = 100,000. This is the dynamic behaviour the
    // surfaced deferred tax (leg 1) was waiting on.
    await tb('2025-12-01', [
      ['EQY-001', 500_000],
      ['AST-001', 500_000],
    ]);
    const y2025 = await runConsolidation({ period: '2025-12', entityCodes: ['MLOSS'], scenarioType: 'base' });
    expect(y2025.deferredTax.comparable).toBe(true);
    expect(y2025.deferredTax.computedDTA).toBeCloseTo(100_000, 2);
    // The unused pool rolls on, persisted again for 2025.
    expect(y2025.taxCarryforwards.find((c) => c.entityCode === 'MLOSS')!.nolClosing).toBeCloseTo(500_000, 2);

    await seed(); // restore the clean book (also clears the MLOSS carryforwards)
  });
});

describe('runConsolidation — transfer pricing → live eliminations (MEDIUM.8b)', () => {
  it('fires the unrealized-inventory-profit elimination from a priced IC goods sale, staying balanced', async () => {
    await seed();
    const merid = await db.entity.findFirst({ where: { code: 'MERID' } });
    const msub = await db.entity.findFirst({ where: { code: 'MSUB' } });
    const periodDate = new Date('2024-12-01');

    // MERID sells goods to MSUB at a 25% cost-plus markup (margin on price =
    // 0.25/1.25 = 0.20); MSUB still holds half at year end. Unrealized profit
    // locked in the buyer's inventory = 1,000,000 × 0.5 × 0.20 = 100,000.
    await db.intercompanyTransaction.create({
      data: {
        transactionId: 'IC-MERID-MSUB-GOODS-2024',
        fromEntityId: merid!.id,
        toEntityId: msub!.id,
        amount: 1_000_000,
        currency: 'EUR',
        amountEUR: 1_000_000,
        transactionType: 'sale',
        markup: 0.25,
        closingInventoryFraction: 0.5,
        matchingReference: 'IC-MERID-MSUB-GOODS-2024',
        period: periodDate,
        isEliminated: false,
      },
    });

    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });

    // The transfer-pricing wiring produced an explicit, auditable inventory-profit
    // elimination of exactly 100,000…
    const profit = result.eliminationEntries.find((e) => e.kind === 'unrealized_inventory_profit');
    expect(profit).toBeDefined();
    expect(profit!.amount).toBeCloseTo(100_000, 2);

    // …which lowers consolidated inventory (MERID 13,000,000 − 100,000) and group
    // net income (1,750,000 − 100,000) by the locked-in margin. The internal sale
    // itself is net-zero on EBITDA, so only the unrealized profit moves net income.
    expect(result.balanceSheet.inventory).toBeCloseTo(12_900_000, 2);
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_650_000, 2);

    // Each elimination entry is internally balanced, so the sheet still reconciles.
    expect(result.status).toBe('completed');
    expect(Math.abs(result.balanceCheck)).toBeLessThan(EUR);

    await seed(); // restore the clean book for later tests
  });

  it('does not fire inventory-profit elimination for service IC flows (the demo)', async () => {
    await seed();
    const result = await runConsolidation({
      period: '2024-12',
      entityCodes: ['MERID', 'MSUB'],
      scenarioType: 'base',
    });
    // The demo's only IC flows are MSUB→MERID services — no goods, no inventory,
    // so the inventory-profit elimination never fires and net income is unchanged.
    expect(result.eliminationEntries.some((e) => e.kind === 'unrealized_inventory_profit')).toBe(false);
    expect(result.incomeStatement.netIncome).toBeCloseTo(1_750_000, 2);
  });
});
