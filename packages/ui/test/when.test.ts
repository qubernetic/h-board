import { describe, expect, it } from 'vitest';
import { lastUsed, logTime } from '../src/when';

/** Monday 23 November 2026, 14:32:07 on this computer's clock, as the design's frames. */
const NOW = new Date(2026, 10, 23, 14, 32, 7);
const at = (day: number, hours: number, minutes: number, seconds = 0): number => new Date(2026, 10, day, hours, minutes, seconds).getTime();

describe('lastUsed', () => {
  it.each([
    [null, 'never used'],
    [at(23, 14, 31, 40), 'last used just now'],
    [at(23, 14, 30, 0), 'last used 2 min ago'],
    [at(23, 13, 33, 0), 'last used 59 min ago'],
    [at(23, 9, 5), 'last used today, 09:05'],
    [at(22, 2, 0), 'last used yesterday, 02:00'],
    [at(18, 9, 15), 'last used Wed 09:15'],
    [at(16, 9, 15), 'last used 16 Nov'],
    [new Date(2025, 0, 3).getTime(), 'last used 3 Jan 2025'],
  ])('says %s as "%s"', (used, said) => {
    expect(lastUsed(used, NOW)).toBe(said);
  });

  it('counts a use a little ahead of this clock as just now', () => {
    expect(lastUsed(NOW.getTime() + 5000, NOW)).toBe('last used just now');
  });
});

describe('logTime', () => {
  it.each([
    [at(23, 11, 42, 7), '11:42:07'],
    [at(22, 2, 0, 2), 'Sun 02:00'],
    [at(17, 9, 12), 'Tue 09:12'],
    [at(16, 9, 12), '16 Nov'],
    [new Date(2025, 11, 31).getTime(), '31 Dec 2025'],
  ])('says %s as "%s"', (time, said) => {
    expect(logTime(time, NOW)).toBe(said);
  });
});
