import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

// POST /api/auth/logout — clears the session cookie. No-op if not signed in.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
