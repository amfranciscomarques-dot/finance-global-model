import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const exchangeRateCreateSchema = z.object({
  currency: z.string().length(3),
  rateDate: z.string().min(1), // YYYY-MM-DD format
  rateType: z.enum(['closing', 'average', 'historical']).default('closing'),
  rate: z.number().positive(),
  source: z.string().default('ECB'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = searchParams.get('currency') || '';
    const rateType = searchParams.get('rateType') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: Record<string, unknown> = {};

    if (currency) where.currency = currency;
    if (rateType) where.rateType = rateType;

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.rateDate = dateFilter;
    }

    const rates = await db.exchangeRate.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ rateDate: 'desc' }, { currency: 'asc' }],
      take: limit,
    });

    return NextResponse.json({ rates });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return NextResponse.json({ error: 'Failed to fetch exchange rates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = exchangeRateCreateSchema.parse(body);

    const rateDate = new Date(validated.rateDate);

    // Upsert: if rate exists for same currency+date+type, update it
    const rate = await db.exchangeRate.upsert({
      where: {
        currency_rateDate_rateType: {
          currency: validated.currency,
          rateDate: rateDate,
          rateType: validated.rateType,
        },
      },
      update: {
        rate: validated.rate,
        source: validated.source,
      },
      create: {
        currency: validated.currency,
        rateDate: rateDate,
        rateType: validated.rateType,
        rate: validated.rate,
        source: validated.source,
      },
    });

    return NextResponse.json({ rate }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating/updating exchange rate:', error);
    return NextResponse.json({ error: 'Failed to create/update exchange rate' }, { status: 500 });
  }
}
