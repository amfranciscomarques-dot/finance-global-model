import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const trialBalanceCreateSchema = z.object({
  entityId: z.string().min(1),
  period: z.string().min(1), // YYYY-MM format
  periodType: z.enum(['actual', 'budget', 'forecast']).default('actual'),
  groupCOACode: z.string().min(1),
  amountLocal: z.number(),
  amountEUR: z.number(),
  currency: z.string().length(3),
  exchangeRateUsed: z.number().optional().nullable(),
  sourceSystem: z.string().default('manual'),
  isIntercompany: z.boolean().default(false),
  icPartnerEntityId: z.string().optional().nullable(),
  eliminationGroup: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId') || '';
    const period = searchParams.get('period') || '';
    const periodType = searchParams.get('periodType') || '';
    const groupCOACode = searchParams.get('groupCOACode') || '';
    const isIntercompany = searchParams.get('isIntercompany');
    const eliminationStatus = searchParams.get('eliminationStatus') || '';
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};

    if (entityId) where.entityId = entityId;
    if (period) {
      const periodDate = new Date(period + '-01');
      where.period = periodDate;
    }
    if (periodType) where.periodType = periodType;
    if (groupCOACode) where.groupCOACode = groupCOACode;
    if (isIntercompany !== null && isIntercompany !== undefined && isIntercompany !== '') {
      where.isIntercompany = isIntercompany === 'true';
    }
    if (eliminationStatus) where.eliminationStatus = eliminationStatus;

    const [trialBalances, total] = await Promise.all([
      db.trialBalance.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          entity: { select: { code: true, legalName: true, localCurrency: true } },
          groupCOA: { select: { code: true, name: true, accountType: true, statementType: true } },
        },
        orderBy: [{ period: 'desc' }, { groupCOACode: 'asc' }],
        take: limit,
        skip: offset,
      }),
      db.trialBalance.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({ trialBalances, total, limit, offset });
  } catch (error) {
    console.error('Error fetching trial balances:', error);
    return NextResponse.json({ error: 'Failed to fetch trial balances' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = trialBalanceCreateSchema.parse(body);

    // Verify entity exists
    const entity = await db.entity.findUnique({ where: { id: validated.entityId } });
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Verify COA account exists
    const coaAccount = await db.chartOfAccount.findUnique({
      where: { code: validated.groupCOACode },
    });
    if (!coaAccount) {
      return NextResponse.json({ error: 'Chart of Account code not found' }, { status: 404 });
    }

    const periodDate = new Date(validated.period + '-01');

    const trialBalance = await db.trialBalance.create({
      data: {
        entityId: validated.entityId,
        period: periodDate,
        periodType: validated.periodType,
        groupCOACode: validated.groupCOACode,
        amountLocal: validated.amountLocal,
        amountEUR: validated.amountEUR,
        currency: validated.currency,
        exchangeRateUsed: validated.exchangeRateUsed || null,
        sourceSystem: validated.sourceSystem,
        isIntercompany: validated.isIntercompany,
        icPartnerEntityId: validated.icPartnerEntityId || null,
        eliminationStatus: validated.isIntercompany ? 'pending' : 'n/a',
        eliminationGroup: validated.eliminationGroup || null,
      },
    });

    return NextResponse.json({ trialBalance }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating trial balance:', error);
    return NextResponse.json({ error: 'Failed to create trial balance' }, { status: 500 });
  }
}
