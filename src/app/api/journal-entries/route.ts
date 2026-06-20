import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { TrialBalance } from '@prisma/client';
import { z } from 'zod';

// ============================================================
// ZOD VALIDATION
// ============================================================
const journalEntryLineSchema = z.object({
  entityCode: z.string().min(1, 'Entity code is required'),
  accountCode: z.string().min(1, 'Account code is required'),
  accountName: z.string().optional(),
  debit: z.number().min(0, 'Debit must be non-negative').default(0),
  credit: z.number().min(0, 'Credit must be non-negative').default(0),
  description: z.string().default(''),
});

const journalEntryCreateSchema = z.object({
  period: z.string().min(1, 'Period is required'),
  description: z.string().min(1, 'Description is required'),
  lines: z.array(journalEntryLineSchema).min(2, 'At least 2 lines required'),
});

// ============================================================
// GET /api/journal-entries
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '';
    const limit = parseInt(searchParams.get('limit') || '100');

    // Fetch manual journal entries from TrialBalance table
    const where: Record<string, unknown> = {
      sourceSystem: 'manual',
    };

    if (period) {
      const periodDate = new Date(period + '-01');
      where.period = {
        gte: periodDate,
        lt: new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1),
      };
    }

    const manualEntries = await db.trialBalance.findMany({
      where: Object.keys(where).length > 0 ? where : { sourceSystem: 'manual' },
      include: {
        entity: { select: { code: true, legalName: true } },
        groupCOA: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Group entries by a synthetic entry number based on createdAt proximity
    // In a real app, you'd have a JournalEntry model; here we simulate
    const entryGroups = new Map<string, typeof manualEntries>();
    for (const entry of manualEntries) {
      const groupKey = entry.createdAt.toISOString().slice(0, 19);
      if (!entryGroups.has(groupKey)) {
        entryGroups.set(groupKey, []);
      }
      entryGroups.get(groupKey)!.push(entry);
    }

    const entries = Array.from(entryGroups.entries()).map(([key, lines], idx) => {
      const totalDebits = lines.reduce((sum, l) => sum + (l.amountLocal > 0 ? l.amountLocal : 0), 0);
      const totalCredits = lines.reduce((sum, l) => sum + (l.amountEUR > 0 ? l.amountEUR : 0), 0);

      return {
        id: `je-${idx + 1}`,
        entryNumber: `JE-${String(idx + 1).padStart(4, '0')}`,
        date: lines[0].createdAt.toISOString().slice(0, 10),
        period: lines[0].period.toISOString().slice(0, 7),
        description: lines[0].groupCOA?.name || 'Manual Journal Entry',
        lines: lines.map((l) => ({
          entityCode: l.entity.code,
          accountCode: l.groupCOACode,
          accountName: l.groupCOA?.name || l.groupCOACode,
          debit: l.amountLocal > 0 ? l.amountLocal : 0,
          credit: l.amountEUR > 0 ? l.amountEUR : 0,
          description: l.sourceSystem,
        })),
        totalDebits,
        totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
        status: 'posted' as const,
        createdAt: lines[0].createdAt.toISOString(),
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}

// ============================================================
// POST /api/journal-entries
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = journalEntryCreateSchema.parse(body);

    // Validate auto-balancing: total debits === total credits (within 0.01 tolerance)
    const totalDebits = validated.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = validated.lines.reduce((sum, l) => sum + l.credit, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return NextResponse.json(
        { error: `Entry is not balanced. Total debits (${totalDebits.toFixed(2)}) do not equal total credits (${totalCredits.toFixed(2)}). Difference: ${(totalDebits - totalCredits).toFixed(2)}` },
        { status: 400 }
      );
    }

    // Validate that each line has either debit or credit, not both
    for (const line of validated.lines) {
      if (line.debit > 0 && line.credit > 0) {
        return NextResponse.json(
          { error: `Line for account ${line.accountCode} has both debit and credit amounts. Each line must have only one.` },
          { status: 400 }
        );
      }
      if (line.debit === 0 && line.credit === 0) {
        return NextResponse.json(
          { error: `Line for account ${line.accountCode} has zero amounts. Each line must have a non-zero debit or credit.` },
          { status: 400 }
        );
      }
    }

    // Look up entity IDs
    const entityCodes = [...new Set(validated.lines.map((l) => l.entityCode))];
    const entities = await db.entity.findMany({
      where: { code: { in: entityCodes } },
      select: { id: true, code: true, localCurrency: true },
    });
    const entityMap = new Map(entities.map((e) => [e.code, e]));

    // Validate all entity codes exist
    for (const code of entityCodes) {
      if (!entityMap.has(code)) {
        return NextResponse.json(
          { error: `Entity with code ${code} not found` },
          { status: 400 }
        );
      }
    }

    // Create trial balance records for each line
    const createdRecords: TrialBalance[] = [];
    const periodDate = new Date(validated.period + '-01');

    for (const line of validated.lines) {
      const entity = entityMap.get(line.entityCode)!;
      const amount = line.debit > 0 ? line.debit : line.credit;
      const isDebit = line.debit > 0;

      const record = await db.trialBalance.create({
        data: {
          entityId: entity.id,
          period: periodDate,
          periodType: 'actual',
          groupCOACode: line.accountCode,
          amountLocal: isDebit ? amount : 0,
          amountEUR: isDebit ? 0 : amount,
          currency: entity.localCurrency,
          sourceSystem: 'manual',
          isIntercompany: false,
          eliminationStatus: 'pending',
        },
        include: {
          entity: { select: { code: true, legalName: true } },
          groupCOA: { select: { code: true, name: true } },
        },
      });

      createdRecords.push(record);
    }

    const entryNumber = `JE-${String(Date.now()).slice(-4)}`;
    const entry = {
      id: `je-${Date.now()}`,
      entryNumber,
      date: new Date().toISOString().slice(0, 10),
      period: validated.period,
      description: validated.description,
      lines: validated.lines.map((l) => ({
        entityCode: l.entityCode,
        accountCode: l.accountCode,
        accountName: l.accountName || l.accountCode,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
      totalDebits,
      totalCredits,
      isBalanced: true,
      status: 'posted' as const,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ entry, recordsCreated: createdRecords.length }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues.map((e) => e.message) },
        { status: 400 }
      );
    }
    console.error('Error creating journal entry:', error);
    return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 });
  }
}
