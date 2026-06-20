import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { convertToEUR, getExchangeRate } from '@/lib/finance';

const importRecordSchema = z.object({
  entityCode: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
  groupCOACode: z.string().min(1),
  amountLocal: z.number(),
  currency: z.string().min(1),
  amountEUR: z.number().optional(),
  exchangeRateUsed: z.number().optional(),
  sourceSystem: z.string().default('manual'),
  isIntercompany: z.boolean().default(false),
  icPartnerEntityId: z.string().optional(),
});

const importRequestSchema = z.object({
  records: z.array(importRecordSchema).min(1),
});

// In-memory import history (persisted in DB would be better for production)
interface ImportHistoryRecord {
  id: string;
  fileName: string;
  recordCount: number;
  entityCount: number;
  dateRange: string;
  totalAmount: number;
  status: 'completed' | 'failed';
  importedAt: string;
  errors: string[];
}

const importHistory: ImportHistoryRecord[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = importRequestSchema.parse(body);

    const errors: string[] = [];
    let imported = 0;

    for (let i = 0; i < validated.records.length; i++) {
      const record = validated.records[i];

      try {
        // Find entity by code
        const entity = await db.entity.findUnique({
          where: { code: record.entityCode },
        });

        if (!entity) {
          errors.push(`Row ${i + 1}: Entity '${record.entityCode}' not found`);
          continue;
        }

        // Find COA account by code
        const coaAccount = await db.chartOfAccount.findUnique({
          where: { code: record.groupCOACode },
        });

        if (!coaAccount) {
          errors.push(`Row ${i + 1}: COA account '${record.groupCOACode}' not found`);
          continue;
        }

        // Parse period
        const periodDate = new Date(record.period + '-01');

        // Convert to EUR: explicit amountEUR wins, then an explicit rate,
        // then the closing rate stored for the period (1 EUR = X currency).
        let amountEUR = record.amountEUR;
        let rateUsed = record.exchangeRateUsed ?? null;
        if (amountEUR == null) {
          if (record.currency === 'EUR') {
            amountEUR = record.amountLocal;
            rateUsed = 1.0;
          } else {
            rateUsed = rateUsed ?? (await getExchangeRate(record.currency, periodDate, 'closing'));
            amountEUR = convertToEUR(record.amountLocal, rateUsed);
          }
        }

        await db.trialBalance.create({
          data: {
            entityId: entity.id,
            period: periodDate,
            periodType: 'actual',
            groupCOACode: record.groupCOACode,
            amountLocal: record.amountLocal,
            amountEUR,
            currency: record.currency,
            exchangeRateUsed: rateUsed,
            sourceSystem: record.sourceSystem || 'manual',
            isIntercompany: record.isIntercompany || false,
            icPartnerEntityId: record.icPartnerEntityId || null,
          },
        });

        imported++;
      } catch (rowError: any) {
        errors.push(`Row ${i + 1}: ${rowError.message}`);
      }
    }

    // Build import history entry
    const entityCodes = [...new Set(validated.records.map(r => r.entityCode))];
    const periods = validated.records.map(r => r.period).sort(); // YYYY-MM sorts lexicographically
    const totalAmount = validated.records.reduce((sum, r) => sum + Math.abs(r.amountLocal), 0);

    const historyEntry: ImportHistoryRecord = {
      id: `imp-${Date.now()}`,
      fileName: 'csv-upload',
      recordCount: validated.records.length,
      entityCount: entityCodes.length,
      dateRange: periods.length > 0 ? `${periods[0]} to ${periods[periods.length - 1]}` : '',
      totalAmount,
      status: errors.length === 0 ? 'completed' : (imported > 0 ? 'completed' : 'failed'),
      importedAt: new Date().toISOString(),
      errors,
    };

    importHistory.unshift(historyEntry);

    return NextResponse.json({
      imported,
      errors,
      historyEntry,
    }, { status: imported > 0 ? 201 : 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error importing trial balance:', error);
    return NextResponse.json({ error: 'Failed to import data' }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Return import history plus any data from trial balances
    // For a more complete history, we scan recent trial balance records grouped by createdAt
    const recentTB = await db.trialBalance.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        entity: { select: { code: true } },
      },
    });

    // Group by sourceSystem + date to create "import" records
    const importGroups = new Map<string, {
      id: string;
      fileName: string;
      recordCount: number;
      entities: Set<string>;
      periods: Set<string>;
      totalAmount: number;
      firstCreatedAt: Date;
    }>();

    for (const tb of recentTB) {
      const key = `${tb.sourceSystem}-${tb.createdAt.toISOString().split('T')[0]}`;
      if (!importGroups.has(key)) {
        importGroups.set(key, {
          id: `imp-${tb.createdAt.getTime()}`,
          fileName: `${tb.sourceSystem}-import`,
          recordCount: 0,
          entities: new Set<string>(),
          periods: new Set<string>(),
          totalAmount: 0,
          firstCreatedAt: tb.createdAt,
        });
      }
      const group = importGroups.get(key)!;
      group.recordCount++;
      group.entities.add(tb.entity.code);
      group.periods.add(tb.period.toISOString().substring(0, 7));
      group.totalAmount += Math.abs(tb.amountLocal);
    }

    const historyFromDB = Array.from(importGroups.values()).map(group => ({
      id: group.id,
      fileName: group.fileName,
      recordCount: group.recordCount,
      entityCount: group.entities.size,
      dateRange: Array.from(group.periods).sort().join(' → '),
      totalAmount: group.totalAmount,
      status: 'completed' as const,
      importedAt: group.firstCreatedAt.toISOString(),
    }));

    // Merge with in-memory history
    const allHistory = [...importHistory, ...historyFromDB];

    return NextResponse.json({ history: allHistory });
  } catch (error) {
    console.error('Error fetching import history:', error);
    return NextResponse.json({ error: 'Failed to fetch import history' }, { status: 500 });
  }
}
