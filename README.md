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
npm run db:deploy        # apply migrations → SQLite schema (db/custom.db)
npm run dev              # http://localhost:3000
```

The schema is migration-managed (`prisma/migrations/`, baselined as `0_init`).
Use `npm run db:deploy` on a fresh clone; `npm run db:migrate` when you change
`schema.prisma`. `npm run db:push` still works for a throwaway local DB but does
not record a migration.

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

| Layer                | Where                             | Role                                                                                                                                                                                                     |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance domain       | `src/lib/finance`                 | Single source of truth: COA→statement mapping, FX, statement derivation, KPIs. Pure functions, unit-tested.                                                                                              |
| Consolidation engine | `src/lib/consolidation-engine.ts` | Orchestrates: trial balances → entity statements → IC eliminations → group statements. Idempotent per period.                                                                                            |
| Company packs        | `src/lib/company-packs`           | Pluggable company data sets (entities, trial balance, IC transactions, FX, projects). `template` (Meridian Group) is the reference pack.                                                                 |
| Tax jurisdictions    | `src/lib/tax`                     | Pluggable per-country tax providers keyed by entity `countryCode`. `PT` implements the full IRC chain (derrama municipal/estadual, tributação autónoma, SIFIDE/RFAI/ICE); `ES`/`US` are flat-rate stubs. |
| Projects             | `src/lib/projects`                | Investment appraisal: NPV / IRR / discounted payback, finite horizon + residual value.                                                                                                                   |
| Group COA            | `src/lib/coa-data.ts`             | Shared group chart of accounts all packs map onto.                                                                                                                                                       |
| Operations           | `src/lib/operations`              | Bottom-up operational catalog: `Product`, `RawMaterial`, `BillOfMaterial`, and `SalesMix`. Reconstructs gross margin and generates trial-balance revenue/COGS lines.                                     |

## Currency translation (IAS 21)

Foreign subsidiaries are consolidated using the **current-rate method**. A EUR
entity (functional currency = the group's presentation currency) needs no
translation, so the engine keeps its original per-line EUR path untouched. A
non-EUR entity is assembled in its **functional currency** and then the whole
sheet is translated into EUR at three different rates:

| Statement area                 | Rate applied         | Why                                              |
| ------------------------------ | -------------------- | ------------------------------------------------ |
| Income & expenses              | **Average** rate     | Proxy for the spot rate at each transaction date |
| Assets & liabilities           | **Closing** rate     | Carried at the period-end spot rate              |
| Contributed / pre-existing equity | **Historical** rate | Frozen at the rate when the equity arose         |

Because the three rates differ, translated assets no longer equal translated
liabilities + equity. IAS 21 does **not** force that gap into the P&L — the
residual is the **Cumulative Translation Adjustment (CTA)**, recognised in OCI
as a separate component of equity. The CTA is therefore exactly the plug that
makes the translated sheet balance; it is a *meaningful* number (the FX effect on
the parent's net investment), not an error. When all three rates are equal it
collapses to zero, which is why the all-EUR demo group and every golden test are
unaffected by this machinery.

### Worked example — Meridian USA (USD)

A small, locally-balanced USD subsidiary, translated at the demo's seeded ECB
rates (`1 EUR = X USD`): closing **1.082**, average **1.079**, historical
**1.104**.

| Line                         | Local (USD)  | Rate           | EUR            |
| ---------------------------- | ------------ | -------------- | -------------- |
| Revenue                      | 1,000,000    | 1.079 (avg)    | 926,784.06     |
| COGS                         | (600,000)    | 1.079 (avg)    | (556,070.44)   |
| **Net income**               | **400,000**  |                | **370,713.62** |
| Cash → **Total assets**      | 2,400,000    | 1.082 (close)  | 2,218,114.60   |
| Share capital                | 2,000,000    | 1.104 (hist)   | 1,811,594.20   |
| Retained earnings (= result) | 400,000      | 1.079 (avg)    | 370,713.62     |
| Equity before CTA            |              |                | 2,182,307.82   |
| **CTA** (plug)               |              |                | **35,806.78**  |
| **Total equity incl. CTA**   |              |                | **2,218,114.60** |

Total equity incl. CTA (2,218,114.60) = total assets (2,218,114.60) → the sheet
reconciles. Consolidated with the EUR parent, the group still balances and the
run is reported **completed**, with the CTA visible as its own equity line.

- Code: `src/lib/finance/translation.ts` (pure, `translateForeignEntity`) wired
  into `buildForeignEntityFinancials` in the engine.
- Tests: `src/lib/finance/translation.test.ts` (this worked example, plus the
  rates-equal and EUR-identity cases) and `src/lib/fx-translation.engine.test.ts`
  (a USD MUSA book consolidated end-to-end).

## Tax reconciliation

The consolidation engine treats income tax as a **stored** trial-balance line
(`TAX-001/2/3`), while `src/lib/tax` models IRC per jurisdiction from taxable
income. These can silently drift. The engine now reconciles the two on every run —
following one principle: **reconcile, don't replace.**

- **On actuals, reconciliation is informational.** Each run attaches a
  `taxReconciliation` block comparing stored IRC against the per-entity modelled
  tax (summed per entity — the correct basis for Portugal's progressive *derrama
  estadual*). Net income is **not** changed: real booked IRC reflects
  SIFIDE/RFAI/ICE credits and RAI→*lucro tributável* adjustments the EBT-based
  model can't reproduce, so it stays authoritative. For the Meridian demo (PT 2024)
  the group drift is **stored €600,000 vs modelled €543,750 = +€56,250**.
- **Unmodelled jurisdictions don't fabricate tax.** Countries without a provider
  (DE/FR/UK/IT) fall back to a 0% stub; if any in-scope entity uses it, the group
  is flagged **not comparable** rather than reported as a 100% over-book.
- **Persisted + surfaced.** The drift (when comparable) and a `taxComparable` flag
  are written to each `ConsolidationRun`, and a *Tax Reconciliation* check appears
  in the Compliance view — the only check that can see tax drift, since the
  balance-sheet integrity gate can't (booked tax and its offsetting payable net to
  zero).
- **Forecasts can opt in to modelled tax.** Passing `computeTaxForProjections: true`
  replaces booked tax with modelled IRC on forecast/budget periods, accruing the
  incremental tax as a payable so the sheet still balances. Off by default; actuals
  are never touched.

Code: `src/lib/tax/reconcile.ts` (pure), wired into `src/lib/consolidation-engine.ts`.
Tests: `src/lib/finance/tax-drift.test.ts` (module) and the tax-reconciliation
block in `src/lib/consolidation-engine.test.ts` (engine).

## Operational Catalog

The model supports a robust **bottom-up operational catalog** for manufacturing and trading entities (managed via Prisma SQL: `Product`, `RawMaterial`, `BillOfMaterial`, and `SalesMix`). 

This acts as the driver for the entity's actual financial performance:

- **Revenue** is computed dynamically per product (`annualVolume` × `salesPricePerUnit`) and distributed via the `SalesMix`.
- **Cost of Goods Sold (COGS)** is computed by mapping the product's `BillOfMaterial` to `RawMaterial` unit costs, plus direct labor and overhead.
- These calculations automatically generate the **REV** (Revenue) and **COGS** trial-balance lines for the entity, ensuring that the financial consolidation is perfectly tied to the physical operational realities of the factories and stores.

You can add or modify products and raw materials directly via your favorite SQL client or by running `npx prisma studio`. Any changes will instantly reflect in the dashboards and consolidation engine.

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

See [`PLAN.md`](PLAN.md) for the phased roadmap, the architecture-review
findings behind it, and the IAS 21 FX design. Completed work (review passes and
remediations) is recorded in [`CHANGELOG.md`](CHANGELOG.md).

- Tax providers are now reconciled against the engine (see [Tax reconciliation](#tax-reconciliation) below): every consolidation attaches an informational stored-vs-modelled IRC drift, and forecast periods can opt in to modelled IRC. Stored IRC on actuals stays authoritative (it captures SIFIDE/RFAI/ICE credits the EBT-based model can't reproduce). Remaining tax depth — NOL carryforward, deferred tax, transfer pricing — is tracked as MEDIUM.8 in [`PLAN.md`](PLAN.md).
- Intercompany eliminations are automated for both P&L flows (revenue/COGS netting) and the balance sheet: IC receivable (`AST-009`) and IC payable (`LIA-006`) are first-class lines, netted against each other in an explicit, auditable elimination pass on consolidation (see `src/lib/finance/eliminations.ts`).
- Non-controlling interest is derived from **ownership × the subsidiary's full equity**, not just a stored `EQY-003`: the minority's share of opening equity is reclassified to minority equity and the current-year share of net income is carved out of the consolidated P&L, so the consolidated minority equity is `(1 − ownership) × subsidiary total equity`. (All demo entities are wholly owned, so this is a correctness guarantee for the `<100%` case rather than visible in the demo numbers.)
- All analytical routes now compute through `src/lib/finance` (the shared `metrics.ts` resolver / consolidation engine): `trends`, `budget`, `variance`, `scenarios/run`, and the Excel/PDF exports. The exporters call a compute-only `computeConsolidation` via `src/lib/report-model.ts`, so a downloaded report's Consolidated column carries the real IC eliminations (and ties to the dashboard) instead of an un-eliminated entity sum.
- Settings, validation rules, the AI-chat sessions and import history are persisted (Prisma `Setting`/`ValidationRule`/`ChatSession`/`ImportBatch` tables) rather than held in module-level memory, so they survive restarts and behave correctly across serverless instances.
- The codebase typechecks cleanly under `strict` (`noImplicitAny` included), so `next.config.ts` no longer sets `ignoreBuildErrors` — `next build` enforces TypeScript. ESLint runs with a curated rule set at **0 errors**; the only remaining warnings are the React-Compiler-readiness `set-state-in-effect` lints (24) in the view components, which are runtime-safe and tracked for a follow-up sweep.
