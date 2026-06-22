# Plan — finance-global-model

**Backlog only — what's left to build.** Completed work lives in
[`CHANGELOG.md`](CHANGELOG.md); app features & design live in
[`README.md`](README.md). When an item ships, record it in the changelog and
delete it here. Delete this file when the backlog is empty.

Items are tiered **LOW** (simulation, scale & hardening). Numbering is stable so the
changelog can reference it — the whole TOP and MEDIUM tiers have shipped (MEDIUM.1–11,
including all three legs of MEDIUM.8b) and are recorded in the changelog.

---

## LOW — simulation, scale & hardening

- **LOW.1 — Simulation through the kernel.** Fan the MEDIUM.10 `projectPeriod`
  kernel out for scenarios / Monte Carlo in-memory — no per-iteration DB round
  trips or `ConsolidationRun` persistence.
- **LOW.2 — Remove N+1 / per-row `await`** in the engine and IC elimination loops.
- **LOW.3 — Integer-cents / decimal money** to avoid float drift in multi-year runs.
- **LOW.4 — Per-jurisdiction tax view** in the Compliance UI.
- **LOW.5 — Auth/authz on API routes.** Single-tenant demo today; middleware gates
  destructive routes (see the README's security posture). Multi-tenant auth is the
  real gap.
- **LOW.6 — Real forecast uncertainty bands.** Replace the hardcoded ±5/8/3%/mo
  fan and the flat monthly spread in `/api/forecast` with bands derived from driver
  dispersion — best folded into LOW.1 (Monte-Carlo the driver draws rather than
  fanning a fixed % on the mean).

---

## Quick wins & follow-ups

- **Seed a USD demo book into MUSA.** Tiny; makes the IAS 21 CTA visible in the
  live UI — today's demo is all-EUR, so CTA only shows in tests/README.
- **Operations → forecast link (from MEDIUM.11).** Feed the operational gross
  margin into the MEDIUM.10 driver set so forecast COGS is catalog-derived, not a
  flat margin.
- **Surface the tax carryforwards & PT caps in the UI/README (from MEDIUM.8).**
  The NOL 70% cap (art.º 52.º CIRC), `nolUsed`/`nolClosing` and `rfaiUsed`/
  `rfaiClosing` are computed but only visible in the engine/tests. Show them in the
  tax-breakdown view (or a README worked example) with a one-line statutory note,
  so the modelling depth is legible to a reader, not buried in the providers.
- **FX deferred polish (from MEDIUM.1).** Per-tranche historical equity rates (v1
  uses acquisition-date or closing); CTA recycling to P&L on disposal (IAS 21 §48,
  out of scope until disposals are modelled); period-weighted average rates when
  monthly FX data lands.

---

## Recommended next

The whole MEDIUM tier is now shipped — **MEDIUM.8b** is complete: the tax-depth
modules are wired into the persisted run (deferred tax surfaced on `result.deferredTax`,
carryforward pools persisted and fed back year-on-year, and transfer pricing firing
the unrealized-profit elimination on live IC goods sales). Only the **LOW** tier and
the quick wins remain. The natural next step is **LOW.1** (fan the projection kernel
out for in-memory scenarios / Monte Carlo), with the **quick wins** — seeding a USD
demo book into MUSA and surfacing the tax carryforwards/PT caps in the UI — as
low-risk, high-legibility warm-ups.
