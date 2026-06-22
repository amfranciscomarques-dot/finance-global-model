import type { PrismaClient } from '@prisma/client';
import { CHART_OF_ACCOUNTS } from '@/lib/coa-data';
import { appraiseProject } from '@/lib/projects/finance';
import { ensureAuthUsers } from '@/lib/auth/users';
import type { CompanyPack } from './types';

export interface SeedPackResult {
  packId: string;
  reset: boolean;
  period: string;
  projectAppraisals: Record<string, { npv: number; irr: number | null; paybackYears: number | null }>;
  stats: {
    entities: number;
    coa: number;
    rates: number;
    scenarios: number;
    trialBalances: number;
    ic: number;
    projects: number;
    products: number;
    materials: number;
  };
}

// ============================================================
// GENERIC COMPANY-PACK SEEDER
//
// Deterministic load of one company pack. With `reset: true` it wipes the
// transactional data first; reference data (group COA, FX rates, scenarios)
// is always upserted. The group COA itself is shared across packs — packs
// supply amounts already mapped onto it.
// ============================================================
export async function seedCompanyPack(
  db: PrismaClient,
  pack: CompanyPack,
  { reset = false }: { reset?: boolean } = {},
): Promise<SeedPackResult> {
  if (reset) {
    // Order matters for FK integrity
    await db.billOfMaterial.deleteMany();
    await db.salesMix.deleteMany();
    await db.product.deleteMany();
    await db.rawMaterial.deleteMany();
    await db.trialBalance.deleteMany();
    await db.intercompanyTransaction.deleteMany();
    await db.budgetEntry.deleteMany();
    await db.forecastEntry.deleteMany();
    await db.consolidationRun.deleteMany();
    // TaxCarryforward references Entity (onDelete RESTRICT), so it must be cleared
    // before entities are deleted (runConsolidation persists a row per entity/year).
    await db.taxCarryforward.deleteMany();
    await db.project.deleteMany();
    await db.entity.deleteMany();
  }

  const stats = { entities: 0, coa: 0, rates: 0, scenarios: 0, trialBalances: 0, ic: 0, projects: 0, products: 0, materials: 0 };

  // 1. Group chart of accounts (shared reference data, upsert)
  for (const a of CHART_OF_ACCOUNTS) {
    await db.chartOfAccount.upsert({
      where: { code: a.code },
      update: { name: a.name, accountType: a.accountType, statementType: a.statementType, level: a.level, isIntercompany: a.isIntercompany ?? false, sortOrder: a.sortOrder },
      create: { code: a.code, name: a.name, accountType: a.accountType, statementType: a.statementType, level: a.level, isIntercompany: a.isIntercompany ?? false, sortOrder: a.sortOrder },
    });
    stats.coa++;
  }

  // 2. Exchange rates (upsert on unique [currency, rateDate, rateType])
  for (const r of pack.exchangeRates) {
    const rateDate = new Date(r.rateDate);
    await db.exchangeRate.upsert({
      where: { currency_rateDate_rateType: { currency: r.currency, rateDate, rateType: r.rateType } },
      update: { rate: r.rate, source: r.source },
      create: { currency: r.currency, rateDate, rateType: r.rateType, rate: r.rate, source: r.source },
    });
    stats.rates++;
  }

  // 3. Scenarios
  for (const s of pack.scenarios) {
    await db.scenario.upsert({ where: { name: s.name }, update: s, create: s });
    stats.scenarios++;
  }

  // 4. Entities
  const entityMap: Record<string, string> = {};
  for (const e of pack.entities) {
    const created = await db.entity.create({ data: e });
    entityMap[e.code] = created.id;
    stats.entities++;
  }

  // 5. Trial balances (annual snapshot at pack.period)
  const periodDate = new Date(pack.period + '-01');
  const closingRate = (currency: string): number => {
    const rate = pack.exchangeRates
      .filter((r) => r.currency === currency && r.rateType === 'closing')
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
    return rate?.rate ?? 1.0;
  };
  for (const rec of pack.buildTrialBalance()) {
    if (!entityMap[rec.entityCode]) {
      throw new Error(`Pack '${pack.id}': trial balance references unknown entity '${rec.entityCode}'`);
    }
    const rate = rec.currency === 'EUR' ? 1.0 : closingRate(rec.currency);
    const amountEUR = rec.amountEUR ?? (rec.currency === 'EUR' ? rec.amountLocal : rec.amountLocal / rate);
    await db.trialBalance.create({
      data: {
        entityId: entityMap[rec.entityCode],
        period: periodDate,
        periodType: 'actual',
        groupCOACode: rec.groupCOACode,
        amountLocal: rec.amountLocal,
        amountEUR,
        currency: rec.currency,
        exchangeRateUsed: rec.currency === 'EUR' ? null : rate,
        sourceSystem: pack.sourceSystem,
        isIntercompany: rec.isIntercompany ?? false,
        icPartnerEntityId: rec.icPartnerCode ? entityMap[rec.icPartnerCode] ?? null : null,
        eliminationStatus: 'pending',
      },
    });
    stats.trialBalances++;
  }

  // 6. Intercompany transactions
  for (const ic of pack.icTransactions) {
    await db.intercompanyTransaction.create({
      data: {
        transactionId: ic.ref,
        fromEntityId: entityMap[ic.from],
        toEntityId: entityMap[ic.to],
        amount: ic.amount,
        currency: 'EUR',
        amountEUR: ic.amount,
        transactionType: ic.type,
        matchingReference: ic.ref,
        period: periodDate,
        isEliminated: false,
      },
    });
    stats.ic++;
  }

  // 7. Investment projects (appraised on load)
  const projectAppraisals: SeedPackResult['projectAppraisals'] = {};
  for (const p of pack.projects) {
    const a = p.assumptions;
    const appraisal = appraiseProject({
      startYear: p.startYear,
      horizonYears: p.horizonYears,
      capexTotal: p.capexTotal,
      discountRate: p.discountRate,
      terminalGrowth: p.terminalGrowth,
      taxRate: p.taxRate,
      capexSchedule: a.capexSchedule,
      netBenefitByYear: a.netBenefitByYear,
      rfaiCredit: a.rfaiCredit,
      residualValue: a.residualValue,
    });

    const projectData = {
      assumptions: JSON.stringify(p.assumptions),
      cashFlows: JSON.stringify({ years: appraisal.years, cashFlows: appraisal.cashFlows }),
      npv: appraisal.npv,
      irr: appraisal.irr,
      paybackYears: appraisal.paybackYears,
    };
    await db.project.upsert({
      where: { code: p.code },
      update: projectData,
      create: {
        code: p.code,
        name: p.name,
        entityCode: p.entityCode,
        countryCode: p.countryCode,
        projectType: p.projectType,
        currency: p.currency,
        status: p.status,
        startYear: p.startYear,
        horizonYears: p.horizonYears,
        capexTotal: p.capexTotal,
        debtAmount: p.debtAmount,
        debtRate: p.debtRate,
        equityAmount: p.equityAmount,
        discountRate: p.discountRate,
        terminalGrowth: p.terminalGrowth,
        taxRate: p.taxRate,
        description: p.description,
        ...projectData,
      },
    });
    projectAppraisals[p.code] = { npv: appraisal.npv, irr: appraisal.irr, paybackYears: appraisal.paybackYears };
    stats.projects++;
  }

  // 8. Operational catalogs (products, raw materials, BOM, sales mix). These
  //    drive the owning entity's REV/COGS trial-balance lines (added in the
  //    pack's buildTrialBalance); here we persist the catalog itself so the
  //    operations API/UI can read the product/market/channel/material detail.
  for (const model of pack.operations ?? []) {
    for (const m of model.materials) {
      await db.rawMaterial.create({
        data: {
          entityCode: model.entityCode,
          code: m.code,
          name: m.name,
          unit: m.unit,
          unitCost: m.unitCost,
        },
      });
      stats.materials++;
    }
    for (let i = 0; i < model.products.length; i++) {
      const p = model.products[i];
      const product = await db.product.create({
        data: {
          entityCode: model.entityCode,
          code: p.code,
          name: p.name,
          productType: p.productType,
          salesPricePerUnit: p.salesPricePerUnit,
          annualVolume: p.annualVolume,
          laborCostPerUnit: p.laborCostPerUnit,
          overheadPerUnit: p.overheadPerUnit,
          purchaseCostPerUnit: p.purchaseCostPerUnit,
          sortOrder: i,
        },
      });
      for (const line of p.bom) {
        const material = await db.rawMaterial.findUnique({
          where: { entityCode_code: { entityCode: model.entityCode, code: line.materialCode } },
        });
        if (!material) {
          throw new Error(`Pack '${pack.id}': product '${p.code}' BOM references unknown material '${line.materialCode}'`);
        }
        await db.billOfMaterial.create({
          data: { productId: product.id, rawMaterialId: material.id, quantityPerUnit: line.quantityPerUnit },
        });
      }
      for (const mix of p.salesMix) {
        await db.salesMix.create({
          data: { productId: product.id, market: mix.market, channel: mix.channel, weight: mix.weight },
        });
      }
      stats.products++;
    }
  }

  // 9. Demo auth users (LOW.5) — one per role, idempotent, so the seeded
  //    single-tenant demo always has a working login. Deliberately NOT cleared
  //    by `reset` (users outlive the dataset they administer); real deployments
  //    create their own users and set AUTH_SECRET.
  await ensureAuthUsers(db);

  return { packId: pack.id, reset, period: pack.period, projectAppraisals, stats };
}
