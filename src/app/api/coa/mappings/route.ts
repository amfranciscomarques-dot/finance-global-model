import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const coaMappingCreateSchema = z.object({
  entityCode: z.string().min(1),
  localAccountCode: z.string().min(1),
  localAccountName: z.string().min(1),
  localCOAType: z.string().min(1), // SNC, PGC, HGB, IFRS
  groupCOACode: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityCode = searchParams.get('entityCode') || '';
    const localCOAType = searchParams.get('localCOAType') || '';
    const groupCOACode = searchParams.get('groupCOACode') || '';

    const where: Record<string, unknown> = {};
    if (entityCode) where.entityCode = entityCode;
    if (localCOAType) where.localCOAType = localCOAType;
    if (groupCOACode) where.groupCOACode = groupCOACode;

    const mappings = await db.cOAMapping.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } },
      },
      orderBy: [{ entityCode: 'asc' }, { localAccountCode: 'asc' }],
    });

    return NextResponse.json({ mappings });
  } catch (error) {
    console.error('Error fetching COA mappings:', error);
    return NextResponse.json({ error: 'Failed to fetch COA mappings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = coaMappingCreateSchema.parse(body);

    // Verify the group COA code exists
    const groupCOA = await db.chartOfAccount.findUnique({
      where: { code: validated.groupCOACode },
    });

    if (!groupCOA) {
      return NextResponse.json(
        { error: `Group COA code '${validated.groupCOACode}' not found` },
        { status: 404 }
      );
    }

    // Verify entity exists
    const entity = await db.entity.findUnique({
      where: { code: validated.entityCode },
    });

    if (!entity) {
      return NextResponse.json(
        { error: `Entity '${validated.entityCode}' not found` },
        { status: 404 }
      );
    }

    // Check for existing mapping and upsert
    const existing = await db.cOAMapping.findFirst({
      where: {
        entityCode: validated.entityCode,
        localAccountCode: validated.localAccountCode,
      },
    });

    if (existing) {
      // Update existing mapping
      const mapping = await db.cOAMapping.update({
        where: { id: existing.id },
        data: {
          localAccountName: validated.localAccountName,
          localCOAType: validated.localCOAType,
          groupCOACode: validated.groupCOACode,
        },
        include: {
          groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } },
        },
      });
      return NextResponse.json({ mapping, updated: true });
    }

    const mapping = await db.cOAMapping.create({
      data: {
        entityCode: validated.entityCode,
        localAccountCode: validated.localAccountCode,
        localAccountName: validated.localAccountName,
        localCOAType: validated.localCOAType,
        groupCOACode: validated.groupCOACode,
      },
      include: {
        groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } },
      },
    });

    return NextResponse.json({ mapping, updated: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating/updating COA mapping:', error);
    return NextResponse.json({ error: 'Failed to create/update COA mapping' }, { status: 500 });
  }
}
