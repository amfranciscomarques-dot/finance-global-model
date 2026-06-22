import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';
import { GET } from './route';

// Regression guard for the equity-code predicate in /api/compliance. The route
// once hand-rolled `isEquityCode(code => code.startsWith('EQ-'))`, but the group
// equity codes are `EQY-*`, so the predicate NEVER matched. Two checks
// false-failed as a result:
//   1. bs-integrity   — equity summed to 0, so every balanced entity (whose real
//                       equity ≈ assets − liabilities) was reported as imbalanced.
//   2. minority-interest — `hasEquityData` was always false, so every
//                       partially-owned entity was flagged as missing equity.
// The route now derives the balance sheet via the shared finance pipeline
// (buildStatements) and classifies equity via categorizeCoaCode. These tests pin
// both checks to passing on data that genuinely balances.

const PERIOD = '2024-12';
const PERIOD_DATE = new Date(`${PERIOD}-01`);

beforeAll(async () => {
  await seedCompanyPack(db, getCompanyPack('template')!, { reset: true });

  // Add a partially-owned (60%) subsidiary whose books balance and carry equity,
  // so the minority-interest check has a real subject. Assets 1,000,000 are
  // funded entirely by share capital (EQY-001), no period result → balances.
  const mnci = await db.entity.create({
    data: {
      code: 'MNCI',
      legalName: 'Minority Holdco, S.A.',
      countryCode: 'PT',
      localCurrency: 'EUR',
      consolidationMethod: 'full', // expected method for >50% ownership
      ownershipPercentage: 0.6,
      sector: 'Manufacturing',
    },
  });
  for (const [groupCOACode, amountEUR] of [
    ['AST-001', 1_000_000],
    ['EQY-001', 1_000_000],
  ] as const) {
    await db.trialBalance.create({
      data: {
        entityId: mnci.id,
        period: PERIOD_DATE,
        periodType: 'actual',
        groupCOACode,
        amountLocal: amountEUR,
        amountEUR,
        currency: 'EUR',
      },
    });
  }
});

afterAll(async () => {
  await db.$disconnect();
});

function call(period: string) {
  const req = new Request(`http://localhost/api/compliance?period=${period}`);
  return GET(req as never);
}

interface ComplianceCheck {
  id: string;
  status: 'pass' | 'warning' | 'fail';
  score: number;
  details: string;
  affectedEntities: string[];
}

describe('GET /api/compliance — balance-sheet integrity (EQY-* equity)', () => {
  it('passes for every entity whose equity makes the sheet balance', async () => {
    const res = await call(PERIOD);
    const body = await res.json();

    const bs = (body.checks as ComplianceCheck[]).find(c => c.id === 'bs-integrity')!;

    // MERID's stored EQY-* accounts are 15,000,000, but its assets (44,000,000)
    // exceed liabilities (27,500,000) by 16,500,000 — the extra 1,500,000 is the
    // current-year net income folded into equity. With the broken `EQ-` predicate
    // equity summed to 0 and MERID failed; via buildStatements it balances.
    expect(bs.status).toBe('pass');
    expect(bs.score).toBe(100);
    expect(bs.affectedEntities).toEqual([]);
    expect(bs.affectedEntities).not.toContain('MERID');
  });

  it('reports bs-integrity as compliant in the per-entity matrix for MERID', async () => {
    const res = await call(PERIOD);
    const body = await res.json();

    const merid = (body.entities as Array<{ entityCode: string; checks: { checkId: string; status: string }[] }>)
      .find(e => e.entityCode === 'MERID')!;
    const meridBs = merid.checks.find(c => c.checkId === 'bs-integrity')!;
    expect(meridBs.status).toBe('pass');
  });

  it('does not flag the partially-owned entity as missing equity data', async () => {
    const res = await call(PERIOD);
    const body = await res.json();

    const mi = (body.checks as ComplianceCheck[]).find(c => c.id === 'minority-interest')!;

    // MNCI is 60% owned and carries EQY-001 → it has equity data and must pass.
    // Under the old predicate `hasEquityData` was always false, fast-failing it.
    expect(mi.status).toBe('pass');
    expect(mi.score).toBe(100);
    expect(mi.affectedEntities).not.toContain('MNCI');
  });
});

// LOW.4 — per-jurisdiction tax breakdown. The route already reconciles booked IRC
// against the modelled statutory tax for the tax-reconciliation check; this asserts
// the same reconciliation is now grouped by country and exposed for the UI, with the
// NOL/RFAI carryforwards and the statutory note surfaced (no longer engine-only).
interface TaxJurisdictionEntity {
  entityCode: string;
  storedTax: number;
  modelledTax: number;
  drift: number;
  nolClosing: number;
  rfaiClosing: number;
  comparable: boolean;
}
interface TaxJurisdiction {
  countryCode: string;
  comparable: boolean;
  storedTax: number;
  modelledTax: number;
  drift: number;
  withinTolerance: boolean;
  note: string;
  entities: TaxJurisdictionEntity[];
}

describe('GET /api/compliance — per-jurisdiction tax (LOW.4)', () => {
  it('groups the modelled jurisdictions with internally-consistent sums', async () => {
    const res = await call(PERIOD);
    const body = await res.json();
    const tax = body.taxByJurisdiction as TaxJurisdiction[];

    expect(Array.isArray(tax)).toBe(true);
    // PT (MERID, MSUB, MNCI) and US (MUSA) carry trial-balance data; MESP (ES) is
    // seeded empty in the template, so ES has nothing to reconcile and is absent.
    const codes = tax.map(j => j.countryCode);
    expect(codes).toEqual(expect.arrayContaining(['PT', 'US']));

    // Each jurisdiction's headline figures are exactly the sum of its entity rows,
    // and every entity exposes numeric NOL/RFAI carryforwards (LOW.4 surfacing).
    for (const jur of tax) {
      const sum = (k: keyof TaxJurisdictionEntity) =>
        jur.entities.reduce((s, e) => s + (e[k] as number), 0);
      expect(jur.storedTax).toBeCloseTo(sum('storedTax'), 2);
      expect(jur.modelledTax).toBeCloseTo(sum('modelledTax'), 2);
      expect(jur.drift).toBeCloseTo(sum('drift'), 2);
      expect(jur.comparable).toBe(jur.entities.every(e => e.comparable));
      for (const e of jur.entities) {
        expect(Number.isFinite(e.nolClosing)).toBe(true);
        expect(Number.isFinite(e.rfaiClosing)).toBe(true);
      }
    }
  });

  it('reconciles with the tax-reconciliation check and surfaces the statutory note', async () => {
    const res = await call(PERIOD);
    const body = await res.json();
    const tax = body.taxByJurisdiction as TaxJurisdiction[];

    // The per-jurisdiction drift sums to the same figure the authoritative
    // tax-reconciliation check reports (both reuse reconcileGroupTax over the same
    // rows) — so the new view can never silently disagree with the check.
    const totalDrift = tax.reduce((s, j) => s + j.drift, 0);
    const taxCheck = (body.checks as ComplianceCheck[]).find(c => c.id === 'tax-reconciliation')!;
    expect(taxCheck.details).toContain(`€${Math.round(totalDrift)}`);

    const pt = tax.find(j => j.countryCode === 'PT')!;
    expect(pt.comparable).toBe(true);
    expect(pt.storedTax).toBeGreaterThan(0);
    expect(pt.entities.map(e => e.entityCode)).toContain('MERID');
    // The PT NOL/RFAI caps are legible in the UI, not buried in the providers.
    expect(pt.note).toContain('art.º 52');
  });
});
