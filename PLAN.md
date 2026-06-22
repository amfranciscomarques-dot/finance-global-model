# Plan — finance-global-model

**Backlog only — what's left to build.** Completed work lives in
[`CHANGELOG.md`](CHANGELOG.md); app features & design live in
[`README.md`](README.md). When an item ships, record it in the changelog and
delete it here. Delete this file when the backlog is empty.

Items are tiered **MEDIUM** (structural correctness & depth — do next) and **LOW**
(simulation, scale & hardening). Numbering is stable so the changelog can reference
it — shipped items (MEDIUM.1–7, .9–11; the whole TOP tier) are recorded in
the changelog, which is why this list starts at MEDIUM.8.

---

## MEDIUM — structural correctness & depth

### Tax & financing depth

- **MEDIUM.8b — Wire the tax-depth modules into the persisted run.** The MEDIUM.8
  engine pieces shipped pure & additive (see CHANGELOG): NOL + RFAI carryforward,
  IAS 12 deferred tax (`tax/deferred-tax.ts`), and a `TransferPricingPolicy`
  (`finance/transfer-pricing.ts`). What remains is feeding them into
  `runConsolidation`:
  - **Deferred tax → AST-010.** Drive the stored DTA from `computeDeferredTax`
    (NOL/RFAI carryforwards + book-vs-tax differences) and book the period movement
    as deferred-tax expense, instead of passing through the imported `AST-010`.
  - **Transfer pricing → live eliminations.** Build IC *sale* flows (not just IC
    balances) in `runICEliminations` and run `applyTransferPricing` over them so the
    `unrealized_inventory_profit` entry fires on real data. **Blocker:** the
    `IntercompanyTransaction` schema carries no per-sale cost, margin or
    closing-inventory fraction — add those fields (and seed them) first.
  - **Carryforward persistence.** Store each entity's `nolClosing`/`rfaiClosing` per
    year so the next run feeds them back as `nolOpening`/`rfaiOpening`.

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

The MEDIUM.8 tax-depth math has shipped (NOL + RFAI carryforward, IAS 12 deferred
tax, transfer-pricing policy — all pure & tested). The only structural MEDIUM left
is **MEDIUM.8b** — wiring those modules into the persisted consolidation run (the
transfer-pricing leg is gated on adding per-sale fields to the IC schema). After
that, only the LOW tier and quick wins remain.
