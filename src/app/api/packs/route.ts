import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCompanyPack, listCompanyPacks, seedCompanyPack } from '@/lib/company-packs';
import type { CompanyPack } from '@/lib/company-packs';
import { EXCHANGE_RATES, SCENARIOS } from '@/lib/coa-data';

// An empty group: reference data (group COA, FX, scenarios) but no companies.
// Companies are then added via POST /api/entities → POST /api/import.
function buildEmptyPack(name: string, period: string): CompanyPack {
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return {
    id,
    name,
    description: `${name} — empty group. Add companies to begin.`,
    period,
    sourceSystem: 'manual',
    entities: [],
    exchangeRates: EXCHANGE_RATES as CompanyPack['exchangeRates'],
    scenarios: SCENARIOS,
    buildTrialBalance: () => [],
    icTransactions: [],
    projects: [],
  };
}

// ============================================================
// COMPANY PACKS
//   GET  /api/packs                  list registered company packs
//   POST /api/packs {packId, reset}  load a pack (reset wipes existing data)
//
// To onboard a company without a pack, use the API flow instead:
// POST /api/entities → POST /api/import → POST /api/consolidation.
// ============================================================

export async function GET() {
  const packs = listCompanyPacks().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    period: p.period,
    entities: p.entities.map((e) => ({ code: e.code, legalName: e.legalName, countryCode: e.countryCode, localCurrency: e.localCurrency })),
    projects: p.projects.map((pr) => pr.code),
  }));
  return NextResponse.json({ packs });
}

const seedRequestSchema = z
  .object({
    packId: z.string().min(1).optional(),
    // Create a fresh empty group. Always replaces the current dataset, since
    // the model holds one group at a time.
    newGroup: z
      .object({
        name: z.string().min(1),
        period: z.string().regex(/^\d{4}-\d{2}$/).default('2024-12'),
      })
      .optional(),
    reset: z.boolean().default(false),
  })
  .refine((d) => d.packId || d.newGroup, { message: 'Provide either packId or newGroup' });

export async function POST(request: NextRequest) {
  try {
    const { packId, newGroup, reset } = seedRequestSchema.parse(await request.json());

    // New empty group: always resets (one group lives in the DB at a time).
    if (newGroup) {
      const pack = buildEmptyPack(newGroup.name, newGroup.period);
      const result = await seedCompanyPack(db, pack, { reset: true });
      return NextResponse.json(
        { message: `Empty group '${pack.name}' created for period ${result.period}. Add companies to begin.`, ...result },
        { status: 201 },
      );
    }

    const pack = getCompanyPack(packId!);
    if (!pack) {
      return NextResponse.json(
        { error: `Unknown pack '${packId}'`, available: listCompanyPacks().map((p) => p.id) },
        { status: 404 },
      );
    }

    const existing = await db.entity.count();
    if (existing > 0 && !reset) {
      return NextResponse.json(
        { message: 'Data already present. Re-run with reset: true to replace it.', entityCount: existing },
        { status: 409 },
      );
    }

    const result = await seedCompanyPack(db, pack, { reset });
    return NextResponse.json(
      { message: `Company pack '${pack.name}' loaded for period ${result.period}.`, ...result },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Error seeding company pack:', error);
    return NextResponse.json(
      { error: 'Failed to seed company pack', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
