import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// DEMO-SAFE API GUARD
//
// This app is a single-tenant portfolio demo seeded with sample company data,
// not a multi-tenant product — so it intentionally ships NO login system. A full
// auth stack (per-user sessions + a userId/orgId column on every table) would be
// the right call for production, but for a clickable demo it only adds friction.
//
// Instead we default-deny every MUTATING request (POST/PUT/PATCH/DELETE) behind
// an admin token, and explicitly allowlist the few safe interactive POSTs
// (running a consolidation / scenario) so the live demo stays fully explorable
// (dashboards, reads, running consolidations) with zero sign-in.
//
//   - ADMIN_TOKEN unset (local dev):  every route is open.
//   - ADMIN_TOKEN set (deployed demo): reads + the allowlisted interactive POSTs
//     are open; all other mutations require the token via the `x-admin-token`
//     header or the `admin_token` cookie.
//
// Production upgrade path (documented in README): swap this guard for real
// per-user/per-org authentication and scope every query by tenant.
// ============================================================

// Default-deny for mutating methods: any POST/PUT/PATCH/DELETE requires the
// admin token, EXCEPT the short allowlist of genuinely safe interactive POSTs
// below (running a consolidation or a scenario projection — compute-only, so the
// demo stays explorable). This is stricter than an enumerated block list: new
// mutating routes are protected by default rather than accidentally left open.
const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const OPEN_POSTS: ReadonlyArray<RegExp> = [
  /^\/api\/consolidation(\/|$)/,    // run a consolidation (compute + audit row)
  /^\/api\/scenarios\/run(\/|$)/,   // run a scenario projection (compute + audit row)
];

export function middleware(req: NextRequest): NextResponse {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return NextResponse.next(); // open in local/dev — no token configured

  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Reads (GET/HEAD/OPTIONS) are always open.
  if (!MUTATING_METHODS.has(method)) return NextResponse.next();

  // Allowlisted interactive POSTs stay open; everything else that mutates the
  // shared dataset — or costs money / egresses data, e.g. POST /api/ai-chat —
  // requires the token.
  const isOpenInteractive = method === 'POST' && OPEN_POSTS.some((p) => p.test(pathname));
  if (isOpenInteractive) return NextResponse.next();

  const provided = req.headers.get('x-admin-token') ?? req.cookies.get('admin_token')?.value;
  if (provided && provided === token) return NextResponse.next();

  return NextResponse.json(
    {
      error: 'This action is disabled on the public demo.',
      detail: 'Run the app locally, or supply an admin token, to modify the dataset.',
    },
    { status: 403 },
  );
}

export const config = {
  matcher: ['/api/:path*'],
};
