import { describe, expect, it } from 'vitest';
import { clockParts, isoWeek, standbyDate } from '../src/clock';

describe('the clock', () => {
  it('writes the hero line of the drawing', () => {
    expect(clockParts(new Date(2026, 10, 23, 14, 32, 7))).toEqual({
      date: 'Monday · 23 November 2026 · week 48',
      time: '14:32',
      seconds: ':07',
    });
    expect(clockParts(new Date(2027, 0, 3, 9, 5, 0))).toEqual({
      date: 'Sunday · 3 January 2027 · week 53',
      time: '09:05',
      seconds: ':00',
    });
  });

  it('writes the date of home · standby', () => {
    expect(standbyDate(new Date(2026, 10, 23, 14, 32))).toBe('Monday, 23 November');
  });

  it('counts ISO weeks', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1);
  });
});
