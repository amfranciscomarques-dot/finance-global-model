import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Node-only tests don't touch CSS; skip the project's Tailwind PostCSS config.
  css: { postcss: { plugins: [] } },
  resolve: {
    // Mirror the "@/*" -> "src/*" alias from tsconfig.json (avoids the
    // ESM-only vite-tsconfig-paths plugin under a CommonJS config).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // setup-db copies the seeded SQLite file to an isolated test DB and points
    // DATABASE_URL at it BEFORE any module imports the Prisma client singleton.
    setupFiles: ['./src/test/setup-db.ts'],
    // The engine tests share one isolated DB and mutate it (eliminations); keep
    // them serial so runs stay deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    include: ['src/**/*.{test,spec}.ts'],
  },
});
