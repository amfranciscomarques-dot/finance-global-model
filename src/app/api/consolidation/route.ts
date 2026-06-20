import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runConsolidation } from '@/lib/consolidation-engine';
import { z } from 'zod';

const consolidationRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  entityCodes: z.array(z.string()).min(1, 'At least one entity code is required'),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const scenarioType = searchParams.get('scenarioType') || '';

    const where: Record<string, unknown> = {};
    if (scenarioType) where.scenarioType = scenarioType;

    const runs = await db.consolidationRun.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Error fetching consolidation runs:', error);
    return NextResponse.json({ error: 'Failed to fetch consolidation runs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = consolidationRunSchema.parse(body);

    const result = await runConsolidation({
      period: validated.period,
      entityCodes: validated.entityCodes,
      scenarioType: validated.scenarioType,
    });

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error running consolidation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run consolidation' },
      { status: 500 }
    );
  }
}
