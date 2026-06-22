# Code Review Plan — finance-global-model (Pass 3)

## Context

Two prior review passes (Pass 1: backend, Pass 2: frontend/UI) have already been run and
fully remediated. This plan covers **Pass 3**: what remains open, what to verify is still
closed, and the incremental improvements worth doing next.

---

## ✅ Resolution status (2026-06-21)

This plan was verified against the code, then remediated. Full write-up: the
**Pass 3** section of [`CODE_REVIEW.md`](CODE_REVIEW.md).

| Item | Outcome |
|------|---------|
| **P1** NaN gauge | Already closed before this pass (fix + regression tests present, green). Plan was stale; cause was zero revenue growth `0/0`, not zero equity. |
| **R1** lint warnings | ✅ Done — 89 → **24** warnings (cleared all 61 `no-unused-vars`, 3 `exhaustive-deps`, 1 `immutability`). The 24 `set-state-in-effect` are deliberately deferred. |
| **R2** unused `KPIs` | ✅ Done — removed (it was in `demo-data.ts`, not `api.ts` as the plan said). |
| **R3** `formatMetricValue` scale | ✅ Done — deviation documented explicitly. |
| **R4** `projects-view` `fmtMoney` | ✅ Done — rationale comment added (it did **not** previously exist). |
| **R5** COAMapping migration | ✅ Done — whole schema baselined as `prisma/migrations/0_init`; live data untouched; `db:deploy` script + README updated. |
| **R6** compliance demo data | ✅ Done — removed `Math.random()` filing/trend + demo-violation fallback; now deterministic/empty-honest. |
| **R7** `entityCodes` JSON | ✅ Done — validated `parseEntityCodes` boundary in the audit & reports routes (+ unit test). |
| **R8** route smoke tests | ✅ Done — 10-route smoke suite added. |
| **P3** browser-smoke 18 views | ✅ Done (2026-06-22) — all 18 driven in-browser; clean except one bug: Cash Flow Forecast "Invalid Date" anchor, fixed + golden-tested. |

Gates: `npx eslint .` → 0 errors / 24 warnings · `npm test` → 89/13 · `npm run build` → 34/34.

---

## What's already done (verified closed)

| Pass | Area | Status |
|------|------|--------|
| Pass 1 | `new Function()` RCE in Excel export → safe additive parser | ✅ Closed |
| Pass 1 | Auth middleware (`src/middleware.ts`) with default-deny mutating routes | ✅ Closed |
| Pass 1 | Stale prefix-matching in `trends`, `variance`, `budget/*` | ✅ Closed |
| Pass 1 | `scenarios/run` broken engine re-impl → engine-driven rewrite | ✅ Closed |
| Pass 1 | Fake 3% elimination column in Excel export | ✅ Closed |
| Pass 1 | `zod/v4` import → `zod` | ✅ Closed |
| Pass 1 | Dead deps (`pdfkit`, `next-auth`, `bun.lock`, `@tanstack/react-query`) | ✅ Closed |
| Pass 1 | `noImplicitAny`, `ignoreBuildErrors` | ✅ Closed |
| Pass 1 | In-memory state → Prisma (`Setting`, `ValidationRule`, `ChatSession`, `ImportBatch`) | ✅ Closed |
| Pass 2 | Dashboard hardcoded charts/trends → real engine data | ✅ Closed |
| Pass 2 | Waterfall K vs M label mismatch | ✅ Closed |
| Pass 2 | Number locale inconsistency (de-DE vs en-US) | ✅ Closed |
| Pass 2 | Per-component `formatNumber` → shared `src/lib/format.ts` | ✅ Closed |
| Pass 2 | Silent demo-fallback on API errors → `DataLoadError` banner | ✅ Closed |
| Pass 2 | Middleware default-deny tightened; `ai-chat` gated | ✅ Closed |
| Pass 2 | `api.ts` fully typed (removed all 44 `any`) | ✅ Closed |
| Pass 2 | `COAMapping` `@@unique` + `@@index` added | ✅ Closed |
| Pass 2 | Large component decomposition (`dashboard`, `entities`, `settings`) | ✅ Closed |
| PLAN.md | `dev` script → `--webpack` | ✅ Closed |

**Test count at last gate:** 68/68 · 0 lint errors · `next build` success (34/34 pages).

---

## Open items (Pass 3 targets)

### P1 — `NaN` health gauge (PLAN.md item, open)

**Status:** Described in PLAN.md but not yet verified as fixed in code.  
The `computeHealthIndicators` function in `helpers.ts` has guards added for most
ratio denominators. However the PLAN.md says it was observed live and needs:
1. A test feeding zero-equity / zero-liabilities KPI shapes and asserting a finite score.
2. Visual confirmation the gauge renders a number in the running app.

> **Important:** This is the only P1 in the current PLAN.md and hasn't been marked resolved.

---

### P3 — Smoke-test remaining views (PLAN.md item)

Only Dashboard + Entities have been exercised under the browser. Unverified views:

- Consolidation, IC Transactions, Journal Entry, Scenarios
- Variance, Budget vs Actual, Trend Analysis, Cash Flow Forecast
- Projects, FX Rates, Chart of Accounts, Reports
- AI Insights, Compliance, Data Import, Audit Trail, Workflow, Settings

---

### R1 — Pre-existing lint warnings (87 active)

- `react-hooks/set-state-in-effect` — 23 instances. These are safe but flag patterns
  the React Compiler would reject. Worth a systematic sweep now that the big
  decompositions are done; most fixes are moving state updates into callbacks or effects.
- `no-unused-vars` — 67 instances. Many are harmless (unused imports, underscore-prefixed
  dead args), but a few likely indicate real dead code. Worth a sweep before the count grows.

> **Note:** Neither warning category was introduced by the reviews; both pre-date Pass 1.

---

### R2 — `api.ts` envelope typing and F8 residual

The `KPIs` `no-unused-vars` warning in `api.ts` was noted as a leftover from the F8
rewrite. Verify it's the only remaining `no-explicit-any` / `no-unused-vars` in that file.

---

### R3 — `formatMetricValue` unit mismatch (entities helpers)

**File:** `src/components/entities/helpers.ts`

The code comment notes: `formatMetricValue` renders EUR-K-scaled values as "€M" because
reconciling it with the shared `formatCompactEUR` (which expects full euros) would alter
displayed figures. This is a correctness risk if entity breakdown values are ever wired to
a different scale. Should be:
- Either documented explicitly as a known deviation, or
- Aligned with `formatCompactEUR` with the correct scale input.

---

### R4 — `projects-view` local `fmtMoney` (intentional but undocumented)

**File:** `src/components/projects-view.tsx`

`fmtMoney` is intentionally kept local (multi-currency, $/ €, 2-dp M, lowercase k).
A comment explains why it's not using `format.ts`. The risk is the next person removes
the comment and tries to "unify" it, breaking multi-currency display. The comment should
be made explicit and potentially wrapped in a well-named function in the shared formatter.

---

### R5 — `COAMapping` DB migration (F9 deferred)

The `@@unique([entityCode, localAccountCode])` and `@@index([groupCOACode])` constraints
were added via `prisma db push` (verified against the live DB: 100 rows, 0 duplicates).
**Risk:** a fresh `prisma migrate dev` would not include these if there's no migration file.
Check whether `prisma/migrations/` has the corresponding migration, or if this is a `db push`-only
change that will be lost on a reset.

---

### R6 — `compliance-view` hardcoded demo violations

**File:** `src/app/api/compliance/route.ts`  
Review verdict: "Hard-coded 'demo' violations and dates degrade trust."  
This was flagged as "OK" in Pass 1 but not remediated. The compliance screen is the
legal/regulatory face of a financial tool — shipping a route that returns fabricated
compliance violations with fixed dates is a credibility risk even in a demo context.

**Options:**
1. Replace with real derivations from the data (e.g. missing eliminations = IC compliance flag).
2. Label the demo violations visually as "illustrative examples."
3. Make the route return an empty list and let the UI show a proper empty state.

---

### R7 — `ConsolidationRun.entityCodes` stringly-typed JSON (F9 partial)

**File:** `prisma/schema.prisma`  
`entityCodes` is a JSON string array with no schema validation. If the column is
ever queried to filter runs by entity, the raw JSON parse is the only guard. Consider
a `Json` field with Zod parsing at the route boundary, or a normalized join table.

---

### R8 — Route smoke tests (33 routes, ~6 have tests)

Pass 1 noted: "There are 33 API routes; only a handful have tests."  
The following new routes added in remediations have **no tests**:
- `/api/audit` (GET)
- `/api/exchange-rates` (GET/POST)
- `/api/notifications` (GET/POST)
- `/api/trial-balances` (GET)
- `/api/coa` (GET/POST)
- `/api/journal-entries` (GET/POST)
- `/api/projects` (GET/POST)
- `/api/forecast` (GET)
- `/api/compliance` (GET)
- `/api/workflow` (GET/PATCH)

Recommended: Add a lightweight "route smoke test" suite that hits each route with a
valid request against the test DB and asserts a non-500 response. This is a single
`vitest` file, not full integration tests.

---

## Suggested execution order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P1** | Fix & verify NaN health gauge (PLAN.md P1) | Low | High — visible on main dashboard |
| **P2** | Smoke-test remaining 18 views in browser | Medium | Catch any silent regressions |
| **R1** | Sweep `set-state-in-effect` warnings (23) | Medium | React Compiler readiness |
| **R1** | Sweep `no-unused-vars` warnings (67) | Low | Dead code hygiene |
| **R5** | Verify `COAMapping` migration exists (not just `db push`) | Low | Data safety on reset |
| **R6** | Compliance route — replace or label demo violations | Medium | Credibility / trust |
| **R3** | Document or fix `formatMetricValue` scale deviation | Low | Future correctness |
| **R8** | Route smoke test suite (33 routes → 1 test file) | Medium | Regression safety |
| **R7** | `ConsolidationRun.entityCodes` schema validation | Low | Data integrity |
| **R4** | Document `projects-view` `fmtMoney` intentionally local | Trivial | Maintainability |
| **R2** | Clean up `KPIs` `no-unused-vars` in `api.ts` | Trivial | Lint hygiene |

---

## Verification plan

After each fix:

```
npm test           # 68+ tests pass
npx eslint .       # 0 errors; warning count non-increasing
npm run build      # next build exits 0, 34/34 pages
```

For browser-visible fixes: navigate the affected view and verify no `NaN`, no
`console.error`, and no demo fallback rendered when the DB has real data.

---

## What is intentionally out of scope

- **Multi-tenant auth** — explicitly deferred, documented in middleware comment and README.
- **Balance-sheet IC eliminations** — pre-existing future work, not a review finding.
- **Tax provider in forecast periods** — pre-existing roadmap item.
- **`settings-view` / other large component decomposition beyond dashboard/entities/settings** — F11 done for the three largest; remaining views are below the threshold.
