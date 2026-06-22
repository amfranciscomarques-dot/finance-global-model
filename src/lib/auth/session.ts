// ============================================================
// SESSION TOKENS (LOW.5) — edge-safe, dependency-free.
//
// Stateless, HMAC-signed session cookies (no server-side session store). The
// token is `base64url(payload).base64url(HMAC-SHA256(payload))`, signed and
// verified with the Web Crypto API so the SAME code runs in the edge middleware
// (verify) and in Node route handlers (sign). No `node:` imports, no Prisma.
//
// Secret resolution is shared by signer and verifier: in production AUTH_SECRET
// MUST be set; locally we fall back to a clearly-insecure constant so the demo
// works end-to-end with zero configuration (mirrors the ADMIN_TOKEN philosophy
// in src/middleware.ts).
// ============================================================

import { isRole, type Role } from './policy';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: Role;
  exp: number; // expiry, epoch seconds
}

const DEV_SECRET = 'dev-insecure-auth-secret-change-me';

export function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is not set — refusing to sign/verify sessions in production.');
  }
  return DEV_SECRET;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// --- base64url over raw bytes (no Buffer; works in edge + node) ---
function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signSession(
  payload: { sub: string; email: string; name: string; role: Role; exp?: number },
  secret?: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  const key = secret ?? getAuthSecret();
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + ttlSeconds;
  const body: SessionPayload = {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    exp,
  };
  const encoded = bytesToB64url(encoder.encode(JSON.stringify(body)));
  const sig = bytesToB64url(await hmacSha256(key, encoded));
  return `${encoded}.${sig}`;
}

export async function verifySession(
  token: string | undefined | null,
  secret?: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const key = secret ?? getAuthSecret();
  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = await hmacSha256(key, encoded);
  let provided: Uint8Array;
  try {
    provided = b64urlToBytes(providedSig);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expectedSig, provided)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decoder.decode(b64urlToBytes(encoded)));
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.exp !== 'number' ||
    !isRole(payload.role)
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
