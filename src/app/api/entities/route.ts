import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const entityCreateSchema = z.object({
  code: z.string().min(1).max(10),
  legalName: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  localCurrency: z.string().length(3),
  consolidationMethod: z.enum(['full', 'proportional', 'equity']).default('full'),
  ownershipPercentage: z.number().min(0).max(100).default(100),
  sector: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const countryCode = searchParams.get('countryCode') || '';
    const localCurrency = searchParams.get('localCurrency') || '';
    const consolidationMethod = searchParams.get('consolidationMethod') || '';
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { legalName: { contains: search } },
        { countryCode: { contains: search } },
        { localCurrency: { contains: search } },
      ];
    }

    if (countryCode) {
      where.countryCode = countryCode;
    }
    if (localCurrency) {
      where.localCurrency = localCurrency;
    }
    if (consolidationMethod) {
      where.consolidationMethod = consolidationMethod;
    }
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    const entities = await db.entity.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { code: 'asc' },
    });

    return NextResponse.json({ entities });
  } catch (error) {
    console.error('Error fetching entities:', error);
    return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = entityCreateSchema.parse(body);

    // Check for duplicate code
    const existing = await db.entity.findUnique({
      where: { code: validated.code },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Entity with code '${validated.code}' already exists` },
        { status: 409 }
      );
    }

    const entity = await db.entity.create({
      data: {
        code: validated.code,
        legalName: validated.legalName,
        countryCode: validated.countryCode,
        localCurrency: validated.localCurrency,
        consolidationMethod: validated.consolidationMethod,
        ownershipPercentage: validated.ownershipPercentage / 100,
        sector: validated.sector || null,
        isActive: true,
      },
    });

    return NextResponse.json({ entity }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating entity:', error);
    return NextResponse.json({ error: 'Failed to create entity' }, { status: 500 });
  }
}
