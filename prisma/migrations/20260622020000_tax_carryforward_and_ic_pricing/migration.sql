-- MEDIUM.8b — make the tax-depth modules dynamic on the persisted run.
--
-- 1) Per-sale transfer-pricing metadata on intercompany GOODS sales, so the
--    unrealized-inventory-profit elimination can fire on real data. Both nullable;
--    when absent the engine falls back to the group default TransferPricingPolicy.
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "markup" REAL;
ALTER TABLE "IntercompanyTransaction" ADD COLUMN "closingInventoryFraction" REAL;

-- 2) Persist each entity's closing loss (NOL, art.º 52.º CIRC) and unused RFAI
--    credit (art.º 23.º CFI) pools per (entity, year, scenario), so the next
--    year's run can feed them back as the opening pools — which is what makes the
--    IAS 12 deferred tax dynamic across a multi-year roll-forward.
CREATE TABLE "TaxCarryforward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "scenarioType" TEXT NOT NULL DEFAULT 'base',
    "nolClosing" REAL NOT NULL DEFAULT 0,
    "rfaiClosing" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxCarryforward_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaxCarryforward_entityId_year_idx" ON "TaxCarryforward"("entityId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCarryforward_entityId_year_scenarioType_key" ON "TaxCarryforward"("entityId", "year", "scenarioType");
