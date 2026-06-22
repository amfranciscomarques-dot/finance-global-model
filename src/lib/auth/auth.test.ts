import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';
import { signSession, verifySession } from './session';
import { authorizeMutation, isApproverOnly, isRole } from './policy';

// LOW.5 — the auth primitives. Pure (no DB): PBKDF2 hashing, HMAC-signed
// stateless sessions, and the role→capability policy that the middleware
// enforces. Run on the global Web Crypto API, the same one used in the edge
// middleware and the Node route handlers.

describe('auth/password (PBKDF2)', () => {
  it('hashes and verifies a password round-trip', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', h)).toBe(true);
    expect(await verifyPassword('wrong password', h)).toBe(false);
  });

  it('produces a unique salt per hash, both verifiable', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$abc$salt$hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$10$salt$hash')).toBe(false);
  });
});

describe('auth/session (HMAC)', () => {
  const secret = 'unit-test-secret';
  const base = { sub: 'u1', email: 'a@b.c', name: 'Ana', role: 'preparer' as const };

  it('signs and verifies a session round-trip', async () => {
    const token = await signSession(base, secret);
    const p = await verifySession(token, secret);
    expect(p?.sub).toBe('u1');
    expect(p?.email).toBe('a@b.c');
    expect(p?.role).toBe('preparer');
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession(base, secret);
    const [body, sig] = token.split('.');
    const flipped = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');
    expect(await verifySession(`${flipped}.${sig}`, secret)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(base, secret);
    expect(await verifySession(token, 'other-secret')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signSession({ ...base, exp: Math.floor(Date.now() / 1000) - 10 }, secret);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it('returns null for missing or malformed tokens', async () => {
    expect(await verifySession(undefined, secret)).toBeNull();
    expect(await verifySession('', secret)).toBeNull();
    expect(await verifySession('no-dot-here', secret)).toBeNull();
  });
});

describe('auth/policy (roles)', () => {
  it('classifies approver-only mutations', () => {
    expect(isApproverOnly('DELETE', '/api/entities/123')).toBe(true);
    expect(isApproverOnly('POST', '/api/packs')).toBe(true);
    expect(isApproverOnly('POST', '/api/import')).toBe(false);
    expect(isApproverOnly('PUT', '/api/entities/1')).toBe(false);
  });

  it('authorizes mutations by role (segregation of duties)', () => {
    // viewer — read-only, no mutations
    expect(authorizeMutation('viewer', 'POST', '/api/import')).toBe(false);
    expect(authorizeMutation('viewer', 'DELETE', '/api/entities/1')).toBe(false);

    // preparer — prepare the dataset, but no destructive/structural actions
    expect(authorizeMutation('preparer', 'POST', '/api/import')).toBe(true);
    expect(authorizeMutation('preparer', 'PUT', '/api/entities/1')).toBe(true);
    expect(authorizeMutation('preparer', 'DELETE', '/api/entities/1')).toBe(false);
    expect(authorizeMutation('preparer', 'POST', '/api/packs')).toBe(false);

    // approver — everything
    expect(authorizeMutation('approver', 'POST', '/api/import')).toBe(true);
    expect(authorizeMutation('approver', 'DELETE', '/api/entities/1')).toBe(true);
    expect(authorizeMutation('approver', 'POST', '/api/packs')).toBe(true);
  });

  it('guards unknown role strings', () => {
    expect(isRole('approver')).toBe(true);
    expect(isRole('viewer')).toBe(true);
    expect(isRole('root')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
