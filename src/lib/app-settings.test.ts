import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  getCategorySettings,
  patchCategorySettings,
  getValidationRules,
  toggleValidationRule,
  addValidationRule,
  resetSettings,
  DEFAULT_VALIDATION_RULES,
} from './app-settings';

// These settings used to live in module-level variables (lost on restart). The
// helpers now persist to the Setting / ValidationRule tables — these tests prove
// the round-trip and the lazy default seeding.

beforeEach(async () => {
  await db.setting.deleteMany({});
  await db.validationRule.deleteMany({});
});

afterAll(async () => {
  await db.$disconnect();
});

describe('app-settings persistence', () => {
  it('returns defaults when nothing is stored', async () => {
    const c = await getCategorySettings('consolidation');
    expect(c.minorityInterestMethod).toBe('proportional');
    expect(c.roundingTolerance).toBe(0.01);
  });

  it('persists a partial patch and keeps untouched defaults', async () => {
    await patchCategorySettings('consolidation', { roundingTolerance: 0.25 });
    const c = await getCategorySettings('consolidation');
    expect(c.roundingTolerance).toBe(0.25);
    expect(c.eliminationThreshold).toBe(100); // default preserved through the merge
  });

  it('seeds the default validation rules on first read', async () => {
    const rules = await getValidationRules();
    expect(rules).toHaveLength(DEFAULT_VALIDATION_RULES.length);
    expect(rules[0].id).toBe('vr-001');
  });

  it('toggles a single rule and persists it', async () => {
    await getValidationRules(); // seed
    const before = (await getValidationRules()).find((r) => r.id === 'vr-001')!;
    await toggleValidationRule('vr-001');
    const after = (await getValidationRules()).find((r) => r.id === 'vr-001')!;
    expect(after.isActive).toBe(!before.isActive);
  });

  it('adds a rule with the next sequential id', async () => {
    await getValidationRules(); // seeds 10 (vr-001..vr-010)
    const created = await addValidationRule({
      name: 'Custom rule',
      entityScope: 'all',
      severity: 'warning',
      isActive: true,
      description: 'A custom check',
    });
    expect(created.id).toBe('vr-011');
    expect((await getValidationRules())).toHaveLength(DEFAULT_VALIDATION_RULES.length + 1);
  });

  it('resets settings and rules back to defaults', async () => {
    await patchCategorySettings('currency', { baseCurrency: 'USD' });
    await resetSettings();
    const c = await getCategorySettings('currency');
    expect(c.baseCurrency).toBe('EUR');
    expect(await db.validationRule.count()).toBe(DEFAULT_VALIDATION_RULES.length);
  });
});
