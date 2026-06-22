-- AlterTable: record the group tax-reconciliation result on each run (B3).
-- taxDriftEUR is the signed (stored − modelled IRC) drift, summed per entity;
-- it is NULL when the run is not comparable (an entity hit an unmodelled
-- jurisdiction). taxComparable carries that comparability flag so a 0 drift
-- ("no model") is never confused with "no divergence".
ALTER TABLE "ConsolidationRun" ADD COLUMN "taxDriftEUR" REAL;
ALTER TABLE "ConsolidationRun" ADD COLUMN "taxComparable" BOOLEAN;
