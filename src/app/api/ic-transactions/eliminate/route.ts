import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const eliminateSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
  entityCodes: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = eliminateSchema.parse(body);

    const periodDate = new Date(validated.period + '-01');
    const periodEnd = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1);

    // Find uneliminated transactions in the period
    const where: Record<string, unknown> = {
      isEliminated: false,
      period: {
        gte: periodDate,
        lt: periodEnd,
      },
    };

    if (validated.entityCodes && validated.entityCodes.length > 0) {
      const entities = await db.entity.findMany({
        where: { code: { in: validated.entityCodes } },
        select: { id: true },
      });
      if (entities.length > 0) {
        const entityIds = entities.map(e => e.id);
        where.OR = [
          { fromEntityId: { in: entityIds } },
          { toEntityId: { in: entityIds } },
        ];
      }
    }

    const transactions = await db.intercompanyTransaction.findMany({
      where,
      include: {
        fromEntity: { select: { code: true } },
        toEntity: { select: { code: true } },
      },
    });

    // Group by matching reference for bilateral elimination
    const byRef = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      const ref = tx.matchingReference || `SOLO-${tx.transactionId}`;
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref)!.push(tx);
    }

    let eliminated = 0;
    const errors: string[] = [];

    for (const [ref, group] of byRef) {
      if (group.length >= 2) {
        // Mark all transactions in this matching group as eliminated
        for (const tx of group) {
          await db.intercompanyTransaction.update({
            where: { id: tx.id },
            data: {
              isEliminated: true,
              eliminationGroup: ref,
            },
          });
          eliminated++;
        }
      } else if (group.length === 1 && !group[0].matchingReference) {
        // No matching reference - can't auto-eliminate
        errors.push(`Transaction ${group[0].transactionId} has no matching counterparty`);
      }
    }

    // Also update trial balances with IC elimination status
    const icTrialBalances = await db.trialBalance.findMany({
      where: {
        isIntercompany: true,
        eliminationStatus: 'pending',
        period: {
          gte: periodDate,
          lt: periodEnd,
        },
      },
    });

    let tbEliminated = 0;
    for (const tb of icTrialBalances) {
      await db.trialBalance.update({
        where: { id: tb.id },
        data: { eliminationStatus: 'eliminated' },
      });
      tbEliminated++;
    }

    return NextResponse.json({
      eliminated,
      tbEliminated,
      errors,
      message: `Eliminated ${eliminated} IC transactions and ${tbEliminated} trial balance entries`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error running eliminations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run eliminations' },
      { status: 500 }
    );
  }
}
