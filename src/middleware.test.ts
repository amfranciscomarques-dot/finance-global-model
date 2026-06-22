import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { signSession, type SessionPayload } from '@/lib/auth/session';

// LOW.5 — the API guard. Reads stay open; the auth-bootstrap and compute-only
// POSTs stay open; every other mutation needs a session whose role permits it,
// or the legacy admin-token escape hatch. The middleware reads process.env at
// call time, so each test sets the guard configuration it needs.

const SECRET = 'mw-test-secret';

let savedSecret: string | undefined;
let savedAdmin: string | undefined;

beforeAll(() => {
  savedSecret = process.env.AUTH_SECRET;
  savedAdmin = process.env.ADMIN_TOKEN;
});

afterAll(() => {
  if (savedSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedSecret;
  if (savedAdmin === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = savedAdmin;
});

function configure({ secret, admin }: { secret?: string | null; admin?: string | null }) {
  if (secret === null || secret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = secret;
  if (admin === null || admin === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = admin;
}

function req(
  path: string,
  method = 'GET',
  opts: { cookie?: string; adminHeader?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.adminHeader) headers.set('x-admin-token', opts.adminHeader);
  return new NextRequest(new URL(`http://localhost${path}`), { method, headers });
}

async function sessionCookie(role: SessionPayload['role']): Promise<string> {
  const token = await signSession({ sub: 'u1', email: 'u@demo.local', name: 'U', role }, SECRET);
  return `session=${token}`;
}

describe('middleware — guard inactive', () => {
  it('is fully open when neither AUTH_SECRET nor ADMIN_TOKEN is set', async () => {
    configure({ secret: null, admin: null });
    expect((await middleware(req('/api/import', 'POST'))).status).toBe(200);
    expect((await middleware(req('/api/entities/1', 'DELETE'))).status).toBe(200);
  });
});

describe('middleware — guard active (AUTH_SECRET set)', () => {
  it('always allows reads', async () => {
    configure({ secret: SECRET });
    expect((await middleware(req('/api/entities', 'GET'))).status).toBe(200);
    expect((await middleware(req('/api/compliance', 'HEAD'))).status).toBe(200);
  });

  it('allows the auth-bootstrap and compute-only POSTs without a session', async () => {
    configure({ secret: SECRET });
    expect((await middleware(req('/api/auth/login', 'POST'))).status).toBe(200);
    expect((await middleware(req('/api/auth/logout', 'POST'))).status).toBe(200);
    expect((await middleware(req('/api/consolidation', 'POST'))).status).toBe(200);
    expect((await middleware(req('/api/scenarios/run', 'POST'))).status).toBe(200);
  });

  it('requires authentication for other mutations (401)', async () => {
    configure({ secret: SECRET });
    expect((await middleware(req('/api/import', 'POST'))).status).toBe(401);
    expect((await middleware(req('/api/entities/1', 'DELETE'))).status).toBe(401);
  });

  it('denies a viewer any mutation (403)', async () => {
    configure({ secret: SECRET });
    const cookie = await sessionCookie('viewer');
    expect((await middleware(req('/api/import', 'POST', { cookie }))).status).toBe(403);
  });

  it('lets a preparer prepare data but not perform destructive/structural actions', async () => {
    configure({ secret: SECRET });
    const cookie = await sessionCookie('preparer');
    expect((await middleware(req('/api/import', 'POST', { cookie }))).status).toBe(200);
    expect((await middleware(req('/api/entities/1', 'PUT', { cookie }))).status).toBe(200);
    expect((await middleware(req('/api/entities/1', 'DELETE', { cookie }))).status).toBe(403);
    expect((await middleware(req('/api/packs', 'POST', { cookie }))).status).toBe(403);
  });

  it('lets an approver do everything', async () => {
    configure({ secret: SECRET });
    const cookie = await sessionCookie('approver');
    expect((await middleware(req('/api/import', 'POST', { cookie }))).status).toBe(200);
    expect((await middleware(req('/api/entities/1', 'DELETE', { cookie }))).status).toBe(200);
    expect((await middleware(req('/api/packs', 'POST', { cookie }))).status).toBe(200);
  });

  it('rejects a session signed with the wrong secret (treated as anonymous → 401)', async () => {
    configure({ secret: SECRET });
    const bad = await signSession({ sub: 'u', email: 'e', name: 'n', role: 'approver' }, 'not-the-secret');
    expect((await middleware(req('/api/import', 'POST', { cookie: `session=${bad}` }))).status).toBe(401);
  });
});

describe('middleware — admin-token escape hatch', () => {
  it('allows a matching admin token with no session', async () => {
    configure({ secret: SECRET, admin: 'secret-admin' });
    const res = await middleware(req('/api/import', 'POST', { adminHeader: 'secret-admin' }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong admin token', async () => {
    configure({ secret: SECRET, admin: 'secret-admin' });
    const res = await middleware(req('/api/import', 'POST', { adminHeader: 'nope' }));
    expect(res.status).toBe(401);
  });
});
