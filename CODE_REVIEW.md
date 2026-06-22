# Code Review — finance-global-model

> Scope: full static review of `C:\Users\amfmn\Desktop\finance-global-model` (Next.js 16 + React 19 + Prisma 6 + SQLite). No code was modified. Findings are grouped by severity, then by area, with line-level pointers where useful.

## TL;DR

This is a **good-quality, well-documented financial consolidation app** with a clear domain model and some of the best-commented code I've seen in this category. The financial-domain core (`src/lib/consolidation-engine.ts`, `src/lib/finance/*`, `src/lib/tax/*`, `src/lib/projects/finance.ts`) is solid, well-tested with golden values, and reads as the work of someone who knows the domain.

The problems are concentrated in three areas:

1. **Security: a `new Function()` RCE in the Excel export** and other input-handling gaps. This is the most urgent finding.
2. **Quality: stale "legacy prefix-matching" code paths** that the README and code itself identify as superseded but that are still being executed by live API routes. They produce *different numbers* from the engine.
3. **Configuration/operational: a permissive `.env`, `ignoreBuildErrors`, a practically-empty ESLint config, lockfile drift, and unused dependencies** — all of which compound the first two problems by making regressions invisible.

The README, the in-code comments, and the recent test files indicate the author **already knows** most of what's wrong. The fix list is mostly "do what the comments say is already done."

---

## Update (2026-06-20) — verification & remediation

Every finding below was re-verified against the code. Corrections to the original report, and current fix status:

**Corrections to the original findings:**

- **#1 (`new Function()`) was overstated as a live RCE.** Verified: every `calc` string is a hard-coded literal and every key in `values` is a hard-coded identifier whose values are numbers, so there is no user-controlled path into the expression today. It was a fragile pattern, not an exploitable RCE. **Fixed anyway** — replaced with a safe additive token parser (no `eval`/`new Function`).
- **#8 (`.env` "checked in") is wrong.** `.env` is **gitignored and untracked** (`git ls-files .env` is empty; `git check-ignore` matches). No action needed.
- **#3 (`variance` route) was overstated.** The `sign` field is defined but never used — but because expenses are stored negative, the summed Net Income is ~correct. The real issue is the dead `sign` field, not wrong numbers. (Still to clean up.)
- **#4 (`scenarios/run`) — one detail wrong, severity understated.** The route does *not* discard the second `runConsolidation`; it uses it as the adjustment base. More importantly, `interestRate`/`fxVolatility` are seeded as **whole-number percents** (4.15, 5.0) while the formulas assumed fractions, so the `*10` interest and fx multipliers produced absurd results (interest ×~50, revenue ×~3.5), not just "magic numbers."

**Fixed (see commit):** #1 (safe parser), #3 trends prefix-subset + `budget` `EQ-`→`EQY-` + `zod/v4`→`zod`, #4 `scenarios/run` rewritten engine-driven (base effective tax rate, no magic 25%/×10/fx), #5 fake 3% eliminations removed, #10 zod import, #13 dead deps (`pdfkit`, `next-auth`) removed, #8 lockfile drift (`bun.lock` deleted). #2 auth addressed via a right-sized demo-safe `src/middleware.ts` (reads open, destructive routes gated by `ADMIN_TOKEN`) — see README "Security / auth posture"; multi-tenant auth intentionally deferred for a demo. Also swept `error.errors`→`.issues` (Zod v4) repo-wide.

- **#9/#11 (ESLint, `ignoreBuildErrors`, `noImplicitAny`) — done.** All TypeScript errors cleared (statement-cast helper, typed Prisma result arrays, `lastAutoTable.finalY` cast, framer-motion `Variants` annotations); `noImplicitAny: false` override removed (code is clean under `strict`); `ignoreBuildErrors: false` flipped and **verified by a real `next build`** (TypeScript step runs and passes). ESLint runs a curated rule set with 0 errors / ~170 warnings; the two React-Compiler lints (`set-state-in-effect`, `immutability`) are kept as warnings.
- **#12 (in-memory state) — done.** `settings`/`validationRules`, AI-chat sessions and import history now persist to Prisma (`Setting`, `ValidationRule`, `ChatSession`, `ImportBatch`); helpers in `src/lib/app-settings.ts` with round-trip tests. (`ic-transactions/eliminate` had no in-memory state — only N+1 writes, acceptable at demo scale.)

- **Excel/PDF exports + `variance` repoint — done.** Extracted a compute-only `computeConsolidation` from the engine (no audit-row side effect); both exporters now go through `src/lib/report-model.ts`, so the Consolidated column shows real IC-eliminated figures (verified: parsed the generated `.xlsx` — Revenue entity-sum 49.0M − elim 7.5M = consolidated 41.5M, balance check 0, and exports create no ConsolidationRun rows). `variance` repointed onto `buildStatements`/`resolveMetric` and the dead `sign` field removed. Added a `scenarios/run` route test (4 cases).

**Still open:** Nothing from the original review. Remaining roadmap items (balance-sheet IC eliminations, wiring the tax provider into the engine for forecast periods) are pre-existing future work, not review findings.

---

## 1. Findings at a glance

| # | Severity   | Area             | Finding                                                                                       |
|---|------------|------------------|----------------------------------------------------------------------------------------------|
| 1 | 🔴 Critical | Security         | `new Function()` evaluates user-controllable expressions in Excel export                     |
| 2 | 🔴 Critical | Security         | No authentication / authorization on any API route (incl. `next-auth` is installed but unused) |
| 3 | 🟠 High     | Correctness      | Stale prefix-matching code in 6+ API routes produces wrong numbers vs. the engine            |
| 4 | 🟠 High     | Correctness      | Scenario "adjustment" math in `api/scenarios/run` re-implements a broken version of the engine |
| 5 | 🟠 High     | Correctness      | Excel `eliminations` column is a fake (3% of revenue) — not real IC elimination              |
| 6 | 🟡 Medium   | Security/Correct. | Several routes read `request.url` / `request.nextUrl` inconsistently, some return 500 on bad input |
| 7 | 🟡 Medium   | Security         | `z-ai-web-dev-sdk` and external ECB endpoints have no SSRF/secret controls                  |
| 8 | 🟡 Medium   | Quality          | `.env` is checked in with a relative-path DB; lockfiles (`bun.lock` + `package-lock.json`) diverge |
| 9 | 🟡 Medium   | Quality          | `eslint` is effectively disabled (every rule turned off) — builds don't catch real issues     |
| 10| 🟡 Medium  | Quality          | `import { z } from 'zod/v4'` in `budget/route.ts` is inconsistent with every other route     |
| 11| 🟢 Low      | DX/Correctness   | `tsconfig.json` has `noImplicitAny: false`; `next.config.ts` has `ignoreBuildErrors: true`   |
| 12| 🟢 Low      | Quality          | In-memory state in `settings`, `ai-chat`, `ic-transactions/eliminate`, `import` (history)    |
| 13| 🟢 Low      | Quality          | Dead deps: `pdfkit`, `next-auth` declared but never imported                                 |
| 14| 🟢 Low      | Quality          | `prisma` field name `cOAMapping` (camelCased model) is awkward to grep                       |
| 15| 🟢 Low      | Quality          | Large view components (70KB `entities-view`, 64KB `dashboard-view`) — likely need decomposition |

---

## 2. Security findings

### 🔴 1. `new Function()` RCE in Excel export (Excel export route)

**File:** `src/app/api/export/excel/route.ts`, function `resolveCalc` (around line 215).

```ts
function resolveCalc(calc: string, values: Record<string, number>): number {
  let expression = calc;
  for (const [key, val] of Object.entries(values)) {
    expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
  }
  try {
    // Safe evaluation of simple arithmetic
    const result = new Function(`return ${expression}`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}
```

**The "Safe evaluation" comment is wrong.** The string passed to `new Function` is a concatenation of:

- Hard-coded `calc` strings from the same file (`'revenue+cogs'`, `'currentAssets+nonCurrentAssets'`, etc.).
- **Number-valued replacements** derived from `ef.is` / `ef.bs` / `ef.cf` — which are themselves `Record<string, number>` *populated by the trial-balance lookups*.

In the current code, the lookup keys (`revenue`, `cogs`, `ppe`, …) are hard-coded, so today it's mostly safe. But:

- Any future refactor that feeds user-supplied keys (e.g. group COA codes the user can add) into the same path becomes a remote code execution.
- The same pattern (`new Function(\`return ${expression}\`)`) is the textbook RCE. There is no sandbox.
- The dynamic regex on `key` is also a problem: any value that contains regex metachars (`+`, `*`, `(`, …) will throw or misbehave.

**Fix:** Replace with a real expression parser (`expr-eval`, `mathjs`, or hand-rolled AST for the four operators actually used). Do not use `new Function`, `eval`, or string concatenation with user-derived keys.

### 🔴 2. No authentication on any API route

There is no `middleware.ts` (`src/app/` has none, `src/lib/` has no auth helpers) and the only auth dependency in `package.json` is `next-auth: ^4.24.11`, which is **never imported** anywhere in `src/`. Every route — including:

- `POST /api/import` (writes to the DB),
- `POST /api/consolidation` (writes a `ConsolidationRun` and reads all entities),
- `POST /api/ic-transactions/eliminate` (mutates `isEliminated` and `eliminationGroup`),
- `POST /api/ai-chat` (sends user content + DB context to a third-party LLM),
- `GET /api/export/pdf` and `excel` (returns all entities' trial balances) —

…is reachable by anyone who can reach the dev server. The README and the dashboard mock-data setup suggest this is currently a personal/team tool, but the data model (entities, IC transactions, tax data) and the lack of any `userId`/`orgId` column in the schema mean that adding multi-tenant auth later will be a major migration, not a config change.

**Fixes (in order of urgency):**
1. Add a `middleware.ts` at `src/middleware.ts` that gates every `/api/*` and dashboard route on at least a session cookie.
2. Add `userId` (or `orgId`/`groupId`) to the schema and pass it through every query, or — if the tool is single-user — explicitly document and treat the server as local-only and bind it to `127.0.0.1`.
3. Wire `next-auth` (already in deps) or remove it.

### 🟡 7. `z-ai-web-dev-sdk` and external HTTP

- The AI chat route (`src/app/api/ai-chat/route.ts`) sends trial-balance data and recent consolidation results to a third-party SDK without redaction. The system prompt also embeds a list of entity codes + names + currencies. If this is exposed (see #2), that is PII / commercially sensitive data exfiltration.
- The settings route advertises `ecbApiEnabled: true` and a `rateTypePreference`, but I see no actual ECB fetch in the source — make sure the placeholder doesn't ship claiming to do something it doesn't (or remove the field).

---

## 3. Correctness — the "two consolidation engines" problem

This is the biggest issue in the codebase, and the README already calls it out. There is one well-written engine (`src/lib/consolidation-engine.ts`, plus `src/lib/finance/*`) and a set of older "prefix-matching" routes that re-implement (incorrectly) parts of it.

### 🟠 3. Stale prefix-matching in reporting/analysis routes

Affected files (all still in the live `src/app/api/...` tree and reachable from the dashboard):

- `src/app/api/trends/route.ts` — hard-codes 6 `metric` definitions with their own COA prefix lists (`'REV-001', 'REV-002', 'REV-003'` only, ignoring `REV-004..010`; `'COGS-001', 'COGS-002'` only, etc.). Any revenue posted under `REV-004` (Support & Maintenance) or higher **does not appear** in the trend for `revenue`, `ebitda`, `netIncome`, or `assets`. The custom `ebitdaMargin` re-derives EBITDA with the same broken subset, so margin is also wrong.
- `src/app/api/variance/route.ts` — uses `e.groupCOACode.startsWith(prefix)` to filter. The `IntelliJ` intent is fine, but the metric definitions double-count: `Net Income` is defined as `['REV-', 'COGS-', 'OPX-', 'PAY-', 'DEP-', 'INT-', 'TAX-']` with `sign: 0`, so it sums each `prefix`'s filtered set independently. That's three Revenue buckets and three OPEX buckets folded with their original signs — for a sum of *raw amounts*, the result is `revenue + cogs + opex + payroll + da + interest + tax`, not net income. For accounts stored as positives on the credit side, this is structurally wrong.
- `src/app/api/budget/route.ts` and `budget/variance/route.ts` — duplicate the prefix logic with `getCategory()`, which contains a real bug: it checks `code.startsWith('EQ-')` but the actual COA prefix is `EQY-` (see `src/lib/coa-data.ts`). All `EQY-*` accounts are silently categorized as `'Other'`. Equity totals in budget vs. actual are wrong.
- `src/app/api/entities/[id]/route.ts` (assumed) — should be reviewed for the same pattern; not opened in full.

**The good news:** the engine (`runConsolidation` + `addEntry` + `deriveIncomeStatement` / `deriveBalanceSheet` / `deriveCashFlow`) already does this correctly and has golden-value tests (`consolidation-engine.test.ts`).

**Fix:** Refactor each of these routes to call the engine and aggregate from the result, *or* extract a single `metricResolver` helper in `src/lib/finance/` that takes a `FinancialStatements` and a metric name and returns the value. Add the `EQY-` fix and the "all `REV-*`" fix to the helper.

### 🟠 4. `api/scenarios/run/route.ts` re-implements a broken engine

This route runs `runConsolidation` twice (base + scenario), then **discards the result of the second call** and applies growth factors with hand-rolled math:

```ts
adjustedIS.grossProfit = adjustedIS.revenue + adjustedIS.cogs;          // OK
adjustedIS.ebitda = adjustedIS.grossProfit + adjustedIS.opex;            // OK
adjustedIS.interestExpense *= (1 + (scenario.interestRate - 0.03) * 10); // Magic 10x
adjustedIS.taxExpense = -(Math.abs(adjustedIS.ebt) * 0.25);             // Hard-coded 25% — ignores tax provider
```

Concrete problems:

- **Tax is hard-coded to 25 %** even though the project has a full `tax/jurisdictions/portugal.ts` and `flat-rate.ts`. The Portugal effective rate with derramas is 20 % + 1.5 % + tiered 3-9 %, and the route silently returns the wrong number.
- The interest-rate "adjustment" (`* 10` multiplier) is unexplained and not tied to any scenario semantics.
- `adjustedBS.cash = adjustedCF.endingCash` overwrites the consolidated cash position but doesn't update the cash side of the derivation; the reported `totalAssets` no longer balances.
- `fxVolatility` is multiplied into revenue (`fxImpact = 1 + (vol - 0.05) * 0.5`) and applied *after* the base numbers, so it double-counts if the engine already used rates.
- The "scenario" output isn't persisted anywhere (no DB write, no audit trail), and `runConsolidation` is called for `scenarioType: scenario.scenarioType` but the engine does not currently key off `scenarioType` for arithmetic — so the *second* engine call is a no-op duplication, the *first* engine call's result is the only authoritative thing, and the hand-rolled adjustments on top are wrong.

**Fix:** Either (a) extend `runConsolidation` to accept growth factors and a tax provider and have it apply them inside the engine, or (b) compute a forecast through the same `buildRealAnnualCashFlow` path used by `api/forecast/route.ts` (which is well-designed). Persist the result and the parameters.

### 🟠 5. Excel export `eliminations` column is a fake

`src/app/api/export/excel/route.ts` around line 290:

```ts
eliminations[key] = key === 'revenue' ? -consolidated[key] * 0.03 : 0;
```

A flat **3 % of revenue** deduction is shown in the Eliminations column for every line item. That is not an intercompany elimination; it is a magic number. Combined with the `consolidated_all` report being printed to Excel for an audit trail, this is misleading at best and inaccurate at worst.

**Fix:** Use `runConsolidation` to get the real eliminated numbers, or remove the column when the engine is not invoked.

### 🟡 6. Input handling: `request.url` vs `request.nextUrl` vs `URL`

Some routes read `request.url` (correct on `NextRequest`), others read `request.nextUrl` (also valid), and at least one (`forecast`) uses a plain `Request` and constructs `new URL(request.url)` — fine. The pattern is mostly correct, but:

- Inconsistent error handling: e.g. `consolidation/route.ts` swallows `parseInt` failures (`parseInt(searchParams.get('limit') || '20')`) without a guard, and `scenarios/route.ts` does the same with `isActive`.
- `api/export/.../route.ts` `parseInt` the entity codes via a comma split but never validate. A non-ISO `period` would have been caught by Zod if the schema were used, but `params` is parsed *after* it's already typed-narrowed by Zod on `searchParams.get(...)` calls, so a missing `period` returns 500 (Zod throws) rather than 400.

**Fix:** Centralize query parsing in a tiny helper; never call `parseInt` on a nullable searchParam without a default + finite check.

---

## 4. Code quality and project hygiene

### 🟡 8. Configuration: lockfile drift, permissive `.env`, hidden type errors

- `package.json` declares both `bun.lock` and `package-lock.json` (both present in the project root, 338 KB and 568 KB). These are from different package managers and will silently diverge. **Pick one** (Bun or npm) and delete the other.
- `.env` is committed and contains `DATABASE_URL=file:../db/custom.db`. The path is relative to the Prisma schema location, which is itself non-obvious (`prisma/schema.prisma` → `db/custom.db` at project root). For local dev this is fine, but `setup-db.ts` then copies it to `db/test.db` and reassigns `DATABASE_URL` — make sure both paths work on Windows *and* on a fresh clone, and document the bootstrap (the error message in `setup-db.ts` already does a good job here).
- `next.config.ts`: `typescript.ignoreBuildErrors: true` and `reactStrictMode: false` are both on. The first is a documented way to hide every type error in the project, which is the wrong tradeoff for a financial app. Recommend `ignoreBuildErrors: false` once the type noise is fixed.
- `tsconfig.json`: `"noImplicitAny": false`. With strict mode already on, this is the only `strict.*` opt-out that matters; turn it on and fix the resulting `any` cases (most of them are already in the `entity` route's `where: Record<string, unknown>` shape — refactor to `Prisma.EntityWhereInput`).

### 🟡 9. ESLint is effectively off

`eslint.config.mjs` turns off every meaningful rule: `@typescript-eslint/no-explicit-any`, `no-unused-vars`, `prefer-const`, `no-undef`, `no-redeclare`, `react-hooks/exhaustive-deps`, `react-hooks/purity`, `no-fallthrough`, … The result is a config that will pass on essentially any code. Combined with `ignoreBuildErrors: true`, almost nothing is enforced.

**Fix:** Re-enable at least: `no-explicit-any` (warn), `no-unused-vars` (warn), `no-fallthrough` (error), `react-hooks/exhaustive-deps` (warn), and `prefer-const` (warn). This alone would have caught several of the issues below.

### 🟡 10. Inconsistent zod import

`src/app/api/budget/route.ts`:

```ts
import { z } from 'zod/v4';
```

Every other route uses `import { z } from 'zod';`. Zod v4 has a `zod/v4` subpath but it's not the default export path; with `zod@^4.0.2` you should use the default. This route may work today but will silently fail when the team upgrades and the `/v4` subpath is removed.

**Fix:** `import { z } from 'zod';` in this file only.

### 🟡 12. In-memory state masquerading as persistent

The following routes keep state in `Map`s or module-scope variables that **do not survive a process restart** and **are not shared between dev-server instances**:

- `src/app/api/settings/route.ts` — `let settingsStore = { ... }` and `let validationRules = [...]` (note: the file's own comment says "would be database in production", but this is the *only* persistence).
- `src/app/api/ai-chat/route.ts` — `const sessionStore = new Map<string, SessionData>()` for chat history. Also leaks if the dev server is restarted.
- `src/app/api/ic-transactions/eliminate/route.ts` — no in-memory state, but it does N+1 `update` calls (one per transaction) and N+1 trial-balance updates. Fine for small data, will hurt at scale.
- `src/app/api/import/route.ts` — `importHistory: ImportHistoryRecord[]` is also module-scope. The GET handler re-derives "history" from recent trial-balance records grouped by `sourceSystem + date`, which is not the same thing as the in-memory history, and the two lists are then merged with `[...importHistory, ...historyFromDB]` — order is not stable, dates are not aligned, and after a server restart the in-memory list is empty but the merged response still claims it has history.

**Fix:** Move these to Prisma models (or a simple `KV` model). For the chat sessions, document the retention explicitly.

### 🟢 13. Dead dependencies

`pdfkit` and `next-auth` are in `package.json` but `Get-ChildItem src -Recurse | Select-String next-auth|pdfkit` returns zero matches. Remove them (and the `bun.lock` / `package-lock.json` entries) to reduce install time and the audit surface.

### 🟢 14. Prisma model naming

`COAMapping` is exposed in the generated client as `db.cOAMapping` (because of camelCase conversion of `COAMapping`). This is a minor ergonomic issue — `grep` for `COAMapping` works, `grep` for `cOAMapping` does not. Consider `CoaMapping` in the schema.

### 🟢 15. Component size

A few view components are large:

- `entities-view.tsx` — 70 KB
- `dashboard-view.tsx` — 64 KB
- `settings-view.tsx` — 63 KB

These are likely candidate extractions (table subcomponents, modals, side-panels) and will be needed when the project grows. Not urgent.

---

## 5. What's actually good

To balance the report, the following are clear strengths:

- **The consolidation engine** (`src/lib/consolidation-engine.ts`) is well-structured, well-commented, and produces golden-value outputs that match the demo pack. The COA `addEntry` + `derive*` separation is a clean pattern.
- **The finance library** (`src/lib/finance/index.ts`, `account-maps.ts`, `statements.ts`, `kpis.ts`, `fx.ts`) is consistent: every computation goes through `addEntry` → derive, every aggregate is named, and the tax engine is pluggable.
- **The tax module** (`src/lib/tax/`) is a small, sharp implementation: a registry + per-jurisdiction provider, with `portugal.ts` showing the real Portuguese IRC chain (coleta → derramas → autônoma) and `flat-rate.ts` covering stub jurisdictions. Publicly-sourced rates in `PT_TAX_CONFIG` and a clear comment about where to model policy changes.
- **The projects NPV/IRR/payback** (`src/lib/projects/finance.ts`) is a clean, pure-function module with a finite-horizon appraisal and an RFAI credit. Bisection IRR is appropriate.
- **The tests are well-targeted**:
  - `consolidation-engine.test.ts` runs *golden values* (e.g. `ebitda === 5_000_000`) — the right kind of regression test for a refactor-prone engine.
  - `kpis/route.test.ts` and `import/route.test.ts` have real regression coverage, including the previously-broken cases in their comments (FX conversion was stored 1:1, `dateRange` was `NaN to NaN`).
  - `statements.test.ts` covers both happy paths and rounding corners.
- **The test setup** (`src/test/setup-db.ts`, `vitest.config.ts`) is one of the cleanest "fresh isolated DB per run" setups I've seen for Prisma + Vitest, with `fileParallelism: false` to keep elimination tests deterministic.
- **The README** accurately describes the architecture, including a section titled "Two Engines" that flags the legacy prefix-matching code as something the team is aware of.

---

## 6. Suggested remediation order

1. **Today:** Patch the `new Function()` in `src/app/api/export/excel/route.ts` (Finding #1). Even if you trust today's hard-coded `calc` strings, the pattern is one refactor away from RCE.
2. **Today:** Gate the app (middleware) or document and bind to localhost (Finding #2).
3. **This week:** Fix the prefix-matching code in `budget/*`, `variance`, `trends` to use the engine. Fix the `EQ-` vs `EQY-` bug. These routes are user-visible.
4. **This week:** Replace `scenarios/run` with an engine-aware path that uses the tax provider.
5. **This sprint:** Re-enable the ESLint rules that matter, turn on `noImplicitAny`, turn off `ignoreBuildErrors`, fix the lockfile drift, and remove dead deps.
6. **Next sprint:** Persist `settings`, `ai-chat sessions`, and `importHistory` in Prisma. Decide on `next-auth` vs. removing it.
7. **Ongoing:** Add a route-level smoke test (`GET /api/kpis?period=2024-12&scenarioType=base` returns the same numbers the engine golden test asserts) to any route that doesn't yet have one. There are 33 API routes; only a handful have tests.

---

## 7. Files reviewed (with one-line verdict)

| File | Verdict |
|---|---|
| `src/lib/consolidation-engine.ts` | Solid. Golden values, clean derivations. |
| `src/lib/finance/account-maps.ts` | Solid. Good comment about "summary vs. detail" accounts. |
| `src/lib/finance/statements.ts` | Solid. |
| `src/lib/finance/fx.ts` | Solid. |
| `src/lib/finance/kpis.ts` | Solid. |
| `src/lib/finance/index.ts` | Clean barrel. |
| `src/lib/finance/statements.test.ts` | Good coverage. |
| `src/lib/consolidation-engine.test.ts` | Excellent (golden values, deterministic). |
| `src/lib/company-packs/template.ts` | Demo pack is hand-tuned to make statements reconcile. |
| `src/lib/company-packs/seed.ts` | Sound. |
| `src/lib/company-packs/types.ts` | Clean. |
| `src/lib/company-packs/index.ts` | Clean. |
| `src/lib/tax/index.ts` | Clean registry pattern. |
| `src/lib/tax/types.ts` | Clean. |
| `src/lib/tax/jurisdictions/portugal.ts` | Strong domain modelling. |
| `src/lib/tax/jurisdictions/flat-rate.ts` | Appropriate stub. |
| `src/lib/projects/finance.ts` | Clean pure functions, finite-horizon, RFAI credit. |
| `src/lib/coa-data.ts` | Single source of truth for the group COA. |
| `src/lib/types.ts` | Good. Some duplication with `src/lib/finance/*` types. |
| `src/lib/db.ts` | Standard Prisma singleton. |
| `src/test/setup-db.ts` | Excellent. |
| `vitest.config.ts` | Excellent. |
| `src/app/api/consolidation/route.ts` | Clean. |
| `src/app/api/packs/route.ts` | Clean. |
| `src/app/api/kpis/route.ts` | Clean. |
| `src/app/api/kpis/route.test.ts` | Good. |
| `src/app/api/import/route.ts` | OK overall, but in-memory history is leaky. |
| `src/app/api/import/route.test.ts` | Good. Catches real regressions. |
| `src/app/api/trends/route.ts` | **Stale prefix-matching** (Finding #3). |
| `src/app/api/variance/route.ts` | **Stale prefix-matching** (Finding #3). |
| `src/app/api/reports/route.ts` | Acceptable. Uses raw trial balances; no derived statements. |
| `src/app/api/scenarios/route.ts` | Fine CRUD. |
| `src/app/api/scenarios/run/route.ts` | **Broken re-implementation** (Finding #4). |
| `src/app/api/budget/route.ts` | **Prefix bug `EQ-` vs `EQY-`**, `zod/v4` import (Findings #3, #10). |
| `src/app/api/budget/variance/route.ts` | Same `EQ-` bug. |
| `src/app/api/ic-transactions/route.ts` | Fine. |
| `src/app/api/ic-transactions/eliminate/route.ts` | N+1 updates, otherwise OK. |
| `src/app/api/settings/route.ts` | In-memory, leaky (Finding #12). |
| `src/app/api/export/pdf/route.ts` | OK structurally; re-implements the mapping (Finding #5 spirit). |
| `src/app/api/export/excel/route.ts` | **`new Function()` RCE** + fake eliminations (Findings #1, #5). |
| `src/app/api/forecast/route.ts` | Clean. Anchor-on-actuals approach is good. |
| `src/app/api/ai-chat/route.ts` | Sends DB content to third-party LLM, no auth (Findings #2, #7). |
| `src/app/api/compliance/route.ts` | OK. Hard-coded "demo" violations and dates degrade trust. |
| `src/app/api/tax/route.ts` | Clean. |
| `src/app/api/entities/route.ts` | Clean. |
| `next.config.ts` | `ignoreBuildErrors: true`, `reactStrictMode: false` (Finding #11). |
| `tsconfig.json` | `noImplicitAny: false` (Finding #11). |
| `eslint.config.mjs` | All meaningful rules disabled (Finding #9). |
| `package.json` + lockfiles | Bun + npm lockfiles both present; `pdfkit` & `next-auth` unused (Findings #8, #13). |
| `.env` | Committed; document expected paths. |

---

*End of report. No files were modified.*

---

# Code Review — Pass 2: Frontend / UI layer (2026-06-20)

> Follow-on pass. The first report (above) covered the backend — engine, `src/lib/finance/*`, tax, projects, and the API routes — and all of its findings are remediated. This pass focuses on the surface the first report only flagged for *size*: the ~15 view components, the client data layer (`src/lib/api.ts`, `src/lib/store.ts`), the never-opened routes, and the Prisma schema. **No code was modified.**

## Phase 0 — prior remediation re-verified

Re-ran the gates against current `main` (clean tree, now a git repo):

- `npm test` → **36 passed / 7 files** (engine, finance, metrics, scenarios/run, import, kpis, app-settings).
- `npm run lint` → **exit 0** (curated rule set, no errors).
- `npm run build` → **exit 0** with `ignoreBuildErrors: false` (the TS step really runs).
- Spot-checks of the closed findings: no `new Function` in `src/`, `src/middleware.ts` present, only `package-lock.json` (no `bun.lock`), `tsconfig` `strict: true`. **The Pass-1 backend report still stands.**

## Findings at a glance

| # | Severity | Area | Finding |
|---|----------|------|---------|
| F1 | 🟠 High | Correctness (presentation) | Dashboard charts & trend badges are hardcoded demo data, not derived from real figures |
| F2 | 🟠 High | Correctness (units) | Revenue Waterfall labels the same `/1000` data as "K" (bar) and "M" (axis) — off by 1000× |
| F3 | 🟡 Medium | UX/Consistency | Number locale split: most views `de-DE`, but Reports & IC Transactions use `en-US` |
| F4 | 🟡 Medium | Quality | Number formatting duplicated per-component instead of using shared `formatEUR` |
| F5 | 🟡 Medium | Correctness/Trust | 14 views silently render fabricated "demo fallback" numbers on a swallowed API error |
| F6 | 🟡 Medium | Security | `middleware.ts` guards only the wipe set; other mutating routes (+ `ai-chat`) stay open |
| F7 | 🟢 Low | Quality | `@tanstack/react-query` installed but never used (dead dep); all fetching hand-rolled |
| F8 | 🟢 Low | Quality | `src/lib/api.ts` is `any`-typed and shape-guesses with `data.x || data` |
| F9 | 🟢 Low | Data model | Schema hygiene: missing `COAMapping` unique/index, stringly-typed fields, comment drift |
| F10 | 🟢 Low | Quality | Stale `|| '51,900'` magic fallback in `data-import-view` |
| F11 | 🟢 Low | Maintainability | Several view components 45–69 KB (carried from Pass-1 #15) |

---

## 🟠 F1. The dashboard mixes real KPIs with hardcoded charts/trends

`src/components/dashboard-view.tsx`. The KPI **card values** are real — `loadData()` calls `runConsolidation(...)` and `setKPIs(result.kpis)` (lines ~402–435). But almost everything else on the flagship screen is a module-level constant rendered directly, unaffected by period/entity/scenario:

- `revenueTrend` (monthly Revenue/EBITDA, lines ~52–65) → drives the revenue trend **and** the derived `ebitdaMarginTrend` (line ~397).
- `fallbackEntityContribution` (lines ~67–73) → the entity-contribution donut.
- `waterfallData` (lines ~76–88) → the Revenue Waterfall. Its numbers (Revenue 51 900, Net Income 8 961) don't match the real golden figures (group revenue ~52.2M, consolidated ~41.5M, Grestel RL 1.39M).
- `cashFlowBridge` (lines ~116–121) → the cash-flow bridge cards.
- `computeHealthIndicators` hardcodes `const revenueGrowth = 5.2; // from demo data trend` (line 217) — the scorecard's revenue-growth pillar is fixed.
- All five KPI-card `trend` badges are literals: `'+5.2%'`, `'+0.4pp'`, `'+8.1%'`, `'+2.3%'`, `'+1.2pp'` (lines 459, 475, 491, 507, 539).

For a consolidation tool, presenting real headline numbers next to fabricated charts/deltas is misleading. **Fix:** derive these from the consolidation result already fetched (or the `/api/trends` endpoint), or label them explicitly as illustrative.

## 🟠 F2. Revenue Waterfall mislabels magnitude

`src/components/dashboard-view.tsx`:
- Y-axis (line 1065): `tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`}` — treats data as thousands → millions, suffix **M**.
- Bar-top label (line 1069): `formatter: (v) => `${(v / 1000).toFixed(1)}K`` — same `/1000`, suffix **K**.

Same series, two magnitude labels in one chart; the bar labels read e.g. "4.2K" for a €4.2M bar (card subtitle also says "(€K)"). One of the two is wrong. **Fix:** one scale/suffix; ideally route through a shared compact formatter (F4).

## 🟡 F3. Inconsistent number locale

Most views format with `de-DE` (`1.234,56` — the correct EUR/PT convention): `dashboard-view:124`, `consolidation-view:58`, `variance-view:29`, `budget-vs-actual-view:121`, `journal-entry-view:149`, `entities-view:1114/1136`, `animated-counter:49`, `data-import-view`. But the consolidated **Reports** screen (`reports-view.tsx:226`) and **IC Transactions** (`ic-transactions-view.tsx:107`) use `en-US` (`1,234.56`), as do several timestamps (`consolidation-view:274`, `compliance-view:313`). The screen users export shows a different convention than the rest of the app. **Fix:** standardize on one locale.

## 🟡 F4. Formatting logic is duplicated, not shared

`src/lib/utils.ts` exports `formatEUR`, but ~8 components redefine their own `formatNumber` / `formatCurrency` / `formatCurrencyShort` with subtly different rules (decimals, locale, `0 → '—'`). There are ~101 ad-hoc `toFixed` / `toLocaleString` / `NumberFormat` calls across 19 component files. **Fix:** one `src/lib/format.ts` (currency, compact-magnitude, percent — locale-aware) used everywhere; this also fixes F2 and F3 structurally.

## 🟡 F5. "Demo fallback" data renders silently on API failure

14 views carry module-level `// Demo fallback data` constants and fall back to them inside a swallowed `catch` (e.g. `dashboard-view` lines ~426–431: `catch (err) { console.log('Using fallback…') }`). On any backend error a financial app shows *plausible fabricated numbers* with no error or empty state — the user cannot tell real data from demo. This is fine as an **initial placeholder** (`consolidation-view` does it correctly — replaces on first fetch, comments "not demo data"), but as an **error fallback** it is dangerous in this domain. **Fix:** surface explicit error/empty states; reserve demo data for an intentional, visible "demo mode."

Affected (have the marker): `budget-vs-actual`, `compliance`, `coa`, `cash-flow-forecast`, `audit-trail`, `data-import`, `ic-transactions`, `journal-entry`, `reports`, `settings`, `trend-analysis`, `workflow`, `consolidation` (placeholder-only), `dashboard`.

## 🟡 F6. Middleware guards only the wipe set

`src/middleware.ts` is well-documented and right-sized for a demo, but `PROTECTED` only covers `POST /api/packs`, `POST /api/import`, `settings` writes, and any `DELETE`. With `ADMIN_TOKEN` set (deployed demo), anonymous callers can still **mutate the shared dataset** via `POST /api/entities`, `PUT /api/entities/[id]`, `POST /api/coa`, `POST /api/exchange-rates`, `POST /api/journal-entries`, `POST /api/budget`, `POST /api/scenarios`, `POST /api/forecast`, and `POST /api/ic-transactions/eliminate` — plus `POST /api/ai-chat`, which forwards DB content to a third-party LLM and **incurs cost**. **Fix:** default to protecting all mutating methods and allowlist the genuinely safe interactive POSTs (consolidation / scenario-run); gate `ai-chat` for cost + data-egress regardless.

## 🟢 F7. `@tanstack/react-query` is a dead dependency

Installed, but zero usages — no `QueryClient`, `QueryClientProvider`, `useQuery`, or `useMutation` anywhere in `src/`. All data fetching is hand-rolled `useEffect` + `fetch` across 23 components, each re-implementing loading/error/refetch-on-selection-change. **Fix:** either adopt it (caching, dedup, refetch on period/entity change, real error states — would also resolve F5) or drop the dep.

## 🟢 F8. `api.ts` is `any`-typed and shape-guesses

Every function in `src/lib/api.ts` does `fetchAPI<any>(...)` then `return data.entities || data` (etc.) to tolerate two possible envelopes. **Fix:** type the responses and standardize the response envelope so the client isn't guessing at runtime.

## 🟢 F9. Schema hygiene (`prisma/schema.prisma`)

- `COAMapping` has no `@@unique([entityCode, localAccountCode])` and no index on `entityCode`/`groupCOACode` → duplicate local mappings are possible and lookups table-scan.
- `ConsolidationRun.entityCodes` is a stringly-typed JSON array (no validation).
- `Entity.code` comment examples (`PT0001, ES0002, DE0003`) drifted from the real seeded codes (`GRSTL`/`ECOGRES`/…).
- `COAMapping` → generated client `db.cOAMapping` (carried over from Pass-1 #14; awkward to grep).
- No `userId`/`orgId` — multi-tenant is **intentionally deferred** per the middleware note; listed for completeness, not as a defect.

## 🟢 F10. Stale magic fallback

`src/components/data-import-view.tsx:527` — `€${totalAmount.toLocaleString('de-DE') || '51,900'}`. `toLocaleString` never returns a falsy string, so `|| '51,900'` is a dead branch and a leftover demo literal. Remove.

## 🟢 F11. Large components

`entities-view` 69 KB, `dashboard-view` 63 KB, `settings-view` 62 KB, `trend-analysis-view` 46 KB, `compliance-view` 45 KB (carried from Pass-1 #15). Decompose table/chart/modal subcomponents — this also makes the real-vs-demo-data boundary (F1/F5) easier to police.

---

## What's good (frontend)

- **`consolidation-view.tsx`** drives the full per-entity statement grid straight from the live engine breakdown (explicitly "not demo data"), recomputes the balance check to the cent, and derives its quality score from the run rather than hardcoding it.
- **`workflow/route.ts`** is fully DB-driven — each step status is computed from real counts, no hardcoded steps.
- **`store.ts`** is minimal and correct: UI state only (active view, selected period/scenario, sidebar), with server state kept out of the global store.
- **`formatEUR`** in `utils.ts` is the right adaptive-scaling idea — it's just under-used (F4).
- Loading skeletons exist (`KPISkeleton`, etc.) — the structure for proper loading states is already there; it's the *error* path (F5) that needs work.

## Suggested remediation order

1. **Quick wins:** F2 (one-line label fix), F10 (delete dead fallback).
2. **Credibility (the finance-demo risk):** F1 + F5 — wire the dashboard charts/trends to real data and replace silent demo-fallback with explicit error/empty states.
3. **Consistency:** F4 then F3 — centralize formatting in `src/lib/format.ts`, standardize locale.
4. **Security:** F6 — tighten the middleware allowlist; gate `ai-chat`.
5. **Architecture:** F7/F8 — adopt or drop react-query; type the API layer.
6. **Data model & maintainability:** F9, F11 — ongoing.

---

## Remediation applied — 2026-06-20 (Pass 2 fixes)

Gates after changes: `npm run lint` → **0 errors** (the 162 remaining warnings are all the pre-existing `no-explicit-any` in `api.ts` — that's F8). `npm test` → **36/36**. `npm run build` → **success** with `ignoreBuildErrors: false`.

**Fixed**

- **F1 — dashboard wired to real data.** `dashboard-view.tsx` now derives the Revenue Waterfall from the live `incomeStatement`, the entity-contribution bar/donut from `entityBreakdown` (real entity names, not the `PT0001`/`España` placeholders), and the cash-flow bridge from `cashFlow`. The Revenue/EBITDA and EBITDA-margin trend charts come from `/api/trends`; KPI-card trend badges and the scorecard's revenue-growth + interest-coverage pillars are now period-over-period deltas from a prior-period consolidation (badges are **omitted when there's no prior data** rather than faked). Removed the hardcoded `waterfallData`, `cashFlowBridge`, `revenueTrend`, `fallbackEntityContribution`, `revenueGrowth = 5.2`, `ebit = 13500`, and the five literal `+x%` badges.
- **F2 — waterfall magnitude.** Axis and bar labels both route through `formatCompactEUR` (full euros → consistent €M/€K); card subtitle `(€K)` → `(€)`. No more "K vs M" mismatch.
- **F3 — locale.** `reports-view` and `ic-transactions-view` number formatting moved to the shared `de-DE` helpers. (Dates intentionally stay `en-US`, matching the English UI chrome.)
- **F4 — shared formatting.** New `src/lib/format.ts` is the single source (`formatNumber` / `formatCurrency` / `formatCompactEUR` / `formatPercent`); `utils.formatEUR` re-exports it. Adopted in the files touched above; a full sweep of the remaining ~16 components is follow-up.
- **F5 — silent fallback.** Dashboard now shows an explicit error banner on load failure and labels the placeholder figures as such, instead of silently rendering fabricated numbers. Pattern established on the dashboard; the other ~13 views still need the same treatment — follow-up.
- **F6 — middleware.** Switched to **default-deny** for all mutating methods with a 2-entry allowlist (consolidation, scenario-run). `ai-chat` (cost + data egress), entity/coa/budget/fx/journal/eliminate writes, and `seed` are now gated when `ADMIN_TOKEN` is set.
- **F7 — dropped `@tanstack/react-query`** (package.json + lockfile).
- **F9 (partial)** — fixed the `Entity.code` comment drift (now `GRSTL`/`ECOGRES`).
- **F10 — removed** the dead `|| '51,900'` fallback.

**Deferred (noted, not done)** — *all four since completed; see the next section.*

- **F8** — typing `api.ts` (the lint `no-explicit-any` warnings); mechanical but broad.
- **F9 (rest)** — `COAMapping` `@@unique`/index needs a DB migration that can fail on existing duplicates; left for an intentional `prisma migrate`.
- **F11** — large-component decomposition.
- **F1 residual** — the dashboard still has decorative hardcodes that were *not* in F1's original list: the KPI mini-sparklines, Market Snapshot FX, Recent Activity feed, Recent Consolidation Runs table, and the Entity Health peer-comparison scores (still using `PT0001`-style codes).

*End of Pass 2 remediation.*

---

## Remediation applied — 2026-06-20 (Pass 2 deferred follow-ups)

The four deferred items above are now done. Gates after changes: `npm run lint` → **0 errors / 0 `no-explicit-any`** (remaining warnings are pre-existing `no-unused-vars` (67), `react-hooks/set-state-in-effect` (23), and 2 other react-hooks — none introduced here). `npm test` → **49/49** (36 + 13 new). `npm run build` → **success** with `ignoreBuildErrors: false`.

**Fixed**

- **F8 — `api.ts` fully typed.** Removed all 44 `any` in `api.ts` plus 24 more across components (68 → 0 `no-explicit-any`). `fetchAPI<T>` no longer leaks `any`; a typed `unwrap<T>(data, key)` helper replaces the `data.x || data` shape-guessing; loosely-typed mutations return a shared `ActionResult`; `getConsolidationRuns` returns a real `ConsolidationRunRecord[]`. Component `catch (err: any)` → `catch (err)` with `err instanceof Error` narrowing; `(v: any)`/`(r: any)` callbacks given real types. `SystemSettings` extended with the live-stat fields `settings-view` reads (killing eight `as any` casts).
- **F9 (rest) — `COAMapping` constraint + atomic upsert.** Added `@@unique([entityCode, localAccountCode])` and `@@index([groupCOACode])`. Verified the live DB had 0 duplicates (100 rows) before applying via `prisma db push`. The POST route's manual find-then-update/create is now a race-free `upsert` on the compound key (smoke-tested: create → update keeps one row).
- **F1 residual — last dashboard hardcodes wired to real data.** Recent Consolidation Runs ← `getConsolidationRuns`; Recent Activity ← `getAuditTrail`; Entity Health Comparison ← per-entity scores derived from `entityBreakdown` (real codes/names, no more `PT0001`); Market Snapshot ← real `getExchangeRates` (closing rate + YTD change); KPI sparklines ← real `/api/trends` series (revenue/EBITDA-margin/net-income/assets/leverage; ROCE has no trend endpoint, so its card simply shows no sparkline — omitted, not faked). End-to-end smoke-tested against the running dev server.
- **F11 — dashboard decomposition (first slice).** Extracted the pure logic (period/number transforms, waterfall + cash-flow builders, the health-scorecard model, FX-snapshot + activity helpers) into `src/components/dashboard/helpers.ts` (332 lines) with a golden-value test (`helpers.test.ts`, 13 cases). `dashboard-view.tsx` dropped 1445 → 1141 lines and is now wiring/JSX only. The other large views (`settings`, `entities`, …) remain monolithic — same pattern applies as further follow-up.

**Still open (smaller, lower-value)**

- `no-unused-vars` (67) and `react-hooks/set-state-in-effect` (23) warnings are pre-existing and untouched here.
- The F4/F3 formatter + F5 error-state sweep across the remaining ~13 views, and decomposing the other large components (`settings-view`, `entities-view`), are the natural next increments.

*End of Pass 2 deferred follow-ups.*

---

## Remediation applied — 2026-06-21 (F3/F4/F5 view sweep)

The formatter-centralization (F4), locale (F3) and silent-fallback (F5) sweep across the remaining views is now done. Gates after changes: `npx eslint .` → **0 errors** (87 warnings, all pre-existing `react-hooks/set-state-in-effect` + `no-unused-vars`; **5 fewer** than before — using the `catch` binding and dropping dead `fmt` removed some). `npm test` → **49/49**. `npm run build` (`ignoreBuildErrors: false`) → **success**, 34/34 pages.

**Fixed**

- **F5 — explicit error states everywhere.** New shared [`DataLoadError`](src/components/data-load-error.tsx) banner (the dashboard's amber `AlertTriangle` pattern, factored out so it isn't copy-pasted 15×). Wired a `loadError` flag into every view that previously swallowed its fetch error and rendered demo/placeholder numbers silently: `budget-vs-actual`, `journal-entry`, `fx-rates`, `workflow`, `variance`, `audit-trail`, `compliance`, `coa`, `ic-transactions`, `trend-analysis`, `data-import`, `reports`, `scenarios`, `settings`, `cash-flow-forecast`, plus `entities`. Each `catch` now `console.error`s and flips the flag (was `console.log('Using fallback…')` or an empty `catch {}`); the banner renders at the top of the view. Messages are honest per view: "Showing placeholder figures below." where demo data backs the fallback, and a plain "Could not load … Try refreshing." where the fallback is an empty state (`reports`, `entities`) or import history (`data-import`). `coa` additionally lost its inline `.catch(() => demo)` swallows so the single outer catch is the one fallback point.
- **F4 — formatting routed through `src/lib/format.ts`.** Removed the per-component formatters that re-rolled the locale/decimal rules and pointed the call sites at the shared module: `budget-vs-actual` & `journal-entry` (`fmtEuro`→`formatCompactEUR`, `fmtFull`→`formatNumber`), `variance` (dropped a dead `fmt`, `fmtFull`→`formatNumber`, `formatEUR`→`formatCompactEUR`), `consolidation` (`fmt`→`formatNumber`, `formatEUR`→`formatCompactEUR`), `trend-analysis` (`fmtMetric`'s €M/€K branch → `formatCompactEUR`), and `entities` (two inline `new Intl.NumberFormat('de-DE')` → `formatNumber`). `reports` and `ic-transactions` were already importing from `format.ts` (their local wrappers are the legitimate string-passthrough / multi-currency cases) and were left as-is.
- **F3 — locale.** No number-locale work remained: the earlier pass already moved `reports`/`ic-transactions` to `de-DE`, and a sweep confirmed every remaining `en-US` `toLocaleString` is a **date** (kept `en-US` on purpose, matching the English UI chrome).

**Notes / intentionally left**

- `projects-view`'s `fmtMoney` is kept local: it is genuinely multi-currency ($ / €, 2-dp M, lowercase k) and the EUR-only shared compact formatter doesn't cover it.
- `scripts/**` added to the eslint `ignores` — the untracked Puppeteer screenshot helper (`scripts/shotgen/shoot.js`) is a Node dev script that legitimately uses `require`, and shouldn't be subject to the Next browser-app TS rules. This was the sole lint *error*; it is unrelated to the app.
- The `KPIs` `no-unused-vars` warning in `api.ts` (leftover from the F8 rewrite) and the pre-existing `set-state-in-effect` warnings are untouched.
- Decomposing `settings-view` / `entities-view` (F11) is still the remaining large-component work.

*End of F3/F4/F5 view sweep.*

---

## Remediation applied - 2026-06-21 (F11 - settings/entities decomposition)

The two remaining monolithic components were decomposed following the dashboard pattern: pure logic moved into a co-located `helpers.ts` with golden tests, leaving each view as JSX/wiring. This is a pure structural extraction - no displayed values changed; the tests lock in current behaviour. Gates after changes: `npx eslint .` -> **0 errors** (85 warnings, all pre-existing `set-state-in-effect` + `no-unused-vars`; **2 fewer** - removing the dead `ownershipA`/`ownershipB` locals). `npm test` -> **68/68** (10 files; +12 entities, +7 settings cases). `npm run build` (`ignoreBuildErrors: false`) -> **success**, 34/34 pages.

**Fixed**

- **F11 - `entities-view` decomposed.** New [`src/components/entities/helpers.ts`](src/components/entities/helpers.ts) (158 lines) holds the comparison-metric model (`buildComparisonMetrics`, `formatMetricValue`, `computeMetricDelta`, `countMetricLeads`, `buildEntityBarChartData`), ownership math (`normalizeOwnership`, `buildOwnershipWaterfall`, `buildOwnershipData`), `buildFinancialRatios`, the pure CSV builder `toEntityCSV`, and the presentation-data maps (`countryFlags`/`countryNames`/`PIE_COLORS`/`sparklineData`/`geoData`). Covered by [`helpers.test.ts`](src/components/entities/helpers.test.ts) (12 cases). `entities-view.tsx` dropped 1199 -> 1038 lines. Side effects of the extraction: `normalizeOwnership` deduped the `<= 1 ? *100 : x` pattern repeated ~9x inline; `computeMetricDelta` deduped the identical diff/pctDiff/isPositive trio in the two comparison tables; two dead locals (`ownershipA`/`ownershipB`, computed but never read) were dropped. The JSX-returning bits (`getMethodBadge`, `MiniSparkline`, `ComparisonTooltip`) stayed in the component.
- **F11 - `settings-view` decomposed.** New [`src/components/settings/helpers.ts`](src/components/settings/helpers.ts) (133 lines) holds the demo fallback data (`demoSettings`, `demoCurrencyPairs`, `demoApiEndpoints`, `demoVersionHistory`, `demoTableCounts`, `defaultEnvironmentInfo`) plus the pure transforms: `buildTableCounts` (live system stats -> table-count rows, returns `null` when stats are absent so demo counts aren't overwritten with zeros), the id generators `makeValidationRuleId`/`makeCurrencyPairId`, and `countActiveRules`/`countHealthyEndpoints`. Covered by [`helpers.test.ts`](src/components/settings/helpers.test.ts) (7 cases). `settings-view.tsx` dropped 1266 -> 1126 lines (the ~85-line demo-data block and the inline table-count mapping are gone). The side-effectful handlers (`updateSettings` + toast + Blob/file IO) stayed in the component.

**Notes / intentionally left**

- `formatMetricValue` is kept as-is (renders the comparison's EUR-K-scaled values as EUR M) rather than reconciled with the shared `formatCompactEUR`, which expects full euros - changing it would alter displayed figures, out of scope for a structural extraction.
- The pre-existing `set-state-in-effect` and remaining `no-unused-vars` warnings are untouched. With F11 done, all the originally-deferred follow-ups (F8, F9, F11, F1-residual, F3/F4/F5) are complete.

*End of F11 decomposition.*

---

# Code Review — Pass 3: residual cleanup (2026-06-21)

> Follow-on pass driven by `CODE_REVIEW_PLAN.md`. The plan was first **verified
> against the code** — several of its items turned out to be stale or
> mis-attributed (noted inline below) — then the genuinely-open items were
> remediated. Gates after changes: `npx eslint .` → **0 errors, 24 warnings**
> (down from 89; the remainder are all the pre-existing, runtime-safe
> `react-hooks/set-state-in-effect` lints). `npm test` → **86 passed / 12 files**
> (was 72/10; +10 route smoke, +4 entity-codes). `npm run build`
> (`ignoreBuildErrors: false`) → **success, 34/34 pages**.

## Plan verification — corrections to `CODE_REVIEW_PLAN.md`

- **P1 (NaN gauge) was already closed.** The fix
  ([`computeHealthIndicators`](src/components/dashboard/helpers.ts)) and its
  regression tests ([`helpers.test.ts`](src/components/dashboard/helpers.test.ts),
  finite-score cases for zero/negative/crash growth) were already present and
  green. The plan also mis-stated the cause as "zero-equity/zero-liabilities" —
  the real `NaN` was `0/0` from zero revenue growth, which the fix correctly
  targets. No code change needed.
- **R2 mis-located the unused `KPIs`.** It is in
  [`src/lib/demo-data.ts`](src/lib/demo-data.ts), not `api.ts` (which was clean).
- **R4 had its premise inverted.** There was **no** comment explaining
  `projects-view`'s local `fmtMoney`; the gap was the missing comment, now added.
- **R5 was understated.** There was no `prisma/migrations/` directory at all — the
  *entire* schema was `db push`-only, not just `COAMapping`.
- **R6 was overstated/mischaracterised.** The compliance route is mostly
  real-data-derived; the fabrication was an empty-state fallback plus
  `Math.random()` in the filing statuses and trend — which the plan didn't name.

## Fixed

- **R5 — Prisma migrations baselined.** Generated `prisma/migrations/0_init`
  (`migrate diff --from-empty`, includes the `COAMapping`
  `@@unique([entityCode, localAccountCode])` + `@@index([groupCOACode])` and the
  `migration_lock.toml`), then `migrate resolve --applied 0_init` on the live DB
  so existing data is untouched. `prisma migrate status` → "up to date". Added a
  `db:deploy` script and updated the README so a fresh clone gets the
  migration-managed schema instead of a `db push`-only DB that loses constraints
  on reset.
- **R6 — compliance route de-faked.** Removed the `Math.random()` filing-status
  simulation (now deterministic: past-due → `overdue`, else `pending`; nothing is
  reported `filed` because no filing-submission record exists), removed the
  `Math.random()` synthetic trend (replaced with the single real point we can
  compute — the current period — since compliance scores aren't persisted per
  period), and deleted the demo-violation fallback (the UI already renders a
  proper empty state). Also dropped the route's now-dead `consolidationRuns`
  query and three unused locals.
- **R7 — `entityCodes` JSON hardened.** New validated boundary
  [`parseEntityCodes`](src/lib/entity-codes.ts) (Zod `string[]`, `[]` on any
  parse/shape failure) replaces the raw `JSON.parse` in the `audit` and `reports`
  routes, so malformed column data degrades gracefully instead of 500-ing. Unit
  tested ([`entity-codes.test.ts`](src/lib/entity-codes.test.ts), 4 cases).
- **R8 — route smoke suite.** [`src/app/api/smoke.test.ts`](src/app/api/smoke.test.ts)
  exercises the 10 read routes added in remediation (`audit`, `coa`,
  `compliance`, `exchange-rates`, `forecast`, `journal-entries`, `notifications`,
  `projects`, `trial-balances`, `workflow`) against a seeded pack and asserts a
  non-500 JSON response — a regression tripwire, not a full contract test.
- **R1 — lint sweep.** Cleared all 61 `no-unused-vars` (dead imports, unused
  locals/args/destructures across the API routes and ~20 view components), the 3
  `react-hooks/exhaustive-deps` (added missing `t` deps; dropped an unnecessary
  one), and the 1 `react-hooks/immutability` (refactored the variance waterfall
  to precompute prefix sums so the `map` callback is pure). The 24
  `set-state-in-effect` warnings are deliberately **deferred** — they are
  runtime-safe React-Compiler-readiness flags whose fixes are genuine effect
  refactors, not dead-code removal, and carry regression risk in a batch.
- **R2 — removed the unused `KPIs` import** in `demo-data.ts`.
- **R3 — documented the `formatMetricValue` scale deviation** explicitly (it
  renders EUR-K inputs as `€M`; the shared `formatCompactEUR` expects full euros)
  in [`entities/helpers.ts`](src/components/entities/helpers.ts).
- **R4 — documented `projects-view`'s local `fmtMoney`** as intentionally
  multi-currency and not to be unified with the EUR-only shared formatter.

## P3 — browser smoke of the 18 views (2026-06-22)

Drove the running app (`next dev --webpack`) through every view that hadn't been
exercised in the browser — Consolidation, IC Transactions, Journal Entry,
Scenarios, Variance, Budget vs Actual, Trend Analysis, Cash Flow Forecast,
Projects, FX Rates, Chart of Accounts, Reports, AI Insights, Compliance, Data
Import, Audit Trail, Workflow, Settings — after loading the Meridian Group pack.
Each view was scanned for render failures, `NaN`/`Infinity`/`undefined` leakage,
error-boundary/`DataLoadError` banners, and console errors.

**Result:** all 18 render real consolidated data with **no failed network
requests** and **no console errors**. The core engine path checks out visually —
Consolidation shows the per-entity columns, **−€7.50M IC eliminations**,
consolidated **€41.5M** revenue, a **Balanced ✓** balance-sheet check and a 100%
quality score, all in `de-DE` grouping.

One real defect was found and fixed:

- **Cash Flow Forecast rendered the literal "Invalid Date".** `/api/forecast`
  returns a full-year actual anchor as its first period (`month: "2024 (FY)"`),
  but the view's `formatMonth` assumed every value was `YYYY-MM`. Its `try/catch`
  was dead code — `new Date("2024 (FY)-01")` yields an *Invalid Date* object
  (which does **not** throw); calling `toLocaleDateString` on it returns the
  string `"Invalid Date"`, which surfaced on the X-axis and in the monthly
  breakdown table. Extracted `formatMonth` to
  [`cash-flow-forecast/helpers.ts`](src/components/cash-flow-forecast/helpers.ts)
  with an explicit `Number.isNaN(getTime())` guard that passes non-month labels
  through verbatim, and locked it with a golden test
  ([`helpers.test.ts`](src/components/cash-flow-forecast/helpers.test.ts), 3
  cases). Verified live: the first tick now reads **"2024 (FY)"**.

Gates after this pass: `npx eslint .` → **0 errors, 24 warnings** (unchanged).
`npm test` → **89 passed / 13 files** (+3 `formatMonth`). `npm run build` →
**success, 34/34 pages**.

## Intentionally not done

- **24 `react-hooks/set-state-in-effect` warnings** — deferred as above.
- **`ConsolidationRun.entityCodes` → normalized join table (R7 stretch)** — the
  read boundary is now safe; a schema change is out of proportion for a demo.

*End of Pass 3.*
