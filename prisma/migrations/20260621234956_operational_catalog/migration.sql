-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" TEXT NOT NULL DEFAULT 'manufactured',
    "salesPricePerUnit" REAL NOT NULL DEFAULT 0,
    "annualVolume" REAL NOT NULL DEFAULT 0,
    "laborCostPerUnit" REAL NOT NULL DEFAULT 0,
    "overheadPerUnit" REAL NOT NULL DEFAULT 0,
    "purchaseCostPerUnit" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RawMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "unitCost" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BillOfMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantityPerUnit" REAL NOT NULL,
    CONSTRAINT "BillOfMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillOfMaterial_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesMix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    CONSTRAINT "SalesMix_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Product_entityCode_idx" ON "Product"("entityCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_entityCode_code_key" ON "Product"("entityCode", "code");

-- CreateIndex
CREATE INDEX "RawMaterial_entityCode_idx" ON "RawMaterial"("entityCode");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_entityCode_code_key" ON "RawMaterial"("entityCode", "code");

-- CreateIndex
CREATE INDEX "BillOfMaterial_rawMaterialId_idx" ON "BillOfMaterial"("rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "BillOfMaterial_productId_rawMaterialId_key" ON "BillOfMaterial"("productId", "rawMaterialId");

-- CreateIndex
CREATE INDEX "SalesMix_productId_idx" ON "SalesMix"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesMix_productId_market_channel_key" ON "SalesMix"("productId", "market", "channel");
