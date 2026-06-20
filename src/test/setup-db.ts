import { copyFileSync, existsSync } from 'node:fs';

// ============================================================
// Test DB isolation.
//
// Runs (via vitest `setupFiles`) BEFORE any test module imports the Prisma
// client singleton from "@/lib/db". We copy the already-seeded dev database to
// an isolated file and point DATABASE_URL at it, so engine tests can wipe and
// re-seed freely without touching db/custom.db.
//
// Paths mirror the dev convention in .env (`file:../db/<name>` is resolved by
// Prisma relative to the prisma/ schema directory → project-root db/).
// ============================================================

const SOURCE_DB = 'db/custom.db';
const TEST_DB = 'db/test.db';

if (!existsSync(SOURCE_DB)) {
  throw new Error(
    `Seeded database ${SOURCE_DB} not found. Run the app once (npm run db:push) and POST /api/packs {"packId":"template","reset":true} before running tests.`,
  );
}

// Fresh copy each run gives a known schema; the test suite re-seeds the data.
copyFileSync(SOURCE_DB, TEST_DB);

process.env.DATABASE_URL = `file:../${TEST_DB}`;
