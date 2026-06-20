import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================
// GET /api/workflow
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '2024-12';

    const periodDate = new Date(period + '-01');
    const nextMonth = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1);

    // Step 1: Check entities loaded
    const entityCount = await db.entity.count({ where: { isActive: true } });
    const step1Complete = entityCount > 0;

    // Step 2: Check trial balances imported
    const tbCount = await db.trialBalance.count({
      where: {
        period: { gte: periodDate, lt: nextMonth },
        sourceSystem: { not: 'manual' },
      },
    });
    const step2Complete = tbCount > 0;

    // Step 3: Check FX rates updated
    const fxCount = await db.exchangeRate.count({
      where: {
        rateDate: { gte: periodDate, lt: nextMonth },
      },
    });
    const step3Complete = fxCount > 0;

    // Step 4: Check IC eliminations run
    const icEliminated = await db.intercompanyTransaction.count({
      where: { isEliminated: true },
    });
    const icTotal = await db.intercompanyTransaction.count();
    const step4Complete = icTotal > 0 && icEliminated > 0;

    // Step 5: Check consolidation run
    const consolidationRuns = await db.consolidationRun.count({
      where: {
        period: { gte: periodDate, lt: nextMonth },
        status: 'completed',
      },
    });
    const step5Complete = consolidationRuns > 0;

    // Step 6: Check reports generated (we use consolidation runs as proxy)
    const recentRuns = await db.consolidationRun.findMany({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const step6Complete = recentRuns.length > 0;

    // Determine step statuses
    const getStepStatus = (complete: boolean, prevComplete: boolean): 'complete' | 'pending' | 'in_progress' => {
      if (complete) return 'complete';
      if (prevComplete) return 'in_progress';
      return 'pending';
    };

    const steps = [
      {
        id: 'step-1',
        name: 'Load Entity Data',
        status: getStepStatus(step1Complete, true) as 'complete' | 'pending' | 'in_progress',
        completedAt: step1Complete ? new Date().toISOString() : null,
        description: 'Load and validate entity master data including legal names, currencies, consolidation methods, and ownership percentages.',
        metrics: `${entityCount} entities loaded`,
        navigateTo: 'entities',
        navigateLabel: 'Go to Entities',
      },
      {
        id: 'step-2',
        name: 'Import Trial Balances',
        status: getStepStatus(step2Complete, step1Complete) as 'complete' | 'pending' | 'in_progress',
        completedAt: step2Complete ? new Date().toISOString() : null,
        description: 'Import trial balance data from all subsidiary ERPs for the selected period. Data includes account balances in local currency and EUR.',
        metrics: step2Complete ? `${tbCount.toLocaleString()} trial balance records` : 'No records imported',
        navigateTo: 'import',
        navigateLabel: 'Go to Data Import',
      },
      {
        id: 'step-3',
        name: 'Update FX Rates',
        status: getStepStatus(step3Complete, step2Complete) as 'complete' | 'pending' | 'in_progress',
        completedAt: step3Complete ? new Date().toISOString() : null,
        description: 'Update exchange rates for all relevant currency pairs. Rates are used for currency conversion of non-EUR entities (e.g., GBP for UK subsidiary).',
        metrics: step3Complete ? `${fxCount} exchange rates loaded` : 'No FX rates for this period',
        navigateTo: 'fx-rates',
        navigateLabel: 'Go to FX Rates',
      },
      {
        id: 'step-4',
        name: 'Run IC Eliminations',
        status: getStepStatus(step4Complete, step3Complete) as 'complete' | 'pending' | 'in_progress',
        completedAt: step4Complete ? new Date().toISOString() : null,
        description: 'Identify and eliminate intercompany transactions including IC revenue, IC expenses, IC receivables, and IC payables to produce clean consolidated figures.',
        metrics: step4Complete ? `${icEliminated} of ${icTotal} transactions eliminated` : 'No eliminations run',
        navigateTo: 'ic-transactions',
        navigateLabel: 'Go to IC Transactions',
      },
      {
        id: 'step-5',
        name: 'Run Consolidation',
        status: getStepStatus(step5Complete, step4Complete) as 'complete' | 'pending' | 'in_progress',
        completedAt: step5Complete ? recentRuns[0]?.createdAt.toISOString() || new Date().toISOString() : null,
        description: 'Execute the full consolidation process: aggregate financial statements across entities, apply currency conversions, eliminate IC balances, and compute minority interest.',
        metrics: step5Complete ? `${consolidationRuns} consolidation run(s) completed` : 'No consolidation runs',
        navigateTo: 'consolidation',
        navigateLabel: 'Go to Consolidation',
      },
      {
        id: 'step-6',
        name: 'Generate Reports',
        status: getStepStatus(step6Complete, step5Complete) as 'complete' | 'pending' | 'in_progress',
        completedAt: step6Complete ? recentRuns[0]?.createdAt.toISOString() || new Date().toISOString() : null,
        description: 'Generate consolidated financial reports including Income Statement, Balance Sheet, Cash Flow Statement, and regulatory compliance reports.',
        metrics: step6Complete ? 'Reports available' : 'No reports generated',
        navigateTo: 'reports',
        navigateLabel: 'Go to Reports',
      },
    ];

    // Calculate overall progress
    const completedSteps = steps.filter((s) => s.status === 'complete').length;
    const inProgressSteps = steps.filter((s) => s.status === 'in_progress').length;
    const overallProgress = Math.round((completedSteps / steps.length) * 100);

    // Find last completed step
    const lastComplete = [...steps].reverse().find((s) => s.status === 'complete');

    // Estimate time remaining
    const remainingSteps = steps.length - completedSteps;
    const estimatedTimeRemaining = remainingSteps === 0
      ? 'Complete'
      : `~${remainingSteps * 2} min (${inProgressSteps} in progress)`;

    const workflow = {
      steps,
      overallProgress,
      lastCompletedStep: lastComplete?.name || null,
      estimatedTimeRemaining,
    };

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow' }, { status: 500 });
  }
}
