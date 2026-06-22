import { z } from 'zod';

// `ConsolidationRun.entityCodes` is a stringly-typed JSON array (see
// prisma/schema.prisma) — SQLite has no native array/JSON column type here, and
// the value is written with JSON.stringify in src/lib/consolidation-engine.ts.
// Because the column carries no schema guarantee, every read must treat it as
// untrusted: a raw JSON.parse would throw on malformed data (taking the whole
// route down with a 500) or silently yield a non-array. This helper is the single
// validated boundary — it returns a clean string[] and falls back to [] on any
// parse/shape failure rather than propagating the error.
const entityCodesSchema = z.array(z.string());

export function parseEntityCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = entityCodesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
