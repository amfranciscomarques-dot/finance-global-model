import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTaxProvider, listTaxJurisdictions } from '@/lib/tax';

// ============================================================
// TAX — pluggable multi-jurisdiction corporate income tax
//   GET  /api/tax                       list registered jurisdictions
//   POST /api/tax  { countryCode, taxableIncome, year, ... }  compute tax
// ============================================================

export async function GET() {
  const jurisdictions = listTaxJurisdictions().map((p) => ({ countryCode: p.countryCode, name: p.name }));
  return NextResponse.json({ jurisdictions });
}

const schema = z.object({
  countryCode: z.string().min(2),
  taxableIncome: z.number(),
  year: z.number().int(),
  iceCredit: z.number().optional(),
  sifideCredit: z.number().optional(),
  rfaiCredit: z.number().optional(),
  autonomousTaxBase: z.number().optional(),
  deductions: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = schema.parse(body);
    const provider = getTaxProvider(input.countryCode);
    const result = provider.computeTax(input);
    return NextResponse.json({ provider: provider.name, result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Error computing tax:', error);
    return NextResponse.json({ error: 'Failed to compute tax' }, { status: 500 });
  }
}
