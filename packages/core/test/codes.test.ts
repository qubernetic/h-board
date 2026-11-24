import { describe, expect, it } from 'vitest';
import { CODE_LETTERS, jumpCode } from '../src/index';

describe('jumpCode', () => {
  it('gives each card a letter, home row first', () => {
    expect(CODE_LETTERS).toHaveLength(26);
    expect([0, 1, 2, 3, 9, 25].map((i) => jumpCode(i, 26))).toEqual(['a', 's', 'd', 'f', 'q', 'm']);
  });

  it('gives two letters to every card of a group with more cards than letters', () => {
    expect(jumpCode(0, 29)).toBe('aa');
    expect(jumpCode(1, 29)).toBe('as');
    expect(jumpCode(26, 29)).toBe('sa');
    expect(jumpCode(28, 29)).toBe('sd');
  });
});
