import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseEntityCodes } from '@/lib/entity-codes';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get('actionType') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const entries: Array<{
      id: string;
      timestamp: string;
      actionType: 'consolidation' | 'entity' | 'import' | 'fx';
      description: string;
      user: string;
      affectedEntities: string[];
      details: Record<string, unknown>;
    }> = [];

    // Fetch consolidation runs
    if (!actionType || actionType === 'consolidation') {
      const runs = await db.consolidationRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      for (const run of runs) {
        const entityCodes = parseEntityCodes(run.entityCodes);
        const period = run.period.toISOString().substring(0, 7);
        entries.push({
          id: run.id,
          timestamp: run.createdAt.toISOString(),
          actionType: 'consolidation',
          description: `Consolidation run for ${period} (${run.scenarioType} scenario) — ${run.status}`,
          user: 'System',
          affectedEntities: entityCodes,
          details: {
            period,
            scenarioType: run.scenarioType,
            status: run.status,
            eliminationsApplied: run.eliminationsApplied,
            totalRevenue: run.totalRevenue,
            totalEBITDA: run.totalEBITDA,
            totalNetIncome: run.totalNetIncome,
            processingTimeMs: run.processingTimeMs,
          },
        });
      }
    }

    // Fetch entity changes
    if (!actionType || actionType === 'entity') {
      const entities = await db.entity.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      for (const entity of entities) {
        // Treat recently updated entities as changes
        const isRecent = (Date.now() - entity.updatedAt.getTime()) < 30 * 24 * 60 * 60 * 1000;
        if (isRecent || entity.createdAt.getTime() === entity.updatedAt.getTime()) {
          entries.push({
            id: `entity-${entity.id}`,
            timestamp: entity.updatedAt.toISOString(),
            actionType: 'entity',
            description: `Entity ${entity.code} (${entity.legalName}) ${entity.createdAt.getTime() === entity.updatedAt.getTime() ? 'created' : 'updated'}`,
            user: 'Admin',
            affectedEntities: [entity.code],
            details: {
              code: entity.code,
              legalName: entity.legalName,
              consolidationMethod: entity.consolidationMethod,
              ownershipPercentage: entity.ownershipPercentage,
            },
          });
        }
      }
    }

    // Fetch FX rate changes
    if (!actionType || actionType === 'fx') {
      const rates = await db.exchangeRate.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      for (const rate of rates) {
        entries.push({
          id: `fx-${rate.id}`,
          timestamp: rate.createdAt.toISOString(),
          actionType: 'fx',
          description: `FX rate updated: ${rate.currency} ${rate.rateType} = ${rate.rate} (${rate.source})`,
          user: rate.source === 'ECB' ? 'ECB Feed' : 'Admin',
          affectedEntities: [],
          details: {
            currency: rate.currency,
            rateType: rate.rateType,
            rate: rate.rate,
            source: rate.source,
            rateDate: rate.rateDate.toISOString().split('T')[0],
          },
        });
      }
    }

    // Fetch data import activity
    if (!actionType || actionType === 'import') {
      // Group trial balances by sourceSystem + date
      const tbImports = await db.trialBalance.groupBy({
        by: ['sourceSystem'],
        _count: { id: true },
        _sum: { amountLocal: true },
        orderBy: { _count: { id: 'desc' } },
      });

      for (let i = 0; i < tbImports.length; i++) {
        const imp = tbImports[i];
        entries.push({
          id: `import-${i}`,
          timestamp: new Date(Date.now() - i * 86400000).toISOString(),
          actionType: 'import',
          description: `Data import via ${imp.sourceSystem}: ${imp._count.id} records, €${Math.abs(imp._sum.amountLocal || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} total`,
          user: 'Data Pipeline',
          affectedEntities: [],
          details: {
            sourceSystem: imp.sourceSystem,
            recordCount: imp._count.id,
            totalAmount: imp._sum.amountLocal,
          },
        });
      }
    }

    // Sort all entries by timestamp descending
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply date filters
    let filtered = entries;
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter(e => new Date(e.timestamp) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(e => new Date(e.timestamp) <= to);
    }

    return NextResponse.json({ entries: filtered });
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    return NextResponse.json({ error: 'Failed to fetch audit trail' }, { status: 500 });
  }
}
