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

- **LOW.3 — Integer-cents / decimal money** to avoid float drift in multi-year runs.
- **LOW.4 — Per-jurisdiction tax view** in the Compliance UI.
- **LOW.5 — Auth/authz on API routes.** Single-tenant demo today; middleware gates
  destructive routes (see the README's security posture). Multi-tenant auth is the
  real gap.

_LOW.1 (simulation through the kernel), LOW.2 (remove N+1 / per-row `await`) and
LOW.6 (real forecast uncertainty bands) shipped 2026-06-22 — see the changelog._

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

**LOW.1**, **LOW.2** and **LOW.6** shipped 2026-06-22 (Monte-Carlo simulation through
the kernel, the N+1 / per-row `await` removal, and real forecast bands). Remaining in
the LOW tier: **LOW.3** (integer-cents money — a sweeping refactor of the finance
domain), **LOW.4** (per-jurisdiction tax view in the Compliance UI — additive UI) and
**LOW.5** (auth/authz — outward-facing). LOW.4 is the lowest-risk of the three; LOW.3
and LOW.5 each carry a design fork (money representation; multi-tenant auth vs. simple
middleware gating) worth settling before starting. The **quick wins** — seeding a USD
demo book into MUSA and surfacing the tax carryforwards/PT caps in the UI — remain
available as low-risk, high-legibility warm-ups.
