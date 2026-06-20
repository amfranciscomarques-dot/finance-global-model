# finance-global-model

Multi-entity financial consolidation model — Next.js 16, Prisma/SQLite, shadcn/ui.

Designed as a **template for any company group**: the core (consolidation engine, finance domain math, API, UI) is company-agnostic; company data and country tax rules plug in as modules.

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

## Known limitations (roadmap)

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan and
[`docs/ARCHITECTURE_REVIEW.md`](docs/ARCHITECTURE_REVIEW.md) for the full
architecture review behind it.

- Tax providers are not yet wired into the engine for forecast periods (actuals pass through the stored IRC charge, which is correct for credits-affected years).
- Balance-sheet IC eliminations (IC receivable/payable netting) are not automated; P&L IC flows are.
- Several reporting routes (export, trends, variance, scenarios, budget) still use legacy prefix-matching math instead of `src/lib/finance`.
- No authentication on API routes; single-user local tool for now.
- `next.config.ts` sets `ignoreBuildErrors: true` (pre-existing zod v4 `.errors`→`.issues` noise).
