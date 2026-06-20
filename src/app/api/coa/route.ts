import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const coaCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  statementType: z.enum(['income', 'balance', 'cashflow']),
  parentCode: z.string().optional().nullable(),
  level: z.number().int().min(1).max(5).default(1),
  isIntercompany: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountType = searchParams.get('accountType') || '';
    const statementType = searchParams.get('statementType') || '';
    const isIntercompany = searchParams.get('isIntercompany');

    const where: Record<string, unknown> = {};
    if (accountType) where.accountType = accountType;
    if (statementType) where.statementType = statementType;
    if (isIntercompany !== null && isIntercompany !== undefined && isIntercompany !== '') {
      where.isIntercompany = isIntercompany === 'true';
    }

    const accounts = await db.chartOfAccount.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        localMappings: {
          take: 5,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch chart of accounts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = coaCreateSchema.parse(body);

    // Check for duplicate code
    const existing = await db.chartOfAccount.findUnique({
      where: { code: validated.code },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Account with code '${validated.code}' already exists` },
        { status: 409 }
      );
    }

    const account = await db.chartOfAccount.create({
      data: {
        code: validated.code,
        name: validated.name,
        accountType: validated.accountType,
        statementType: validated.statementType,
        parentCode: validated.parentCode || null,
        level: validated.level,
        isIntercompany: validated.isIntercompany,
        sortOrder: validated.sortOrder,
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating COA account:', error);
    return NextResponse.json({ error: 'Failed to create COA account' }, { status: 500 });
  }
}
