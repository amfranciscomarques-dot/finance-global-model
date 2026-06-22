import { describe, expect, it } from 'vitest';
import { parseEntityCodes } from './entity-codes';

// Guards the only validated boundary for the stringly-typed
// ConsolidationRun.entityCodes JSON column: a bad value must degrade to [] rather
// than throwing (which would 500 the audit/reports routes that consume it).
describe('parseEntityCodes', () => {
  it('parses a well-formed JSON string array', () => {
    expect(parseEntityCodes('["MERID","MSUB"]')).toEqual(['MERID', 'MSUB']);
  });

  it('returns [] for null/undefined/empty input', () => {
    expect(parseEntityCodes(null)).toEqual([]);
    expect(parseEntityCodes(undefined)).toEqual([]);
    expect(parseEntityCodes('')).toEqual([]);
  });

  it('returns [] for malformed JSON instead of throwing', () => {
    expect(parseEntityCodes('not json')).toEqual([]);
    expect(parseEntityCodes('["unterminated')).toEqual([]);
  });

  it('returns [] when the JSON is valid but not a string array', () => {
    expect(parseEntityCodes('{"a":1}')).toEqual([]);
    expect(parseEntityCodes('[1,2,3]')).toEqual([]);
    expect(parseEntityCodes('"MERID"')).toEqual([]);
  });
});
