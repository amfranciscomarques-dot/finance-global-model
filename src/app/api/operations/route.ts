import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildOperationalStatement } from '@/lib/operations/rollup';
import { loadOperationalModel, listOperationalEntityCodes } from '@/lib/operations/from-db';

// ============================================================
// OPERATIONS
//   GET /api/operations?entityCode=MERID
//
// Returns the bottom-up operational statement for a manufacturing/trading
// entity: revenue and COGS broken down by product, market, channel and raw
// material. The same catalog drives the entity's REV/COGS trial-balance lines
// (see src/lib/operations + the seeder), so these totals tie to the entity's
// turnover and cost of sales in the consolidation.
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityCodes = await listOperationalEntityCodes(db);

    // Default to the first entity that has a catalog.
    const entityCode = searchParams.get('entityCode') || entityCodes[0];
    if (!entityCode) {
      return NextResponse.json({ statement: null, entityCodes: [] });
    }

    const model = await loadOperationalModel(db, entityCode);
    if (!model) {
      return NextResponse.json(
        { error: `No operational catalog for entity '${entityCode}'`, entityCodes },
        { status: 404 },
      );
    }

    const statement = buildOperationalStatement(model);
    return NextResponse.json({ statement, entityCode, entityCodes });
  } catch (error) {
    console.error('Error building operational statement:', error);
    return NextResponse.json({ error: 'Failed to build operational statement' }, { status: 500 });
  }
}
