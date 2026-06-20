import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(100),
  scenarioType: z.enum(['base', 'optimistic', 'pessimistic']),
  inflationRate: z.number().default(0.025),
  interestRate: z.number().default(0.03),
  fxVolatility: z.number().default(0.05),
  revenueGrowthFactor: z.number().default(1.0),
  opexGrowthFactor: z.number().default(1.0),
  capexGrowthFactor: z.number().default(1.0),
  forecastPeriods: z.number().int().min(1).max(60).default(12),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scenarioType = searchParams.get('scenarioType') || '';
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};
    if (scenarioType) where.scenarioType = scenarioType;
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    const scenarios = await db.scenario.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ scenarios });
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = scenarioCreateSchema.parse(body);

    // Check for duplicate name
    const existing = await db.scenario.findUnique({
      where: { name: validated.name },
    });

    if (existing) {
      // Update existing scenario
      const scenario = await db.scenario.update({
        where: { name: validated.name },
        data: {
          scenarioType: validated.scenarioType,
          inflationRate: validated.inflationRate,
          interestRate: validated.interestRate,
          fxVolatility: validated.fxVolatility,
          revenueGrowthFactor: validated.revenueGrowthFactor,
          opexGrowthFactor: validated.opexGrowthFactor,
          capexGrowthFactor: validated.capexGrowthFactor,
          forecastPeriods: validated.forecastPeriods,
          description: validated.description || null,
          isActive: validated.isActive,
        },
      });
      return NextResponse.json({ scenario, updated: true });
    }

    const scenario = await db.scenario.create({
      data: {
        name: validated.name,
        scenarioType: validated.scenarioType,
        inflationRate: validated.inflationRate,
        interestRate: validated.interestRate,
        fxVolatility: validated.fxVolatility,
        revenueGrowthFactor: validated.revenueGrowthFactor,
        opexGrowthFactor: validated.opexGrowthFactor,
        capexGrowthFactor: validated.capexGrowthFactor,
        forecastPeriods: validated.forecastPeriods,
        description: validated.description || null,
        isActive: validated.isActive,
      },
    });

    return NextResponse.json({ scenario, updated: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating/updating scenario:', error);
    return NextResponse.json({ error: 'Failed to create/update scenario' }, { status: 500 });
  }
}
