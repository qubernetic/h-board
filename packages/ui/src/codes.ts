import { jumpCode } from '@h-board/core';
import type { KeyPress } from './keys';

/** What a key does while the codes show. */
export type CodeStep =
  | { readonly kind: 'open'; readonly index: number; readonly background: boolean }
  | { readonly kind: 'narrow'; readonly typed: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'hold' }
  /** The page's own keys take the key; `keep`: the codes stay, for the next group. */
  | { readonly kind: 'pass'; readonly keep: boolean };

/** The step for a key while the codes of `count` cards show and `typed` is typed so far. */
export function codeStep(typed: string, press: KeyPress, count: number): CodeStep {
  const { key } = press;
  if (key === 'Shift') return { kind: 'hold' };
  if (press.ctrlKey || press.metaKey || press.altKey) return { kind: 'pass', keep: false };
  if (/^[1-9]$/.test(key) || key === 'ArrowDown' || key === 'ArrowUp') return { kind: 'pass', keep: true };
  const next = typed + (key.length === 1 ? key.toLowerCase() : '\0');
  let narrows = false;
  for (let i = 0; i < count; i += 1) {
    const code = jumpCode(i, count);
    if (code === next) return { kind: 'open', index: i, background: press.shiftKey };
    if (code.startsWith(next)) narrows = true;
  }
  // Escape, or a letter no card has
  return narrows ? { kind: 'narrow', typed: next } : { kind: 'cancel' };
}
