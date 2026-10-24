import { describe, expect, test } from '@jest/globals';
import {
  addLocalDays,
  assertDateString,
  formatLocalDate,
  isValidDateString,
  parseLocalDate,
} from './dates';

describe('local calendar date boundaries', () => {
  test('calendar-day addition stays on local midnight across daylight-saving transitions', () => {
    const beforeSpringShift = parseLocalDate('2026-03-08');
    const afterSpringShift = parseLocalDate(addLocalDays('2026-03-08', 1));
    expect(formatLocalDate(afterSpringShift)).toBe('2026-03-09');
    expect(afterSpringShift.getHours()).toBe(0);
    expect(afterSpringShift.getTime() - beforeSpringShift.getTime()).toBe(23 * 60 * 60 * 1000);

    const beforeFallShift = parseLocalDate('2026-11-01');
    const afterFallShift = parseLocalDate(addLocalDays('2026-11-01', 1));
    expect(formatLocalDate(afterFallShift)).toBe('2026-11-02');
    expect(afterFallShift.getHours()).toBe(0);
    expect(afterFallShift.getTime() - beforeFallShift.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  test('validates leap dates and rejects impossible or malformed values', () => {
    expect(assertDateString('2024-02-29')).toBe('2024-02-29');
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2026-04-31')).toBe(false);
    expect(isValidDateString('2026-2-01')).toBe(false);
    expect(() => assertDateString('2026-13-01')).toThrow(RangeError);
  });
});
