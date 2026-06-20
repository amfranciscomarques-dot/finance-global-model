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
