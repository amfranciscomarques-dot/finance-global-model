import { describe, expect, it } from 'vitest';
import { formatMonth } from './helpers';

describe('formatMonth', () => {
  it('formats a YYYY-MM period as short month + 2-digit year', () => {
    expect(formatMonth('2025-01', 'en-US')).toBe('Jan 25');
    expect(formatMonth('2025-12', 'en-US')).toBe('Dec 25');
  });

  it('respects the locale (de-DE)', () => {
    // de-DE renders "Jan." with a trailing period.
    expect(formatMonth('2025-01', 'de-DE')).toBe('Jan. 25');
  });

  it('passes the full-year anchor through instead of rendering "Invalid Date"', () => {
    // The first period from /api/forecast is a full-year actual ("2024 (FY)"),
    // which is not a parseable date — it must show verbatim, not "Invalid Date".
    expect(formatMonth('2024 (FY)', 'en-US')).toBe('2024 (FY)');
    expect(formatMonth('2024 (FY)', 'en-US')).not.toBe('Invalid Date');
  });
});
