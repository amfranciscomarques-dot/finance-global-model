# finance-global-model

Multi-entity financial consolidation model — Next.js 16, Prisma/SQLite, shadcn/ui.

Designed as a **template for any company group**: the core (consolidation engine, finance domain math, API, UI) is company-agnostic; company data and country tax rules plug in as modules.

The interface is **bilingual (English / Português)** — a toggle in the header switches the whole UI instantly (powered by `next-intl`, persisted per browser). Numbers and currency stay in the EUR/`de-DE` grouping convention regardless of language.

## Screenshots

All figures below are the fictional **Meridian Group** demo, computed live by the consolidation engine (the UI reads the engine output, not static mock data) and reconciling to the cent.

**Consolidated statements.** Per-entity columns, the intercompany elimination column and the consolidated result, side by side. Internal sales from Meridian Subcontracting to Meridian Components are netted out, so group revenue falls from the €49.0M entity sum to €41.5M consolidated, and the balance sheet ties to zero.

![Consolidated financial statements](docs/screenshots/02-consolidation.png)

**Group dashboard.** Consolidated KPIs, an FX snapshot and a financial-health scorecard derived from the live numbers.

![Group dashboard](docs/screenshots/01-dashboard.png)

**Intercompany transactions.** Matched IC flows between entities and the eliminations that remove them on consolidation.

![Intercompany transactions](docs/screenshots/03-ic-transactions.png)

**Investment appraisal.** NPV, IRR and discounted payback for a capital project, including the Portuguese RFAI tax credit.

![Project investment appraisal](docs/screenshots/04-projects.png)

## Quick start

```bash
npm install
npm run db:push          # create the SQLite schema (db/custom.db)
npm run dev              # http://localhost:3000
```

Load the demo company (Meridian Group, a small fictional multinational):

```bash
curl -X POST "http://localhost:3000/api/packs" \
  -H "Content-Type: application/json" \
  -d '{"packId": "template", "reset": true}'
```

Run the test suite (golden-value reconciliation of the demo pack):

```bash
npm test
```

All demo numbers are invented. Each entity's balance sheet reconciles to the
cent and the group totals tie to the standalone entities after intercompany
elimination, so every figure is reproducible from `src/lib/company-packs/template.ts`.

## Architecture

| Layer | Where | Role |
|---|---|---|
| Finance domain | `src/lib/finance` | Single source of truth: COA→statement mapping, FX, statement derivation, KPIs. Pure functions, unit-tested. |
| Consolidation engine | `src/lib/consolidation-engine.ts` | Orchestrates: trial balances → entity statements → IC eliminations → group statements. Idempotent per period. |
| Company packs | `src/lib/company-packs` | Pluggable company data sets (entities, trial balance, IC transactions, FX, projects). `template` (Meridian Group) is the reference pack. |
| Tax jurisdictions | `src/lib/tax` | Pluggable per-country tax providers keyed by entity `countryCode`. `PT` implements the full IRC chain (derrama municipal/estadual, tributação autónoma, SIFIDE/RFAI/ICE); `ES`/`US` are flat-rate stubs. |
| Projects | `src/lib/projects` | Investment appraisal: NPV / IRR / discounted payback, finite horizon + residual value. |
| Group COA | `src/lib/coa-data.ts` | Shared group chart of accounts all packs map onto. |

## Onboarding a new company

Two paths:

**1. Company pack (code, reproducible).** Create `src/lib/company-packs/<company>.ts` satisfying the `CompanyPack` interface (see `types.ts`), register it in `company-packs/index.ts`, then `POST /api/packs {"packId": "<company>", "reset": true}`. Best when you have a one-off historical dataset you want under version control. The `template` (Meridian Group) pack is the worked example to copy.

**2. API flow (runtime).**
1. `POST /api/entities` — create each legal entity (code, country, currency, ownership, consolidation method).
2. Map your local chart of accounts onto the group COA (`GET /api/coa` for codes; `POST /api/coa/mappings` to record the mapping).
3. `POST /api/import` — load trial balances per entity/period. Non-EUR amounts are converted with the stored closing rate (or an explicit `exchangeRateUsed`); manage rates via `/api/exchange-rates`.
4. Flag intercompany rows (`isIntercompany`, `icPartnerEntityId`) and/or record IC transactions via `/api/ic-transactions`.
5. `POST /api/consolidation` — run the period. Re-running is safe: elimination state is reset and recomputed each run.

## Conventions

- Amounts in **full currency units** (not thousands). Costs are stored **negative**.
- FX rates follow ECB convention: `1 EUR = X currency`; `amountEUR = amountLocal / rate`.
- Annual actuals are stored as a single `YYYY-12` snapshot with `periodType: 'actual'`.
- Only **detail** COA codes carry amounts; all subtotals (current assets, EBITDA, …) are recomputed, never trusted from storage.

## Security / auth posture

This is a **single-tenant portfolio demo** seeded with sample company data, so it
deliberately ships **no login system** — a recruiter or reviewer can open the
live demo and explore every dashboard, run consolidations and play with scenarios
without signing in. Full multi-tenant auth (per-user/org sessions plus a tenant
column on every table) is the right call for a real product, but for a demo it
would only add friction.

What *is* protected: `src/middleware.ts` gates the handful of endpoints that can
destroy or bulk-replace the shared dataset (`POST /api/packs`, `POST /api/import`,
`settings` writes, any `DELETE`) behind an admin token.

- **Local dev:** `ADMIN_TOKEN` unset → every route is open.
- **Deployed demo:** set `ADMIN_TOKEN` (env). Destructive routes then require it
  via the `x-admin-token` header or `admin_token` cookie; everything else stays
  open. This keeps the public demo explorable while protecting its data integrity.

**Production upgrade path:** replace the middleware guard with real
authentication (e.g. session-based) and scope every Prisma query by `userId`/
`orgId`. The schema would gain a tenant column; the middleware matcher already
centralises where that gate lives.

## Known limitations (roadmap)

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan and
[`docs/ARCHITECTURE_REVIEW.md`](docs/ARCHITECTURE_REVIEW.md) for the full
architecture review behind it.

- Tax providers are not yet wired into the engine for forecast periods (actuals pass through the stored IRC charge, which is correct for credits-affected years). Scenario projections preserve the base run's effective tax rate rather than recomputing per jurisdiction.
- Balance-sheet IC eliminations (IC receivable/payable netting) are not automated; P&L IC flows are.
- All analytical routes now compute through `src/lib/finance` (the shared `metrics.ts` resolver / consolidation engine): `trends`, `budget`, `variance`, `scenarios/run`, and the Excel/PDF exports. The exporters call a compute-only `computeConsolidation` via `src/lib/report-model.ts`, so a downloaded report's Consolidated column carries the real IC eliminations (and ties to the dashboard) instead of an un-eliminated entity sum.
- Settings, validation rules, the AI-chat sessions and import history are persisted (Prisma `Setting`/`ValidationRule`/`ChatSession`/`ImportBatch` tables) rather than held in module-level memory, so they survive restarts and behave correctly across serverless instances.
- The codebase typechecks cleanly under `strict` (`noImplicitAny` included), so `next.config.ts` no longer sets `ignoreBuildErrors` — `next build` enforces TypeScript. ESLint runs with a curated rule set; the React-Compiler-readiness lints (`set-state-in-effect`, `immutability`) are warnings, not yet addressed in the view components.
