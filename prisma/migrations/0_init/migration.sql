-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "localCurrency" TEXT NOT NULL,
    "consolidationMethod" TEXT NOT NULL DEFAULT 'full',
    "ownershipPercentage" REAL NOT NULL DEFAULT 1.0,
    "sector" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "parentCode" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isIntercompany" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "COAMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityCode" TEXT NOT NULL,
    "localAccountCode" TEXT NOT NULL,
    "localAccountName" TEXT NOT NULL,
    "localCOAType" TEXT NOT NULL,
    "groupCOACode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "COAMapping_groupCOACode_fkey" FOREIGN KEY ("groupCOACode") REFERENCES "ChartOfAccount" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currency" TEXT NOT NULL,
    "rateDate" DATETIME NOT NULL,
    "rateType" TEXT NOT NULL DEFAULT 'closing',
    "rate" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ECB',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrialBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "period" DATETIME NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'actual',
    "groupCOACode" TEXT NOT NULL,
    "amountLocal" REAL NOT NULL,
    "amountEUR" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRateUsed" REAL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'manual',
    "isIntercompany" BOOLEAN NOT NULL DEFAULT false,
    "icPartnerEntityId" TEXT,
    "eliminationStatus" TEXT NOT NULL DEFAULT 'pending',
    "eliminationGroup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrialBalance_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrialBalance_groupCOACode_fkey" FOREIGN KEY ("groupCOACode") REFERENCES "ChartOfAccount" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntercompanyTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "amountEUR" REAL NOT NULL,
    "transactionType" TEXT NOT NULL,
    "matchingReference" TEXT,
    "period" DATETIME NOT NULL,
    "isEliminated" BOOLEAN NOT NULL DEFAULT false,
    "eliminationGroup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntercompanyTransaction_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IntercompanyTransaction_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "period" DATETIME NOT NULL,
    "groupCOACode" TEXT NOT NULL,
    "amountLocal" REAL NOT NULL,
    "amountEUR" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "budgetVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BudgetEntry_groupCOACode_fkey" FOREIGN KEY ("groupCOACode") REFERENCES "ChartOfAccount" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForecastEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "period" DATETIME NOT NULL,
    "groupCOACode" TEXT NOT NULL,
    "amountLocal" REAL NOT NULL,
    "amountEUR" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "forecastVersion" TEXT NOT NULL DEFAULT 'rf1',
    "scenarioType" TEXT NOT NULL DEFAULT 'base',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForecastEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ForecastEntry_groupCOACode_fkey" FOREIGN KEY ("groupCOACode") REFERENCES "ChartOfAccount" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsolidationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" DATETIME NOT NULL,
    "entityCodes" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL DEFAULT 'base',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "eliminationsApplied" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" REAL,
    "totalEBITDA" REAL,
    "totalNetIncome" REAL,
    "totalAssets" REAL,
    "netDebt" REAL,
    "ebitdaMargin" REAL,
    "leverage" REAL,
    "processingTimeMs" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'PT',
    "projectType" TEXT NOT NULL DEFAULT 'investment',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'appraisal',
    "startYear" INTEGER NOT NULL,
    "horizonYears" INTEGER NOT NULL DEFAULT 10,
    "capexTotal" REAL NOT NULL DEFAULT 0,
    "debtAmount" REAL NOT NULL DEFAULT 0,
    "debtRate" REAL NOT NULL DEFAULT 0,
    "equityAmount" REAL NOT NULL DEFAULT 0,
    "discountRate" REAL NOT NULL DEFAULT 0.0637,
    "terminalGrowth" REAL NOT NULL DEFAULT 0.035,
    "taxRate" REAL NOT NULL DEFAULT 0.235,
    "assumptions" TEXT,
    "cashFlows" TEXT,
    "npv" REAL,
    "irr" REAL,
    "paybackYears" REAL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "inflationRate" REAL NOT NULL DEFAULT 0.02,
    "interestRate" REAL NOT NULL DEFAULT 0.03,
    "fxVolatility" REAL NOT NULL DEFAULT 0.05,
    "revenueGrowthFactor" REAL NOT NULL DEFAULT 1.0,
    "opexGrowthFactor" REAL NOT NULL DEFAULT 1.0,
    "capexGrowthFactor" REAL NOT NULL DEFAULT 1.0,
    "forecastPeriods" INTEGER NOT NULL DEFAULT 12,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ValidationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "entityScope" TEXT NOT NULL DEFAULT 'all',
    "severity" TEXT NOT NULL DEFAULT 'error',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL DEFAULT 'csv-upload',
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "entityCount" INTEGER NOT NULL DEFAULT 0,
    "dateRange" TEXT NOT NULL DEFAULT '',
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errors" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Entity_code_key" ON "Entity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_code_key" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "COAMapping_groupCOACode_idx" ON "COAMapping"("groupCOACode");

-- CreateIndex
CREATE UNIQUE INDEX "COAMapping_entityCode_localAccountCode_key" ON "COAMapping"("entityCode", "localAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_currency_rateDate_rateType_key" ON "ExchangeRate"("currency", "rateDate", "rateType");

-- CreateIndex
CREATE INDEX "TrialBalance_entityId_period_idx" ON "TrialBalance"("entityId", "period");

-- CreateIndex
CREATE INDEX "TrialBalance_groupCOACode_idx" ON "TrialBalance"("groupCOACode");

-- CreateIndex
CREATE INDEX "TrialBalance_eliminationStatus_idx" ON "TrialBalance"("eliminationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "IntercompanyTransaction_transactionId_key" ON "IntercompanyTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "BudgetEntry_entityId_period_idx" ON "BudgetEntry"("entityId", "period");

-- CreateIndex
CREATE INDEX "ForecastEntry_entityId_period_scenarioType_idx" ON "ForecastEntry"("entityId", "period", "scenarioType");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_name_key" ON "Scenario"("name");

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_lastActive_idx" ON "ChatSession"("lastActive");

