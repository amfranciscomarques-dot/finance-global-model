import { NextRequest, NextResponse } from 'next/server';
import { projectConsolidation } from '@/lib/consolidation-engine';
import { FxRateUnavailableError } from '@/lib/finance';
import { z } from 'zod';

// ============================================================
// GET /api/consolidation/projection
//   Multi-period CONSOLIDATED roll-forward (MEDIUM.7). Runs the consolidation
//   for the period, then chains the projection kernel forward `years`, returning
//   the consolidated base plus one fully-derived, balanced statement set per
//   projected year. Read-only — persists no ConsolidationRun.
//
// Query params:
//   period=YYYY-MM            (default 2024-12)
//   entities=MERID,MSUB,...   (comma-separated; required)
//   scenarioType=base|optimistic|pessimistic   (default base)
//   years=N                   (1..10, default 3)
//   revenueGrowthRate=0.05    (optional driver override, as a fraction)
// ============================================================

const querySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format').default('2024-12'),
  entities: z.string().min(1, 'At least one entity code is required'),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  years: z.coerce.number().int().min(1).max(10).default(3),
  revenueGrowthRate: z.coerce.number().finite().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      period: searchParams.get('period') ?? undefined,
      entities: searchParams.get('entities') ?? '',
      scenarioType: searchParams.get('scenarioType') ?? undefined,
      years: searchParams.get('years') ?? undefined,
      revenueGrowthRate: searchParams.get('revenueGrowthRate') ?? undefined,
    });

    const { base, periods } = await projectConsolidation({
      period: parsed.period,
      entityCodes: parsed.entities.split(',').map((c) => c.trim()).filter(Boolean),
      scenarioType: parsed.scenarioType,
      years: parsed.years,
      assumptionOverrides:
        parsed.revenueGrowthRate !== undefined ? { revenueGrowthRate: parsed.revenueGrowthRate } : undefined,
    });

    return NextResponse.json({
      base: {
        period: base.period,
        status: base.status,
        balanceCheck: base.balanceCheck,
        incomeStatement: base.incomeStatement,
        balanceSheet: base.balanceSheet,
        cashFlow: base.cashFlow,
      },
      projection: periods.map((p, i) => ({
        yearOffset: i + 1,
        incomeStatement: p.incomeStatement,
        balanceSheet: p.balanceSheet,
        cashFlow: p.cashFlow,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof FxRateUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('Error projecting consolidation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to project consolidation' },
      { status: 500 },
    );
  }
}
