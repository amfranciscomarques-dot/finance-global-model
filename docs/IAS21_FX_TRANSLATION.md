# Design — IAS 21 currency translation & Cumulative Translation Adjustment (CTA)

Status: **proposed** (not yet implemented). Owner: finance domain.

## 1. Problem

`buildEntityFinancials` (`src/lib/consolidation-engine.ts`) converts **every** trial-balance
entry of a foreign entity at a single **closing** rate:

```ts
const rate = await getExchangeRate(entity.localCurrency, periodDate, 'closing');
```

This violates IAS 21 *The Effects of Changes in Foreign Exchange Rates*. For a
subsidiary whose functional currency ≠ the EUR presentation currency, the standard
requires **two** rates:

| Statement | Rate (IAS 21 §39) | Rationale |
|-----------|-------------------|-----------|
| Income statement (revenue → net income) | **average** rate for the period | flows accrue throughout the year |
| Balance sheet — assets & liabilities | **closing** rate at period end | spot value of monetary/non-monetary positions |
| Equity (share capital, pre-acquisition reserves) | **historical** rate | frozen at the date of the transaction |

Because the three rates differ, the translated balance sheet **no longer balances**:
`assets@closing − liabilities@closing − equity@historical − retainedEarnings(incl. NI@average) ≠ 0`.
The residual is the **Cumulative Translation Adjustment (CTA)** — a real equity
component (Other Comprehensive Income), *not* a plug to be hidden.

Today there is no CTA, so a foreign entity's `balanceCheck` would be non-zero and —
now that the balance-sheet integrity gate is in place — the run would be marked
`failed`. The CTA is the missing piece that makes a correctly-translated foreign
sheet reconcile.

## 2. Data model

`ExchangeRate` already supports the needed rate types (`schema.prisma`):

```prisma
rateType String @default("closing") // closing, average, historical
```

`getExchangeRate(currency, periodDate, rateType)` already accepts the type. So the
data layer needs **no migration** for closing/average. Historical equity rates are
the only gap — see §5.

Add one equity line to carry the CTA (`account-maps.ts`):

```ts
// BalanceSheetData
cta: number; // Cumulative Translation Adjustment (OCI within equity)
```

and fold it into equity in `deriveBalanceSheet`:

```ts
bs.totalEquity = bs.shareCapital + bs.retainedEarnings + bs.minorityEquity + bs.cta;
```

## 3. Translation algorithm (per entity, per period)

Replace the single-rate conversion in `buildEntityFinancials` with rate-aware mapping.
The natural seam is `addEntry`: it already knows which statement a code belongs to,
so it can pick the correct rate.

```
closing  = getExchangeRate(ccy, period, 'closing')
average  = getExchangeRate(ccy, period, 'average')
historical = getExchangeRate(ccy, period, 'historical')  // fallback → closing

for each entry:
  if code ∈ IS_ACCOUNTS:        amountEUR = local / average
  else if code ∈ EQUITY (hist): amountEUR = local / historical
  else (other BS, CF):          amountEUR = local / closing
```

(`convertToEUR(local, rate) = local / rate`, since ECB rates are 1 EUR = X ccy.)

Then derive statements as today. The CTA is computed **last**, as the balancing figure:

```ts
// after deriveIncomeStatement + the asset/liability/equity sums
bs.cta = bs.totalAssets - bs.totalLiabilities
         - (bs.shareCapital + bs.retainedEarnings + bs.minorityEquity);
// deriveBalanceSheet then includes cta in totalEquity → balanceCheck == 0
```

This is the **current-rate (closing-rate) method** of IAS 21 — appropriate when the
functional currency is the local currency (the normal case for autonomous foreign
subsidiaries). The alternative (temporal method, for hyperinflationary / integrated
operations) is out of scope.

## 4. Where it plugs in

1. `fx.ts` — no change (already rate-type aware). Add a small helper
   `getEntityRates(ccy, period) → { closing, average, historical }` to fetch once.
2. `account-maps.ts` — add `cta` to `BalanceSheetData`, `createEmptyBS`, and
   `deriveBalanceSheet` (equity rollup).
3. `statements.ts` — `addEntry` gains an optional `rates` arg so the engine can pass
   the per-entity rate set; pure-EUR entities pass `{closing:1, average:1, historical:1}`
   and behave exactly as today (zero CTA, which protects the EUR-only golden tests).
4. `consolidation-engine.ts` — fetch the three rates once per entity, pass them into
   `addEntry`, compute `bs.cta` before `deriveBalanceSheet`.
5. On aggregation, `cta` sums like any other equity detail line; the group
   `balanceCheck` stays ~0, so a correctly-translated multi-currency group reports
   `completed`.

## 5. Open decisions

- **Historical equity rate source.** No historical rate per equity tranche exists in
  the seed. Pragmatic v1: use the **acquisition-date** rate stored on the entity, or
  fall back to closing (CTA then only captures asset/liability vs. P&L drift). Flag a
  follow-up to capture per-tranche historical rates.
- **CTA recycling.** On disposal of a foreign operation, accumulated CTA is recycled
  to P&L (IAS 21 §48). Out of scope until disposals are modelled.
- **Average-rate granularity.** With only an annual snapshot, "average" = annual
  average ECB rate. When monthly data lands, use period-weighted averages.

## 6. Test plan

- Golden tests stay green: EUR-only demo entities → all rates 1.0 → `cta == 0`.
- New unit test: a synthetic GBP entity with closing ≠ average rates → `cta ≠ 0` and
  `balanceCheck == 0` after derivation.
- New engine test: a two-entity group (EUR + GBP) → consolidated `balanceCheck ≈ 0`
  and `status == 'completed'`.
