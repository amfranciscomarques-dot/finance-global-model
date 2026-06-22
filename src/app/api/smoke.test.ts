import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCompanyPack, seedCompanyPack } from '@/lib/company-packs';

import { GET as auditGET } from './audit/route';
import { GET as coaGET } from './coa/route';
import { GET as complianceGET } from './compliance/route';
import { GET as consolidationProjectionGET } from './consolidation/projection/route';
import { GET as exchangeRatesGET } from './exchange-rates/route';
import { GET as forecastGET } from './forecast/route';
import { GET as journalEntriesGET } from './journal-entries/route';
import { GET as notificationsGET } from './notifications/route';
import { GET as projectsGET } from './projects/route';
import { GET as trialBalancesGET } from './trial-balances/route';
import { GET as workflowGET } from './workflow/route';

// Smoke coverage for the read routes added/touched during remediation. With the
// template pack seeded, each handler must return a non-500 response with a JSON
// body. This is a regression tripwire — it catches a route that throws on a
// realistic DB shape — not a behavioural assertion of each endpoint's contents.

const req = (path: string) => new Request(`http://localhost/api${path}`) as never;

const routes: Array<[string, () => Promise<Response>]> = [
  ['GET /api/audit', () => auditGET(req('/audit'))],
  ['GET /api/coa', () => coaGET(req('/coa'))],
  ['GET /api/compliance', () => complianceGET(req('/compliance?period=2024-12'))],
  ['GET /api/consolidation/projection', () => consolidationProjectionGET(req('/consolidation/projection?period=2024-12&entities=MERID,MSUB&years=3'))],
  ['GET /api/exchange-rates', () => exchangeRatesGET(req('/exchange-rates'))],
  ['GET /api/forecast', () => forecastGET(req('/forecast?period=2024-12'))],
  ['GET /api/journal-entries', () => journalEntriesGET(req('/journal-entries'))],
  ['GET /api/notifications', () => notificationsGET()],
  ['GET /api/projects', () => projectsGET()],
  ['GET /api/trial-balances', () => trialBalancesGET(req('/trial-balances?period=2024-12'))],
  ['GET /api/workflow', () => workflowGET(req('/workflow'))],
];

beforeAll(async () => {
  await seedCompanyPack(db, getCompanyPack('template')!, { reset: true });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('API route smoke tests', () => {
  it.each(routes)('%s returns a non-500 JSON response', async (_name, run) => {
    const res = await run();
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(body).toBeTypeOf('object');
    expect(body).not.toBeNull();
  });
});
