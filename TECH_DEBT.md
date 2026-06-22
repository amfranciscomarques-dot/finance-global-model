# Technical Debt — finance-global-model

Register of **known issues we have consciously deferred**, plus audit coverage
gaps and the load-bearing invariants that keep the deferred items safe. None of
these blocks the current single-tenant, single-snapshot, all-EUR demo; each is
recorded here so the decision (and its trigger) is explicit rather than lost.

Scheduling lives in [`PLAN.md`](PLAN.md); shipped fixes live in
[`CHANGELOG.md`](CHANGELOG.md). Most entries below originate from the 4-agent
high-effort code audit completed 2026-06-22 (orchestrator: claude-sonnet-4-6;
coverage: `src/lib/finance/`, `consolidation-engine.ts`, `src/lib/tax/`, 35 route
handlers, `prisma/schema.prisma`).

---

## Deferred issues

### TD-01 — Route input validation (LOW.4)

**Where:** multiple route handlers. **Effort:** Easy. **Risk:** Low.

Three request-parsing patterns are unguarded:

- (S2-11) `POST /api/forecast` silently ignores non-numeric body fields.
- (S2-12) `GET /api/forecast?period=` with a non-date string falls back to the
  current year instead of rejecting.
- (S2-13) `GET /api/consolidation?limit=` has no upper bound, allowing unbounded
  DB reads.

**Fix:** a shared `parsePeriodParam` helper across the affected routes plus a
`Math.min` clamp on `limit`. BUG-09 already hardened the KPI/variance/budget
`period` inputs (`z.string().regex(/^\d{4}-\d{2}$/)` + 400); this is the rest of
that surface.

**Trigger:** route-hardening sprint, or the first non-demo/external caller.

---

### TD-02 — Forecast anchor without IC elimination (BACKLOG-COGS-MARGIN)

**Where:** `src/app/api/forecast/route.ts`, `buildRealAnnualStatements`.
**Effort:** Medium (structural). **Risk:** Med when IC is material.

The forecast anchor sums all entity trial balances **without** intercompany
elimination. `loadCatalogMargin` then derives a gross-margin rate off that
IC-inflated revenue base, producing systematically incorrect COGS projections
whenever IC is material. The structural fix is to anchor on `computeConsolidation`
(already done in `/api/consolidation/projection`) rather than a raw trial-balance
sum.

**Trigger:** the multi-entity forecast milestone. (BUG-07; related to the
completed Operations → forecast link.)

---

### TD-03 — Interest rounding drift over long horizons (LOW.3)

**Where:** `src/lib/finance/project.ts:199`, simple-interest branch.
**Effort:** Trivial. **Risk:** Low (latent).

`interestMag = a.interestRate * openingDebt` is never passed through `round2`.
Over ~120 monthly periods the unrounded accumulation can breach
`DEFAULT_BALANCE_TOLERANCE_EUR = 1.0`. Harmless at the current ≤5-year horizon.

**Fix:** wrap the simple-interest accrual in `round2`, matching the sweep path.

**Trigger:** extending the projection horizon past 5 years, or enabling the
balance-check assertion on projected sheets. (BUG-11 + S2-02.)

---

### TD-04 — FX deferred polish (from MEDIUM.1)

**Where:** `src/lib/finance/translation.ts` and the FX rate model.
**Effort:** Medium. **Risk:** Low (out of scope for the all-EUR demo).

Three refinements remain on the IAS 21 translation path:

- Per-tranche historical equity rates (v1 uses acquisition-date or closing).
- CTA recycling to P&L on disposal (IAS 21 §48) — out of scope until disposals
  are modelled.
- Period-weighted average rates, once monthly FX data lands (v1 uses a single
  average/closing pair).

**Trigger:** disposals get modelled, or monthly FX data is imported.

---

### TD-05 — Multi-tenancy (follow-up to LOW.5)

**Where:** schema-wide. **Effort:** Large. **Risk:** n/a until needed.

A `tenantId` on every table plus query-scoping throughout. Deliberately out of
scope for the single-tenant model (`INV-SINGLE-TENANT`), but the natural next step
if the app ever serves multiple groups.

**Trigger:** the app needs to serve more than one group.

---

## Audit coverage gaps (2026-06-22)

Areas the code audit did **not** cover — not known-bad, just unverified:

- **Compliance view** (`compliance-view.tsx`, `/api/compliance`) — not audited;
  treated as read-only in-flight scope.
- **Component layer** — only `consolidation-view.tsx` was swept for unsafe casts;
  other view components were not checked.
- **S2-01 concurrent race** — fixed (serialized in `db.$transaction`) but cannot
  be reproduced under Vitest; a true regression test needs a parallel-curl run
  against multi-worker `next start`.
- **Monte-Carlo output format** — validated only for NaN propagation (BUG-08), not
  for full output-shape correctness.

---

## Invariants that keep the deferred items safe (confirmed intact 2026-06-22)

| Invariant | Status |
|-----------|--------|
| INV-IRC-ACTUALS — Stored IRC authoritative for actuals | Intact. The former BUG-05 gap was forecast-only (`computeTaxForProjections`). |
| INV-CTA-OCI — CTA in OCI, not P&L | Intact. Stress-confirmed (S2-10). |
| INV-SUBTOTALS-RECOMPUTED — double-derive safe; costs stored negative | Intact. BUG-03/06 were bugs *against* the convention; the convention itself is sound. |
| INV-SINGLE-TENANT — no login; `ADMIN_TOKEN` gates destructive routes | Intact. Underpins TD-05 being deferred. |
| INV-ALL-EUR-DEMO — demo all-EUR; CTA/FX exercised in tests + README only | Intact. Golden tests pass. Underpins TD-04 being deferred. |
