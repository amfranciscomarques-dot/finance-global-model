import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { authorizeMutation } from '@/lib/auth/policy';

// ============================================================
// API GUARD — single-tenant auth (LOW.5)
//
// Real credential login (src/lib/auth/*) layered over the original demo-safe
// guard. The model stays single-tenant: one shared dataset, with roles deciding
// who may change it.
//
//   - Neither AUTH_SECRET nor ADMIN_TOKEN set (pure local dev): everything is
//     open — zero friction.
//   - Otherwise the guard is active:
//       * Reads (GET/HEAD/OPTIONS) are always open — the demo stays explorable.
//       * A short allowlist of safe POSTs stays open: the auth bootstrap routes
//         (login/logout, which can't require a session) and the compute-only
//         interactive runs (consolidation / scenario projection).
//       * Every other mutation requires either a valid session cookie whose
//         role permits the action (see policy.ts), or — as a CI/script escape
//         hatch — the legacy admin token.
//
// Session verification uses the Web Crypto API (HMAC), which runs in the edge
// runtime; policy.ts and session.ts are dependency-free, so no Prisma or Node
// API is pulled into the middleware bundle.
// ============================================================

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const OPEN_POSTS: ReadonlyArray<RegExp> = [
  /^\/api\/auth\/(login|logout)(\/|$)/, // auth bootstrap — must be reachable pre-session
  /^\/api\/consolidation(\/|$)/, // run a consolidation (compute + audit row)
  /^\/api\/scenarios\/run(\/|$)/, // run a scenario projection (compute + audit row)
];

function deny(status: number, error: string, detail: string): NextResponse {
  return NextResponse.json({ error, detail }, { status });
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const adminToken = process.env.ADMIN_TOKEN;
  const authSecret = process.env.AUTH_SECRET;

  // Open in pure local/dev when no guard is configured at all.
  if (!adminToken && !authSecret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Reads are always open.
  if (!MUTATING_METHODS.has(method)) return NextResponse.next();

  // Allowlisted safe POSTs (auth bootstrap + compute-only runs) stay open.
  if (method === 'POST' && OPEN_POSTS.some((p) => p.test(pathname))) return NextResponse.next();

  // 1) Real login: a valid session cookie whose role permits the action.
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    if (authorizeMutation(session.role, method, pathname)) return NextResponse.next();
    return deny(
      403,
      'Insufficient role for this action.',
      `Your role '${session.role}' cannot perform ${method} ${pathname}.`,
    );
  }

  // 2) Legacy admin-token escape hatch (CI / scripts) — full access.
  const provided = req.headers.get('x-admin-token') ?? req.cookies.get('admin_token')?.value;
  if (adminToken && provided && provided === adminToken) return NextResponse.next();

  // 3) Otherwise authentication is required.
  return deny(
    401,
    'Authentication required.',
    'Sign in (or supply an admin token) to modify the dataset.',
  );
}

export const config = {
  matcher: ['/api/:path*'],
};
