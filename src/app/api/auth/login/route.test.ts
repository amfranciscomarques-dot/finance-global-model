import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { ensureAuthUsers } from '@/lib/auth/users';
import { verifySession } from '@/lib/auth/session';
import { POST as login } from './route';

// LOW.5 — the login route over the Prisma-backed user store. Exercises the real
// credential path: bad credentials are rejected, a valid demo login returns the
// user and sets a verifiable session cookie, and the email lookup is normalised.

beforeAll(async () => {
  await ensureAuthUsers(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function req(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/auth/login', () => {
  it('rejects bad credentials with 401', async () => {
    const res = await login(req({ email: 'viewer@demo.local', password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email with 401 (no user enumeration)', async () => {
    const res = await login(req({ email: 'nobody@demo.local', password: 'viewer' }));
    expect(res.status).toBe(401);
  });

  it('accepts a valid demo login, returns the user and sets a verifiable session cookie', async () => {
    const res = await login(req({ email: 'preparer@demo.local', password: 'preparer' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.email).toBe('preparer@demo.local');
    expect(body.user.role).toBe('preparer');

    const token = res.cookies.get('session')?.value;
    expect(token).toBeTruthy();
    const payload = await verifySession(token);
    expect(payload?.role).toBe('preparer');
    expect(payload?.email).toBe('preparer@demo.local');
  });

  it('normalises the email (case-insensitive)', async () => {
    const res = await login(req({ email: 'APPROVER@Demo.Local', password: 'approver' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe('approver');
  });

  it('validates the request body (400 on missing fields)', async () => {
    const res = await login(req({ email: 'viewer@demo.local' }));
    expect(res.status).toBe(400);
  });
});
