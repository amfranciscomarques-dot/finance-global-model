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

_LOW.1 (simulation through the kernel), LOW.2 (remove N+1 / per-row `await`), LOW.4
(per-jurisdiction tax view in Compliance), LOW.5 (single-tenant auth/authz — real
login + roles) and LOW.6 (real forecast uncertainty bands) shipped 2026-06-22 — see
the changelog. Multi-tenancy (a `tenantId` on every table + query scoping) remains the
larger follow-up to LOW.5, but is out of scope for the single-tenant model._

---

## Quick wins & follow-ups

- **Operations → forecast link (from MEDIUM.11).** Feed the operational gross
  margin into the MEDIUM.10 driver set so forecast COGS is catalog-derived, not a
  flat margin.
- **FX deferred polish (from MEDIUM.1).** Per-tranche historical equity rates (v1
  uses acquisition-date or closing); CTA recycling to P&L on disposal (IAS 21 §48,
  out of scope until disposals are modelled); period-weighted average rates when
  monthly FX data lands.

---

## Recommended next

**LOW.1**, **LOW.2**, **LOW.4**, **LOW.5** and **LOW.6** shipped 2026-06-22 (Monte-Carlo
simulation through the kernel, the N+1 / per-row `await` removal, the per-jurisdiction tax
view, single-tenant auth/authz, and real forecast bands). The only item left in the LOW
tier is **LOW.3** (integer-cents money — a sweeping refactor of the finance domain), which
carries a design fork worth settling before starting: money representation (see the decision
notes below). (The former "seed a USD demo book into MUSA" warm-up is already satisfied —
MUSA ships in the template pack with the three IAS 21 rates, so CTA is live in the UI, not
just in tests.)

### Decisions to settle before LOW.3 (integer-cents / decimal money)

The goal is to kill float drift in multi-year runs. Pick before refactoring:

1. **Representation.** (a) **Integer minor units** (cents as `number`/`bigint`) — fast,
   exact for add/subtract, but FX and tax *rates* still need rounding rules and
   division is lossy; (b) a **decimal library** (`decimal.js` / `big.js`) — exact
   arbitrary-precision arithmetic, ergonomic, but every money op becomes a method call
   and it touches every finance signature; (c) **`bigint` cents** — exact and native,
   but no fractions at all (sub-cent FX intermediate values must be modelled
   explicitly). `decimal.js-light` is already in the tree (transitively) — worth
   checking before adding a dependency.
2. **Scope / boundary.** Refactor the whole `src/lib/finance` domain, or introduce a
   `Money` type only at the aggregation/derivation seams and keep raw inputs as-is?
   Where do Prisma `Float` columns get converted — at the DB boundary, or kept as
   floats and converted on read? (A schema change to `Decimal`/integer columns is a
   migration and a far bigger blast radius.)
3. **Rounding policy.** Half-up vs. banker's rounding; where rounding is *allowed* to
   happen (per-line, per-statement, only on display) — this directly affects whether
   the existing golden values still hold to the cent, so decide it up front and pin it
   in the finance domain.
4. **FX & rates.** Rates stay fractional (e.g. 1.0820). Decide the multiply-then-round
   convention for `convertToEUR` so a translated foreign sheet still reconciles exactly
   after the change (the IAS 21 CTA residual is sensitive to this).
