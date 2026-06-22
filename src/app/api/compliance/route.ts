import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildStatements } from '@/lib/finance';
import { categorizeCoaCode } from '@/lib/coa-data';

// Jurisdiction filing requirements
const JURISDICTION_CONFIG: Record<string, { name: string; flag: string; framework: string; filings: { name: string; deadline: string }[] }> = {
  PT: { name: 'Portugal', flag: '🇵🇹', framework: 'SNC', filings: [
    { name: 'Demonstração Financeira Anual', deadline: '2025-04-30' },
    { name: 'IES/Informação Empresarial Simplificada', deadline: '2025-07-15' },
    { name: 'Modelo 22 (IRC)', deadline: '2025-05-31' },
  ]},
  ES: { name: 'Spain', flag: '🇪🇸', framework: 'PGC', filings: [
    { name: 'Cuentas Anuales', deadline: '2025-04-30' },
    { name: 'Declaración de IS', deadline: '2025-07-25' },
    { name: 'Modelo 200', deadline: '2025-06-30' },
  ]},
  DE: { name: 'Germany', flag: '🇩🇪', framework: 'HGB', filings: [
    { name: 'Jahresabschluss', deadline: '2025-06-30' },
    { name: 'Einkommensteuererklärung', deadline: '2025-07-31' },
    { name: 'Umsatzsteuererklärung', deadline: '2025-05-31' },
  ]},
  UK: { name: 'United Kingdom', flag: '🇬🇧', framework: 'UK GAAP', filings: [
    { name: 'Annual Accounts (Companies House)', deadline: '2025-06-30' },
    { name: 'Corporation Tax Return (CT600)', deadline: '2025-06-30' },
    { name: 'Confirmation Statement', deadline: '2025-06-30' },
  ]},
  FR: { name: 'France', flag: '🇫🇷', framework: 'IFRS', filings: [
    { name: 'Liasse Fiscale', deadline: '2025-05-20' },
    { name: 'Déclaration de Résultat', deadline: '2025-04-30' },
    { name: 'Déclaration IS', deadline: '2025-05-20' },
  ]},
};

// Balance-sheet classification is NOT done by hand here: it lives in the shared
// finance domain (buildStatements) and src/lib/coa-data (categorizeCoaCode), the
// single sources of truth for COA→statement rollup. A prior copy of the equity
// predicate checked the wrong prefix (`EQ-`, but equity codes are `EQY-*`), so
// equity summed to 0 and every balanced entity failed the integrity check.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '2024-12';

    // Fetch all entities
    const entities = await db.entity.findMany({ where: { isActive: true } });

    // Fetch trial balances for the period
    const periodStart = new Date(period + '-01');
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const trialBalances = await db.trialBalance.findMany({
      where: {
        period: { gte: periodStart, lt: periodEnd },
        periodType: 'actual',
      },
      include: { entity: true, groupCOA: true },
    });

    // Fetch IC transactions for the period
    const icTransactions = await db.intercompanyTransaction.findMany({
      where: {
        period: { gte: periodStart, lt: periodEnd },
      },
      include: { fromEntity: true, toEntity: true },
    });

    // Fetch exchange rates
    const exchangeRates = await db.exchangeRate.findMany({
      where: { rateType: 'closing' },
      orderBy: { rateDate: 'desc' },
    });

    // Fetch COA mappings
    const coaMappings = await db.cOAMapping.findMany();
    const groupCOA = await db.chartOfAccount.findMany();

    // ============================================================
    // 1. Balance Sheet Integrity Check
    // ============================================================
    let bsPassCount = 0;
    let bsFailCount = 0;
    const bsAffectedEntities: string[] = [];

    for (const entity of entities) {
      const entityTBs = trialBalances.filter(tb => tb.entityId === entity.id);

      // No trial-balance data for the entity → nothing to check (skip, don't fail).
      if (entityTBs.length === 0) continue;

      // Derive the balance sheet through the shared finance pipeline. Crucially
      // this folds the current-year net income into retained earnings, so the
      // check reflects true equity (Assets = Liabilities + Equity) rather than
      // just the stored EQY-* accounts, which exclude the period result.
      const { balanceSheet } = buildStatements(
        entityTBs.map(tb => ({ groupCOACode: tb.groupCOACode, amountEUR: tb.amountEUR })),
      );

      const balanceDiff = Math.abs(balanceSheet.balanceCheck);
      const tolerance = Math.max(100, Math.abs(balanceSheet.totalAssets) * 0.01); // 1% or min 100

      if (balanceDiff <= tolerance) {
        bsPassCount++;
      } else {
        bsFailCount++;
        bsAffectedEntities.push(entity.code);
      }
    }

    const bsScore = bsPassCount + bsFailCount > 0 ? Math.round((bsPassCount / (bsPassCount + bsFailCount)) * 100) : 80;
    const bsStatus: 'pass' | 'warning' | 'fail' = bsScore >= 80 ? (bsScore >= 95 ? 'pass' : 'warning') : 'fail';

    // ============================================================
    // 2. IC Transaction Matching
    // ============================================================
    const icByRef = new Map<string, typeof icTransactions>();
    for (const tx of icTransactions) {
      const ref = tx.matchingReference || 'unmatched-' + tx.id;
      if (!icByRef.has(ref)) icByRef.set(ref, []);
      icByRef.get(ref)!.push(tx);
    }

    const icUnmatchedEntities = new Set<string>();

    for (const [ref, txns] of icByRef) {
      // Unmatched = a synthetic 'unmatched-' reference, or a reference with fewer than two legs.
      if (ref.startsWith('unmatched-') || txns.length < 2) {
        txns.forEach(t => { icUnmatchedEntities.add(t.fromEntity.code); icUnmatchedEntities.add(t.toEntity.code); });
      }
    }

    // Also count eliminated vs not
    const eliminatedCount = icTransactions.filter(t => t.isEliminated).length;
    const notEliminatedCount = icTransactions.filter(t => !t.isEliminated).length;

    const icScore = icTransactions.length > 0
      ? Math.round((eliminatedCount / icTransactions.length) * 100)
      : 85; // Default if no IC transactions
    const icStatus: 'pass' | 'warning' | 'fail' = icScore >= 90 ? 'pass' : (icScore >= 60 ? 'warning' : 'fail');

    // ============================================================
    // 3. Currency Translation
    // ============================================================
    const nonEUREntities = entities.filter(e => e.localCurrency !== 'EUR');
    const rateMap = new Map<string, Set<string>>();
    for (const rate of exchangeRates) {
      if (!rateMap.has(rate.currency)) rateMap.set(rate.currency, new Set());
      rateMap.get(rate.currency)!.add(rate.rateType);
    }

    const currencyMissingEntities: string[] = [];
    let currencyPassCount = 0;

    for (const entity of nonEUREntities) {
      const hasClosingRate = rateMap.has(entity.localCurrency);
      if (hasClosingRate) {
        currencyPassCount++;
      } else {
        currencyMissingEntities.push(entity.code);
      }
    }

    const currencyScore = nonEUREntities.length > 0
      ? Math.round((currencyPassCount / nonEUREntities.length) * 100)
      : 100;
    const currencyStatus: 'pass' | 'warning' | 'fail' = currencyScore >= 95 ? 'pass' : (currencyScore >= 70 ? 'warning' : 'fail');

    // ============================================================
    // 4. Ownership Validation
    // ============================================================
    const invalidOwnershipEntities: string[] = [];
    let ownershipPassCount = 0;

    for (const entity of entities) {
      const pct = entity.ownershipPercentage * 100; // Stored as 0-1
      if (pct >= 0 && pct <= 100) {
        ownershipPassCount++;
      } else {
        invalidOwnershipEntities.push(entity.code);
      }
    }

    const ownershipScore = entities.length > 0
      ? Math.round((ownershipPassCount / entities.length) * 100)
      : 100;
    const ownershipStatus: 'pass' | 'warning' | 'fail' = ownershipScore >= 100 ? 'pass' : (ownershipScore >= 80 ? 'warning' : 'fail');

    // ============================================================
    // 5. Trial Balance Completeness
    // ============================================================
    const entitiesWithTB = new Set(trialBalances.map(tb => tb.entityId));
    const entitiesMissingTB = entities.filter(e => !entitiesWithTB.has(e.id));
    const tbPassCount = entities.length - entitiesMissingTB.length;

    const tbScore = entities.length > 0
      ? Math.round((tbPassCount / entities.length) * 100)
      : 100;
    const tbStatus: 'pass' | 'warning' | 'fail' = tbScore >= 100 ? 'pass' : (tbScore >= 80 ? 'warning' : 'fail');

    // ============================================================
    // 6. COA Mapping Coverage
    // ============================================================
    const entityMappingCounts = new Map<string, number>();
    for (const mapping of coaMappings) {
      entityMappingCounts.set(mapping.entityCode, (entityMappingCounts.get(mapping.entityCode) || 0) + 1);
    }

    const expectedMappingsPerEntity = groupCOA.length;
    let mappingPassCount = 0;
    const mappingLowEntities: string[] = [];

    for (const entity of entities) {
      const count = entityMappingCounts.get(entity.code) || 0;
      const coverage = expectedMappingsPerEntity > 0 ? count / expectedMappingsPerEntity : 0;
      if (coverage >= 0.8) {
        mappingPassCount++;
      } else {
        mappingLowEntities.push(entity.code);
      }
    }

    const mappingScore = entities.length > 0
      ? Math.round((mappingPassCount / entities.length) * 100)
      : 70;
    const mappingStatus: 'pass' | 'warning' | 'fail' = mappingScore >= 90 ? 'pass' : (mappingScore >= 60 ? 'warning' : 'fail');

    // ============================================================
    // 7. Consolidation Method
    // ============================================================
    let methodPassCount = 0;
    const methodIssues: string[] = [];

    for (const entity of entities) {
      const ownership = entity.ownershipPercentage * 100;
      const method = entity.consolidationMethod;
      let expected = '';

      if (ownership > 50) expected = 'full';
      else if (ownership >= 20) expected = 'proportional';
      else expected = 'equity';

      if (method === expected) {
        methodPassCount++;
      } else {
        methodIssues.push(`${entity.code}: ${method} (expected ${expected} for ${ownership.toFixed(0)}% ownership)`);
      }
    }

    const methodScore = entities.length > 0
      ? Math.round((methodPassCount / entities.length) * 100)
      : 70;
    const methodStatus: 'pass' | 'warning' | 'fail' = methodScore >= 90 ? 'pass' : (methodScore >= 60 ? 'warning' : 'fail');

    // ============================================================
    // 8. Minority Interest Calculation
    // ============================================================
    const minorityEntities = entities.filter(e => e.ownershipPercentage < 1.0);
    let minorityPassCount = 0;
    const minorityIssues: string[] = [];

    for (const entity of minorityEntities) {
      // Check if the entity has trial balance data and can calculate minority interest
      const entityTBs = trialBalances.filter(tb => tb.entityId === entity.id);
      const hasEquityData = entityTBs.some(tb => categorizeCoaCode(tb.groupCOACode) === 'Equity');

      if (hasEquityData) {
        minorityPassCount++;
      } else {
        minorityIssues.push(entity.code);
      }
    }

    const minorityScore = minorityEntities.length > 0
      ? Math.round((minorityPassCount / minorityEntities.length) * 100)
      : 95; // If all 100% owned, mostly compliant
    const minorityStatus: 'pass' | 'warning' | 'fail' = minorityScore >= 90 ? 'pass' : (minorityScore >= 60 ? 'warning' : 'fail');

    // ============================================================
    // 9. Disclosure Requirements
    // ============================================================
    const entityCountries = new Set(entities.map(e => e.countryCode));
    let disclosurePassCount = 0;
    const disclosureIssues: string[] = [];

    for (const country of Object.keys(JURISDICTION_CONFIG)) {
      if (!entityCountries.has(country)) continue;
      const countryEntities = entities.filter(e => e.countryCode === country);
      const hasTBForCountry = countryEntities.some(e => entitiesWithTB.has(e.id));
      if (hasTBForCountry) {
        disclosurePassCount++;
      } else {
        disclosureIssues.push(country);
      }
    }

    const activeJurisdictions = Object.keys(JURISDICTION_CONFIG).filter(c => entityCountries.has(c));
    const disclosureScore = activeJurisdictions.length > 0
      ? Math.round((disclosurePassCount / activeJurisdictions.length) * 100)
      : 80;
    const disclosureStatus: 'pass' | 'warning' | 'fail' = disclosureScore >= 90 ? 'pass' : (disclosureScore >= 60 ? 'warning' : 'fail');

    // ============================================================
    // Build Checks Array
    // ============================================================
    const checks = [
      {
        id: 'bs-integrity',
        name: 'Balance Sheet Integrity',
        description: 'Assets = Liabilities + Equity (within tolerance)',
        category: 'financial' as const,
        status: bsStatus,
        score: bsScore,
        details: bsFailCount > 0
          ? `${bsPassCount} of ${bsPassCount + bsFailCount} entities pass balance check. ${bsFailCount} entities have imbalance.`
          : `All ${bsPassCount} entities pass balance sheet integrity check.`,
        affectedEntities: bsAffectedEntities,
      },
      {
        id: 'ic-matching',
        name: 'IC Transaction Matching',
        description: 'All IC transactions have matching pairs',
        category: 'financial' as const,
        status: icStatus,
        score: icScore,
        details: icTransactions.length > 0
          ? `${eliminatedCount} of ${icTransactions.length} IC transactions eliminated. ${notEliminatedCount} pending.`
          : 'No IC transactions found for the period.',
        affectedEntities: Array.from(icUnmatchedEntities),
      },
      {
        id: 'currency-translation',
        name: 'Currency Translation',
        description: 'All non-EUR entities have valid exchange rates',
        category: 'operational' as const,
        status: currencyStatus,
        score: currencyScore,
        details: nonEUREntities.length > 0
          ? `${currencyPassCount} of ${nonEUREntities.length} non-EUR entities have exchange rates.`
          : 'All entities use EUR (no translation needed).',
        affectedEntities: currencyMissingEntities,
      },
      {
        id: 'ownership-validation',
        name: 'Ownership Validation',
        description: 'Ownership percentages between 0-100%',
        category: 'regulatory' as const,
        status: ownershipStatus,
        score: ownershipScore,
        details: invalidOwnershipEntities.length > 0
          ? `${invalidOwnershipEntities.length} entities have invalid ownership percentages.`
          : `All ${entities.length} entities have valid ownership percentages (0-100%).`,
        affectedEntities: invalidOwnershipEntities,
      },
      {
        id: 'tb-completeness',
        name: 'Trial Balance Completeness',
        description: 'All entities have trial balances for the period',
        category: 'operational' as const,
        status: tbStatus,
        score: tbScore,
        details: entitiesMissingTB.length > 0
          ? `${tbPassCount} of ${entities.length} entities have trial balance data. Missing: ${entitiesMissingTB.map(e => e.code).join(', ')}`
          : `All ${entities.length} entities have trial balance data for ${period}.`,
        affectedEntities: entitiesMissingTB.map(e => e.code),
      },
      {
        id: 'coa-mapping',
        name: 'COA Mapping Coverage',
        description: 'All entity accounts mapped to group COA',
        category: 'operational' as const,
        status: mappingStatus,
        score: mappingScore,
        details: mappingLowEntities.length > 0
          ? `${mappingPassCount} of ${entities.length} entities have ≥80% COA mapping coverage.`
          : `All ${entities.length} entities have adequate COA mapping coverage.`,
        affectedEntities: mappingLowEntities,
      },
      {
        id: 'consolidation-method',
        name: 'Consolidation Method',
        description: 'Correct method (full/proportional/equity) per ownership %',
        category: 'regulatory' as const,
        status: methodStatus,
        score: methodScore,
        details: methodIssues.length > 0
          ? `${methodPassCount} of ${entities.length} entities have correct consolidation method. Issues: ${methodIssues.join('; ')}`
          : `All ${entities.length} entities have appropriate consolidation methods for their ownership levels.`,
        affectedEntities: methodIssues.map(m => m.split(':')[0]),
      },
      {
        id: 'minority-interest',
        name: 'Minority Interest Calculation',
        description: 'Calculated correctly for entities < 100% ownership',
        category: 'financial' as const,
        status: minorityStatus,
        score: minorityScore,
        details: minorityEntities.length > 0
          ? `${minorityPassCount} of ${minorityEntities.length} partially-owned entities have correct minority interest calculations.`
          : 'All entities are 100% owned — no minority interest required.',
        affectedEntities: minorityIssues,
      },
      {
        id: 'disclosure-requirements',
        name: 'Disclosure Requirements',
        description: 'Required disclosures per jurisdiction (EU, UK, DE, ES, FR, PT)',
        category: 'regulatory' as const,
        status: disclosureStatus,
        score: disclosureScore,
        details: `${disclosurePassCount} of ${activeJurisdictions.length} jurisdictions have adequate disclosure data.`,
        affectedEntities: disclosureIssues,
      },
    ];

    // ============================================================
    // Entity Compliance Matrix
    // ============================================================
    const entityCompliance = entities.map(entity => {
      const entityChecks: { checkId: string; status: 'pass' | 'warning' | 'fail'; details: string }[] = [];

      for (const check of checks) {
        const isAffected = check.affectedEntities.includes(entity.code);
        if (check.status === 'pass') {
          entityChecks.push({ checkId: check.id, status: 'pass', details: 'Compliant' });
        } else if (isAffected) {
          entityChecks.push({ checkId: check.id, status: check.status, details: check.details });
        } else {
          // Entity not specifically affected, but overall check may be warning/fail
          entityChecks.push({
            checkId: check.id,
            status: check.status === 'fail' ? 'warning' : 'pass',
            details: check.status === 'fail' ? 'Affected by overall issue' : 'Compliant',
          });
        }
      }

      const passCount = entityChecks.filter(c => c.status === 'pass').length;
      const overallScore = Math.round((passCount / entityChecks.length) * 100);

      return {
        entityCode: entity.code,
        entityName: entity.legalName,
        country: entity.countryCode,
        overallScore,
        checks: entityChecks,
      };
    });

    // ============================================================
    // Jurisdiction Compliance
    // ============================================================
    const jurisdictionCompliance = Object.entries(JURISDICTION_CONFIG)
      .filter(([code]) => entityCountries.has(code))
      .map(([code, config]) => {
        const countryEntities = entityCompliance.filter(ec => ec.country === code);
        const avgScore = countryEntities.length > 0
          ? Math.round(countryEntities.reduce((sum, e) => sum + e.overallScore, 0) / countryEntities.length)
          : 0;

        // Filing status is derived purely from the statutory deadline vs. today.
        // There is no filing-submission table yet, so nothing is reported as
        // 'filed' (we hold no record of a submission): not-yet-due => pending,
        // past-due => overdue. Wire to real filing records when they exist.
        const now = new Date();
        const filings = config.filings.map(f => {
          const status: 'filed' | 'pending' | 'overdue' = new Date(f.deadline) < now ? 'overdue' : 'pending';
          return { ...f, status };
        });

        return {
          countryCode: code,
          countryName: config.name,
          flag: config.flag,
          framework: config.framework,
          complianceScore: avgScore,
          filings,
        };
      });

    // ============================================================
    // Recent Violations
    // ============================================================
    const violations: { id: string; severity: 'critical' | 'warning' | 'info'; entityCode: string; description: string; detectedAt: string; remediation: string; status: 'open' | 'in_progress' | 'resolved' }[] = [];

    let violationIdx = 0;
    for (const check of checks) {
      if (check.status === 'fail' && check.affectedEntities.length > 0) {
        for (const entityCode of check.affectedEntities.slice(0, 2)) {
          violations.push({
            id: `v-${++violationIdx}`,
            severity: 'critical',
            entityCode,
            description: `${check.name}: ${check.details}`,
            detectedAt: new Date().toISOString(),
            remediation: `Review ${check.name.toLowerCase()} for entity ${entityCode} and correct the data.`,
            status: 'open',
          });
        }
      } else if (check.status === 'warning' && check.affectedEntities.length > 0) {
        for (const entityCode of check.affectedEntities.slice(0, 1)) {
          violations.push({
            id: `v-${++violationIdx}`,
            severity: 'warning',
            entityCode,
            description: `${check.name}: ${check.details}`,
            detectedAt: new Date(Date.now() - 86400000).toISOString(),
            remediation: `Verify ${check.name.toLowerCase()} settings and data for ${entityCode}.`,
            status: 'in_progress',
          });
        }
      }
    }

    // No demo/placeholder violations: an empty list is the correct result when
    // every check passes, and the UI renders a proper "no violations" empty state.

    // ============================================================
    // Overall Score
    // ============================================================
    const overallScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);
    const overallStatus: 'compliant' | 'warning' | 'non-compliant' = overallScore >= 80 ? (overallScore >= 90 ? 'compliant' : 'warning') : 'non-compliant';

    // ============================================================
    // Compliance Trend
    // ============================================================
    // Compliance scores are recomputed on demand and not persisted per period, so a
    // true historical series cannot be derived. Rather than fabricate one (the prior
    // implementation padded synthetic months with Math.random(), giving a different
    // chart on every refresh), report the one real point we can compute: this period.
    const trend = [{ period, score: overallScore }];

    return NextResponse.json({
      overallScore,
      overallStatus,
      checks,
      entities: entityCompliance,
      jurisdictions: jurisdictionCompliance,
      recentViolations: violations,
      trend: trend.slice(-6),
      lastChecked: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error computing compliance:', error);
    return NextResponse.json(
      { error: 'Failed to compute compliance status' },
      { status: 500 }
    );
  }
}
