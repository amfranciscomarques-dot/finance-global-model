# Plan — finance-global-model

**Backlog only — what's left to build.** Completed work lives in
[`CHANGELOG.md`](CHANGELOG.md); app features & design live in
[`README.md`](README.md).

The entire TOP, MEDIUM and LOW tiers have now shipped and are recorded in the
changelog. The following are **quick wins and follow-ups** from earlier work —
no tier assignment, no fixed ordering.

---

## Quick wins & follow-ups

- ~~**Operations → forecast link (from MEDIUM.11).**~~ Done 2026-06-22. Forecast COGS is now catalog-derived via `loadCatalogMargin`; falls back to historical ratio when no catalog exists.
- **FX deferred polish (from MEDIUM.1).** Per-tranche historical equity rates (v1
  uses acquisition-date or closing); CTA recycling to P&L on disposal (IAS 21 §48,
  out of scope until disposals are modelled); period-weighted average rates when
  monthly FX data lands.
- **Multi-tenancy (follow-up to LOW.5).** A `tenantId` on every table + query
  scoping. Out of scope for the single-tenant model but the natural next step if
  the app serves multiple groups.
