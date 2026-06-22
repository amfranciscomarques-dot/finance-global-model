# Plan — finance-global-model

**Backlog only — what's left to build.** Completed work lives in
[`CHANGELOG.md`](CHANGELOG.md); known issues we've chosen *not* to fix yet live in
[`TECH_DEBT.md`](TECH_DEBT.md); app features & design live in [`README.md`](README.md).

The entire TOP, MEDIUM and LOW tiers have shipped, and the full P1→P3 code-audit
backlog (2026-06-22) is closed — all recorded in the changelog. Nothing on the
critical path remains. What's below is the prioritised list of *optional*
follow-ups; each is gated on a triggering milestone and tracked in detail in
`TECH_DEBT.md`.

---

## Priority list (open work)

All remaining items are deferred — none blocks the current single-tenant,
single-snapshot, all-EUR demo. Ordered by recommended sequence when work resumes.

| # | Item | Effort | Trigger to pick it up | Detail |
|---|------|--------|-----------------------|--------|
| 1 | **LOW.4 — Route input validation** | Easy | Route-hardening sprint, or first external/non-demo caller | [TD-01](TECH_DEBT.md#td-01) |
| 2 | **BACKLOG-COGS-MARGIN — Forecast anchor without IC elimination** | Medium | Multi-entity forecast milestone | [TD-02](TECH_DEBT.md#td-02) |
| 3 | **LOW.3 — Interest rounding drift over long horizons** | Trivial | Projection horizon extended past 5 years | [TD-03](TECH_DEBT.md#td-03) |
| 4 | **FX deferred polish** | Medium | Disposals modelled / monthly FX data lands | [TD-04](TECH_DEBT.md#td-04) |
| 5 | **Multi-tenancy** | Large | App serves more than one group | [TD-05](TECH_DEBT.md#td-05) |

**Recommended next:** #1 (LOW.4). It's the only item with no upstream dependency —
a small, defensive route-validation pass that pays off the moment anything beyond
the demo posts to the API. Everything below it needs its triggering milestone
first.

---

## Recently completed (see CHANGELOG for detail)

- **2026-06-22 — P3 audit backlog:** BUG-12 (DTA now a dedicated `deferredTaxAsset` line, IAS 1 §54(o)).
- **2026-06-22 — P2 audit backlog:** BUG-05 (carryforwards in modelled forecast tax), S2-07 (forecast anchor collapses to one snapshot/entity), S2-01 (elimination run serialized in `db.$transaction`).
- **2026-06-22 — P1 audit backlog:** BUG-06, BUG-04, BUG-01, S2-08, BUG-09, BUG-08, BUG-10, S2-05.
- **2026-06-22 — Operations → forecast link:** forecast COGS is now catalog-derived via `loadCatalogMargin`.
