// ============================================================
// USER STORE & AUTHENTICATION (LOW.5) — Prisma-backed (Node only).
//
// This module touches the database, so it must NOT be imported by the edge
// middleware (which uses session.ts + policy.ts only). Route handlers run in
// the Node runtime and may import it freely.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from './password';
import { isRole, type Role } from './policy';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

function toAuthUser(u: { id: string; email: string; name: string; role: string }): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: isRole(u.role) ? u.role : 'viewer' };
}

// Verify a credential pair. Returns the user on success, null on any failure
// (unknown email, inactive account, or wrong password) — callers must not leak
// which of these it was.
export async function authenticate(
  email: string,
  password: string,
  client: PrismaClient = db,
): Promise<AuthUser | null> {
  const user = await client.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return toAuthUser(user);
}

// Demo users for the single-tenant template — one per role, so the live demo
// has a working login for each capability tier. Clearly-demo credentials; real
// deployments should create their own users and set AUTH_SECRET.
export const DEMO_USERS: ReadonlyArray<{ email: string; name: string; role: Role; password: string }> = [
  { email: 'approver@demo.local', name: 'Ana Approver', role: 'approver', password: 'approver' },
  { email: 'preparer@demo.local', name: 'Pedro Preparer', role: 'preparer', password: 'preparer' },
  { email: 'viewer@demo.local', name: 'Vera Viewer', role: 'viewer', password: 'viewer' },
];

// Idempotent: creates only the demo users that don't already exist, and never
// overwrites a changed password. Safe to call on every seed/reset.
export async function ensureAuthUsers(client: PrismaClient = db): Promise<number> {
  let created = 0;
  for (const u of DEMO_USERS) {
    const existing = await client.user.findUnique({ where: { email: u.email } });
    if (existing) continue;
    await client.user.create({
      data: { email: u.email, name: u.name, role: u.role, passwordHash: await hashPassword(u.password) },
    });
    created++;
  }
  return created;
}
