// ============================================================
// AUTHORIZATION POLICY (LOW.5) — edge-safe, dependency-free.
//
// Single source of truth for what each role may do. Imported by the edge
// middleware (which must NOT pull in Prisma or Node APIs), so this file is pure
// TypeScript: no I/O, no `node:` imports, no database.
//
// Role capabilities (segregation of duties):
//   viewer    — read-only. No mutations.
//   preparer  — viewer + prepare the dataset: run consolidations/scenarios,
//               import & edit trial balances, entities, projects, settings…
//   approver  — preparer + destructive/structural actions: any DELETE, plus
//               re-seeding/resetting the whole dataset (POST /api/packs).
//
// Reads (GET/HEAD/OPTIONS) and the demo-explorable "open" POSTs are allowed by
// the middleware BEFORE this policy is consulted; authorizeMutation only ever
// decides on a protected, mutating request.
// ============================================================

export type Role = 'viewer' | 'preparer' | 'approver';

export const ROLES: readonly Role[] = ['viewer', 'preparer', 'approver'];

export function isRole(x: unknown): x is Role {
  return x === 'viewer' || x === 'preparer' || x === 'approver';
}

// Mutations only an approver may perform: anything that wipes, replaces or
// removes data. `DELETE` on any route is destructive by definition; the seed
// endpoint replaces the entire group when run with `reset`.
const APPROVER_ONLY_PATHS: readonly RegExp[] = [
  /^\/api\/packs(\/|$)/, // seed / reset — replaces the whole dataset
];

export function isApproverOnly(method: string, pathname: string): boolean {
  if (method.toUpperCase() === 'DELETE') return true;
  return APPROVER_ONLY_PATHS.some((p) => p.test(pathname));
}

// Authorize a protected mutating request for a given role.
export function authorizeMutation(role: Role, method: string, pathname: string): boolean {
  switch (role) {
    case 'approver':
      return true;
    case 'preparer':
      return !isApproverOnly(method, pathname);
    case 'viewer':
      return false;
    default:
      return false;
  }
}
