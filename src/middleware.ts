import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// DEMO-SAFE API GUARD
//
// This app is a single-tenant portfolio demo seeded with sample company data,
// not a multi-tenant product — so it intentionally ships NO login system. A full
// auth stack (per-user sessions + a userId/orgId column on every table) would be
// the right call for production, but for a clickable demo it only adds friction.
//
// Instead we protect the handful of endpoints that can DESTROY or BULK-REPLACE
// the shared demo dataset behind an admin token, and leave everything else open
// so the live demo stays fully explorable (dashboards, running consolidations,
// scenarios) with zero sign-in.
//
//   - ADMIN_TOKEN unset (local dev):  every route is open.
//   - ADMIN_TOKEN set (deployed demo): the destructive routes below require the
//     token via the `x-admin-token` header or the `admin_token` cookie.
//
// Production upgrade path (documented in README): swap this guard for real
// per-user/per-org authentication and scope every query by tenant.
// ============================================================

// Routes that mutate or wipe the shared dataset. Non-destructive POSTs
// (e.g. running a consolidation or a scenario) are deliberately left open so the
// demo is interactive.
const PROTECTED: ReadonlyArray<{ methods: ReadonlyArray<string>; pattern: RegExp }> = [
  { methods: ['POST'], pattern: /^\/api\/packs(\/|$)/ },        // reseeds / wipes the whole dataset
  { methods: ['POST'], pattern: /^\/api\/import(\/|$)/ },       // bulk trial-balance import
  { methods: ['POST', 'PUT', 'PATCH'], pattern: /^\/api\/settings(\/|$)/ },
  { methods: ['DELETE'], pattern: /^\/api\// },                 // any delete, anywhere
];

export function middleware(req: NextRequest): NextResponse {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return NextResponse.next(); // open in local/dev — no token configured

  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const isProtected = PROTECTED.some(
    (p) => p.methods.includes(method) && p.pattern.test(pathname),
  );
  if (!isProtected) return NextResponse.next();

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
