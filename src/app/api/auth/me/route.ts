import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';

// GET /api/auth/me — the current user from the session cookie, or null.
export async function GET(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: session.sub, email: session.email, name: session.name, role: session.role },
  });
}
