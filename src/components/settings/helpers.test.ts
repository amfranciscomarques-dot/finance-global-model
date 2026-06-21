import { describe, expect, it } from 'vitest';
import {
  buildTableCounts,
  makeValidationRuleId,
  makeCurrencyPairId,
  countActiveRules,
  countHealthyEndpoints,
  demoSettings,
  demoApiEndpoints,
} from './helpers';
import type { SystemSettings } from '@/lib/types';

describe('buildTableCounts', () => {
  it('returns null when live DB stats are absent (keeps demo counts)', () => {
    expect(buildTableCounts(demoSettings.system)).toBeNull();
  });

  it('maps live system stats to table counts, defaulting missing fields to 0', () => {
    const sys: SystemSettings['system'] = {
      ...demoSettings.system,
      entityCount: 5,
      coaCount: 76,
      // the rest intentionally omitted → should default to 0
    };
    const counts = buildTableCounts(sys);
    expect(counts).not.toBeNull();
    expect(counts!).toHaveLength(10);
    expect(counts!.find(c => c.table === 'Entities')!.count).toBe(5);
    expect(counts!.find(c => c.table === 'Chart of Accounts')!.count).toBe(76);
    expect(counts!.find(c => c.table === 'Trial Balances')!.count).toBe(0);
    expect(counts!.find(c => c.table === 'Scenarios')!.count).toBe(0);
  });

  it('treats entityCount: 0 as present (not absent)', () => {
    const counts = buildTableCounts({ ...demoSettings.system, entityCount: 0 });
    expect(counts).not.toBeNull();
    expect(counts!.find(c => c.table === 'Entities')!.count).toBe(0);
  });
});

describe('id generators', () => {
  it('pads validation-rule ids to three digits', () => {
    expect(makeValidationRuleId(0)).toBe('vr-001');
    expect(makeValidationRuleId(10)).toBe('vr-011');
    expect(makeValidationRuleId(99)).toBe('vr-100');
  });

  it('numbers currency-pair ids sequentially', () => {
    expect(makeCurrencyPairId(0)).toBe('cp-1');
    expect(makeCurrencyPairId(5)).toBe('cp-6');
  });
});

describe('counts', () => {
  it('counts active validation rules', () => {
    // demoSettings has 8 active of 10 (vr-006 and vr-010 inactive)
    expect(countActiveRules(demoSettings.validationRules)).toBe(8);
  });

  it('counts healthy endpoints', () => {
    expect(countHealthyEndpoints(demoApiEndpoints)).toBe(demoApiEndpoints.length);
    expect(countHealthyEndpoints([
      { path: '/a', method: 'GET', status: 'healthy', avgResponseTime: '1ms' },
      { path: '/b', method: 'GET', status: 'degraded', avgResponseTime: '9ms' },
    ])).toBe(1);
  });
});
