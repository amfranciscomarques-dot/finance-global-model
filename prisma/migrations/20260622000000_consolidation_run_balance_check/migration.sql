-- AlterTable: record the balance-sheet integrity break on each run (TOP.1).
-- Signed assets − (liabilities + equity); ~0 when balanced, populated even on
-- runs marked `failed` so the imbalance is auditable rather than silently lost.
ALTER TABLE "ConsolidationRun" ADD COLUMN "balanceCheck" REAL;
