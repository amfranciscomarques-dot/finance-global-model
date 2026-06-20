import { db } from '@/lib/db';

// ============================================================
// APP SETTINGS — persistence helpers
//
// These back the /api/settings route. The consolidation/currency config and the
// validation-rule catalogue used to live in module-level variables, so every
// change was lost on restart and inconsistent across serverless instances. They
// now persist to the `Setting` and `ValidationRule` tables, seeded lazily from
// the defaults below on first read.
// ============================================================

export type SettingsCategory = 'consolidation' | 'currency';

export const DEFAULT_SETTINGS: Record<SettingsCategory, Record<string, unknown>> = {
  consolidation: {
    roundingTolerance: 0.01,
    eliminationThreshold: 100,
    minorityInterestMethod: 'proportional',
    balanceSheetTolerance: 0.05,
    autoConsolidation: false,
  },
  currency: {
    baseCurrency: 'EUR',
    rateTypePreference: 'closing',
    ecbApiEnabled: true,
    refreshFrequencyHours: 24,
    exchangeRateProvider: 'ECB',
  },
};

export type Severity = 'error' | 'warning';

export interface ValidationRuleData {
  id: string;
  name: string;
  entityScope: string;
  severity: Severity;
  isActive: boolean;
  description: string;
}

export const DEFAULT_VALIDATION_RULES: ValidationRuleData[] = [
  { id: 'vr-001', name: 'Trial balance must balance', entityScope: 'all', severity: 'error', isActive: true, description: 'Total debits must equal total credits for each entity trial balance' },
  { id: 'vr-002', name: 'IC transactions must match', entityScope: 'all', severity: 'error', isActive: true, description: 'Intercompany transactions must have matching counterpart entries' },
  { id: 'vr-003', name: 'Currency rate must exist', entityScope: 'non-eur', severity: 'error', isActive: true, description: 'Exchange rate must be available for all non-EUR entity conversions' },
  { id: 'vr-004', name: 'Revenue > 0', entityScope: 'all', severity: 'warning', isActive: true, description: 'Revenue should be positive for active entities' },
  { id: 'vr-005', name: 'Assets = Liabilities + Equity', entityScope: 'all', severity: 'error', isActive: true, description: 'Balance sheet equation must hold within tolerance' },
  { id: 'vr-006', name: 'Net income within expected range', entityScope: 'all', severity: 'warning', isActive: false, description: 'Net income should be within ±50% of previous period' },
  { id: 'vr-007', name: 'Ownership percentage valid', entityScope: 'all', severity: 'error', isActive: true, description: 'Ownership percentage must be between 0% and 100%' },
  { id: 'vr-008', name: 'No duplicate COA codes', entityScope: 'all', severity: 'error', isActive: true, description: 'Each entity must have unique chart of account codes' },
  { id: 'vr-009', name: 'Consolidation method matches ownership', entityScope: 'all', severity: 'warning', isActive: true, description: 'Consolidation method should be appropriate for ownership level (full >50%, proportional 20-50%, equity <20%)' },
  { id: 'vr-010', name: 'Period data completeness', entityScope: 'all', severity: 'warning', isActive: false, description: 'All expected accounts should have data entries for the reporting period' },
];

/** Read one settings category, falling back to (and filling gaps with) defaults. */
export async function getCategorySettings(category: SettingsCategory): Promise<Record<string, unknown>> {
  const row = await db.setting.findUnique({ where: { key: category } });
  if (!row) return { ...DEFAULT_SETTINGS[category] };
  try {
    return { ...DEFAULT_SETTINGS[category], ...(JSON.parse(row.value) as Record<string, unknown>) };
  } catch {
    return { ...DEFAULT_SETTINGS[category] };
  }
}

/** Merge a partial update into a category and persist it. Returns the merged result. */
export async function patchCategorySettings(
  category: SettingsCategory,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const merged = { ...(await getCategorySettings(category)), ...patch };
  const value = JSON.stringify(merged);
  await db.setting.upsert({
    where: { key: category },
    create: { key: category, value },
    update: { value },
  });
  return merged;
}

function toRuleData(row: { id: string; name: string; entityScope: string; severity: string; isActive: boolean; description: string }): ValidationRuleData {
  return {
    id: row.id,
    name: row.name,
    entityScope: row.entityScope,
    severity: row.severity === 'warning' ? 'warning' : 'error',
    isActive: row.isActive,
    description: row.description,
  };
}

/** Read all validation rules, seeding the defaults on first access. */
export async function getValidationRules(): Promise<ValidationRuleData[]> {
  if ((await db.validationRule.count()) === 0) {
    await db.validationRule.createMany({
      data: DEFAULT_VALIDATION_RULES.map((r, i) => ({ ...r, sortOrder: i })),
    });
  }
  const rows = await db.validationRule.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map(toRuleData);
}

/** Flip the active flag of a single rule. No-op if the id is unknown. */
export async function toggleValidationRule(id: string): Promise<void> {
  const rule = await db.validationRule.findUnique({ where: { id } });
  if (rule) {
    await db.validationRule.update({ where: { id }, data: { isActive: !rule.isActive } });
  }
}

/** Activate or deactivate every rule. */
export async function bulkToggleValidationRules(isActive: boolean): Promise<void> {
  await db.validationRule.updateMany({ data: { isActive } });
}

/** Append a new rule, assigning the next vr-NNN id. */
export async function addValidationRule(rule: Omit<ValidationRuleData, 'id'>): Promise<ValidationRuleData> {
  await getValidationRules(); // ensure defaults are seeded so the count is meaningful
  const count = await db.validationRule.count();
  const id = `vr-${String(count + 1).padStart(3, '0')}`;
  const created = await db.validationRule.create({
    data: { id, sortOrder: count, ...rule },
  });
  return toRuleData(created);
}

/** Replace the entire rule catalogue (used when the client sends a full edited list). */
export async function replaceValidationRules(rules: ValidationRuleData[]): Promise<void> {
  await db.$transaction([
    db.validationRule.deleteMany({}),
    db.validationRule.createMany({
      data: rules.map((r, i) => ({ ...r, sortOrder: i })),
    }),
  ]);
}

/** Reset all persisted settings + rules back to the seeded defaults. */
export async function resetSettings(): Promise<void> {
  await db.$transaction([
    db.setting.deleteMany({}),
    db.validationRule.deleteMany({}),
  ]);
  await db.validationRule.createMany({
    data: DEFAULT_VALIDATION_RULES.map((r, i) => ({ ...r, sortOrder: i })),
  });
}
