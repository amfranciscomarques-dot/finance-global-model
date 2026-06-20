import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity') || '';
    const type = searchParams.get('type') || '';
    const status = searchParams.get('status') || '';
    const period = searchParams.get('period') || '';
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: Record<string, unknown> = {};

    if (entity) {
      const entities = await db.entity.findMany({
        where: { code: { contains: entity } },
        select: { id: true },
      });
      if (entities.length > 0) {
        where.OR = [
          { fromEntityId: { in: entities.map(e => e.id) } },
          { toEntityId: { in: entities.map(e => e.id) } },
        ];
      }
    }

    if (type) {
      where.transactionType = type;
    }

    if (status === 'eliminated') {
      where.isEliminated = true;
    } else if (status === 'pending') {
      where.isEliminated = false;
    }

    if (period) {
      const periodDate = new Date(period + '-01');
      where.period = {
        gte: periodDate,
        lt: new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1),
      };
    }

    const transactions = await db.intercompanyTransaction.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        fromEntity: { select: { code: true, legalName: true } },
        toEntity: { select: { code: true, legalName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const formatted = transactions.map((t) => ({
      id: t.id,
      transactionId: t.transactionId,
      fromEntityId: t.fromEntityId,
      fromEntityCode: t.fromEntity.code,
      fromEntityName: t.fromEntity.legalName,
      toEntityId: t.toEntityId,
      toEntityCode: t.toEntity.code,
      toEntityName: t.toEntity.legalName,
      amount: t.amount,
      currency: t.currency,
      amountEUR: t.amountEUR,
      transactionType: t.transactionType,
      matchingReference: t.matchingReference,
      period: t.period.toISOString().slice(0, 7),
      isEliminated: t.isEliminated,
      eliminationGroup: t.eliminationGroup,
      createdAt: t.createdAt.toISOString(),
    }));

    return NextResponse.json({ transactions: formatted });
  } catch (error) {
    console.error('Error fetching IC transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch IC transactions' }, { status: 500 });
  }
}
