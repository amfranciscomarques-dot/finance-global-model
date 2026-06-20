import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const entityUpdateSchema = z.object({
  legalName: z.string().min(1).max(200).optional(),
  countryCode: z.string().length(2).optional(),
  localCurrency: z.string().length(3).optional(),
  consolidationMethod: z.enum(['full', 'proportional', 'equity']).optional(),
  ownershipPercentage: z.number().min(0).max(100).optional(),
  sector: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entity = await db.entity.findUnique({
      where: { id },
      include: {
        trialBalances: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        intercompanyFrom: { take: 5 },
        intercompanyTo: { take: 5 },
      },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({ entity });
  } catch (error) {
    console.error('Error fetching entity:', error);
    return NextResponse.json({ error: 'Failed to fetch entity' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = entityUpdateSchema.parse(body);

    const existing = await db.entity.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (validated.legalName !== undefined) updateData.legalName = validated.legalName;
    if (validated.countryCode !== undefined) updateData.countryCode = validated.countryCode;
    if (validated.localCurrency !== undefined) updateData.localCurrency = validated.localCurrency;
    if (validated.consolidationMethod !== undefined) updateData.consolidationMethod = validated.consolidationMethod;
    if (validated.ownershipPercentage !== undefined) updateData.ownershipPercentage = validated.ownershipPercentage / 100;
    if (validated.sector !== undefined) updateData.sector = validated.sector;
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

    const entity = await db.entity.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ entity });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating entity:', error);
    return NextResponse.json({ error: 'Failed to update entity' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.entity.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Soft delete: set isActive = false
    const entity = await db.entity.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ entity, message: 'Entity deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating entity:', error);
    return NextResponse.json({ error: 'Failed to deactivate entity' }, { status: 500 });
  }
}
