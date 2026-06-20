import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { appraiseProject } from '@/lib/projects/finance';

// ============================================================
// PROJECTS — investment appraisal module
//   GET  /api/projects        list all projects with computed metrics
//   POST /api/projects        create a project and appraise it
// ============================================================

export async function GET() {
  try {
    const projects = await db.project.findMany({ orderBy: { createdAt: 'desc' } });
    const parsed = projects.map((p) => ({
      ...p,
      assumptions: p.assumptions ? JSON.parse(p.assumptions) : null,
      cashFlows: p.cashFlows ? JSON.parse(p.cashFlows) : null,
    }));
    return NextResponse.json({ projects: parsed });
  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

const assumptionsSchema = z.object({
  capexSchedule: z.record(z.string(), z.number()).optional(),
  netBenefitByYear: z.record(z.string(), z.number()).optional(),
  rfaiCredit: z.number().optional(),
  residualValue: z.number().optional(),
}).passthrough();

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  entityCode: z.string().min(1),
  countryCode: z.string().default('PT'),
  projectType: z.string().default('investment'),
  currency: z.string().default('EUR'),
  status: z.string().default('appraisal'),
  startYear: z.number().int(),
  horizonYears: z.number().int().default(10),
  capexTotal: z.number().default(0),
  debtAmount: z.number().default(0),
  debtRate: z.number().default(0),
  equityAmount: z.number().default(0),
  discountRate: z.number().default(0.0637),
  terminalGrowth: z.number().default(0.035),
  taxRate: z.number().default(0.235),
  description: z.string().optional(),
  assumptions: assumptionsSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const a = data.assumptions ?? {};
    const appraisal = appraiseProject({
      startYear: data.startYear,
      horizonYears: data.horizonYears,
      capexTotal: data.capexTotal,
      discountRate: data.discountRate,
      terminalGrowth: data.terminalGrowth,
      taxRate: data.taxRate,
      capexSchedule: a.capexSchedule,
      netBenefitByYear: a.netBenefitByYear,
      rfaiCredit: a.rfaiCredit,
      residualValue: a.residualValue,
    });

    const project = await db.project.create({
      data: {
        code: data.code,
        name: data.name,
        entityCode: data.entityCode,
        countryCode: data.countryCode,
        projectType: data.projectType,
        currency: data.currency,
        status: data.status,
        startYear: data.startYear,
        horizonYears: data.horizonYears,
        capexTotal: data.capexTotal,
        debtAmount: data.debtAmount,
        debtRate: data.debtRate,
        equityAmount: data.equityAmount,
        discountRate: data.discountRate,
        terminalGrowth: data.terminalGrowth,
        taxRate: data.taxRate,
        description: data.description,
        assumptions: JSON.stringify(a),
        cashFlows: JSON.stringify({ years: appraisal.years, cashFlows: appraisal.cashFlows }),
        npv: appraisal.npv,
        irr: appraisal.irr,
        paybackYears: appraisal.paybackYears,
      },
    });

    return NextResponse.json({ project, appraisal }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
