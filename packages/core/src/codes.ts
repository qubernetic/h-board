/** The letters of the jump codes, home row first. */
export const CODE_LETTERS = 'asdfghjklqwertyuiopzxcvbnm';

/**
 * The jump code of the card at `index` among `count` cards: one letter, or two for every card of a group with more
 * cards than letters. Codes follow the order of the cards, so they stay the same from day to day.
 */
export function jumpCode(index: number, count: number): string {
  const n = CODE_LETTERS.length;
  if (count <= n) return CODE_LETTERS.charAt(index);
  return CODE_LETTERS.charAt(Math.floor(index / n)) + CODE_LETTERS.charAt(index % n);
}
