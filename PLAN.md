# Action Plan

Derived from running the app (Dashboard + Entities) on 2026-06-21. Ranked by
impact on a financial consolidation tool, where numeric correctness is the
core value.

> **Status (2026-06-22):** P1 ✅ done · P2 ✅ done · P3 ✅ done (API route smoke
> tests + browser smoke of all 18 views complete; one bug found & fixed). See the
> per-item resolution notes below and the Pass-3 section in `CODE_REVIEW.md`.

---

## P1 — Fix the `NaN` health gauge (correctness) — ✅ DONE

**Symptom:** The dashboard "Overall Group Health" gauge renders `NaN OUT OF 100`
instead of a numeric score (Meridian Group, Dec 2024, Base Case).

**Why it matters:** It sits on the headline KPI of the main dashboard — the first
thing a user sees. A `NaN` where a score belongs undermines trust in every other
figure on the page. The root cause is an unguarded divide-by-zero in the ratio
math, which could be silently skewing other KPIs too.

**Root-cause trace:**
- `src/components/dashboard-view.tsx:319` — `overallScore = computeOverallScore(healthIndicators)`,
  rendered at `dashboard-view.tsx:768` via `<AnimatedCounter value={overallScore} />`.
- `src/components/dashboard/helpers.ts:245` — `computeOverallScore` sums
  `ind.score * ind.weight` with an initial value of `0`, so an empty array yields
  `0`. The `NaN` therefore comes from one indicator's `score` being `NaN`.
- `computeHealthIndicators` (`helpers.ts:~150–242`) derives scores from
  `kpis.leverage`, `kpis.liquidityRatio`, `kpis.roe`, `kpis.ebitdaMargin`, etc.
  One KPI is `NaN` with live data — most likely a divide-by-zero (e.g. equity = 0
  for ROE/leverage, or current liabilities = 0 for liquidity). Interest coverage
  at `helpers.ts:170` already guards its divisor; the others do not.

**Fix:**
1. Identify which KPI is `NaN` for the live dataset.
2. Guard the ratio computations (and/or clamp scores) so the gauge always shows a
   finite 0–100 value.
3. Add a regression test feeding the failing KPI shape (e.g. zero equity / zero
   liabilities) and asserting a finite score. The existing test
   `src/components/dashboard/helpers.test.ts:92–94` only checks bounds with
   synthetic data and misses this.

**Verify:** Reload the dashboard under `--webpack`; gauge shows a number.
Run `npm test`.

**Resolution:** The root cause was `revenueGrowth` of exactly `0` (earliest
period, no prior to compare) computing `0 / 0 = NaN` in the revenue-growth pillar
— not zero equity/liabilities. Guarded in
[`computeHealthIndicators`](src/components/dashboard/helpers.ts) (the `> 0`
branch now floors at a finite 30) and locked in by regression tests in
[`helpers.test.ts`](src/components/dashboard/helpers.test.ts) that assert
`Number.isFinite` for zero, negative, and crash-level growth. `npm test` green.

---

## P2 — Make `npm run dev` work out of the box (setup footgun) — ✅ DONE

**Symptom:** The default `npm run dev` (Next.js 16 → Turbopack) panics on Windows
while compiling `src/app/globals.css` through PostCSS — a child node process fails
to init (`exit 0xc0000142`) and `GET /` returns 500. Only `next dev --webpack`
runs the app.

**Why it matters:** The documented/default command is broken for the next person
on this machine. It's environmental and has a workaround, so it ranks below P1.

**Fix (cheapest durable option):** Point the `dev` script at the webpack bundler
in `package.json:6`:

```diff
-    "dev": "next dev -p 3000",
+    "dev": "next dev -p 3000 --webpack",
```

(Already mirrored in `.claude/launch.json` for the Preview MCP.)

**Alternative:** Try a Next.js patch bump to see if Turbopack is fixed upstream,
then revert to Turbopack for faster dev builds.

**Verify:** `npm run dev` → `GET /` returns 200.

**Resolution:** `package.json` `dev` script already points at `--webpack`
(mirrored in `.claude/launch.json`).

---

## P3 — Smoke-test the remaining views (coverage) — ✅ DONE

**Status:** Only Dashboard + Entities have been exercised. Unverified:
Consolidation, IC Transactions, Journal Entry, Scenarios, Variance, Budget vs
Actual, Trend Analysis, Cash Flow Forecast, Projects, FX Rates, Chart of
Accounts, Reports, AI Insights, Compliance, Data Import, Audit Trail, Workflow,
Settings.

**Fix:** Navigate each view via the browser agent, screenshot, and check for
render errors / `NaN` / empty states. Prioritize the consolidation engine path
(Run Consolidation → Reports) since it produces the numbers everything else
depends on.

**Verify:** Each view renders real data without console errors.

**Resolution:** Two layers.

1. **API-route smoke suite** ([`src/app/api/smoke.test.ts`](src/app/api/smoke.test.ts))
   exercises the 10 read routes added during remediation against a seeded DB and
   asserts a non-500 JSON response — a code-level tripwire for the routes the
   views consume.
2. **Browser smoke (2026-06-22).** Drove the running app through all 18 views
   after loading the Meridian pack, scanning each for render failures,
   `NaN`/`Infinity`/`undefined`, error banners and console errors. All 18 render
   real data with no failed network requests and no console errors; the
   Consolidation path verified visually (−€7.50M IC eliminations, €41.5M
   consolidated, Balanced ✓). One defect found & fixed: the Cash Flow Forecast
   X-axis/table showed a literal **"Invalid Date"** for the full-year anchor
   period (`"2024 (FY)"`) because `formatMonth` assumed `YYYY-MM` and its
   `try/catch` couldn't catch a non-throwing Invalid Date. Fixed + golden-tested
   in [`cash-flow-forecast/helpers.ts`](src/components/cash-flow-forecast/helpers.ts).
   See the Pass-3 P3 section of `CODE_REVIEW.md`.

---

## Recommended order

1. **P1** — fix the `NaN` and add the regression test.
2. **P2** — fold in the one-line `dev` script change while in `package.json`.
3. **P3** — smoke-pass the other views, consolidation path first.
