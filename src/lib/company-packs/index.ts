// Company packs — registry + generic seeder. To add a company, create a pack
// module satisfying CompanyPack and register it here; nothing else in the app
// needs to change. Alternatively skip packs entirely and onboard via the API:
// POST /api/entities → POST /api/import (trial balances) → POST /api/consolidation.
import { templatePack } from './template';
import type { CompanyPack } from './types';

export * from './types';
export { seedCompanyPack, type SeedPackResult } from './seed';

const REGISTRY: Record<string, CompanyPack> = {
  [templatePack.id]: templatePack,
};

export function getCompanyPack(id: string): CompanyPack | undefined {
  return REGISTRY[id];
}

export function listCompanyPacks(): CompanyPack[] {
  return Object.values(REGISTRY);
}
