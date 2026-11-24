/** What a key asks the page to do. */
export type KeyAction =
  | { readonly kind: 'search' }
  | { readonly kind: 'jump'; readonly index: number }
  | { readonly kind: 'step'; readonly by: 1 | -1 }
  | { readonly kind: 'density'; readonly by: 1 | -1 }
  | { readonly kind: 'edit' }
  | { readonly kind: 'undo' };

/** The part of a key event that decides the action. `typing`: the focus is in a text field. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly typing: boolean;
}

/** Every key the page answers, in the order the status bar names them. Later slices add theirs here. */
export const KEYMAP: readonly { readonly keys: string; readonly does: string }[] = [
  { keys: '↕ wheel', does: 'group' },
  { keys: '1–8', does: 'jump' },
  { keys: '/', does: 'search' },
  { keys: 'e', does: 'edit' },
  { keys: 'z', does: 'undo' },
  { keys: '[ ]', does: 'density' },
];

/** The status bar's key hints, with the number keys for `groups` groups. */
export function keyHints(groups: number): string[] {
  const last = Math.min(9, groups);
  const numbers = last > 1 ? `1–${last}` : '1';
  return KEYMAP.map(({ keys, does }) => `${keys === '1–8' ? numbers : keys}: ${does}`);
}

/** The action for a key, or `null` when the page leaves the key to the browser. */
export function keyAction(press: KeyPress, groups: number): KeyAction | null {
  const { key } = press;
  if (press.typing || press.altKey) return null;
  // Ctrl+Z, or Cmd+Z on a Mac, undoes as z does
  if (press.ctrlKey || press.metaKey) return key === 'z' || key === 'Z' ? { kind: 'undo' } : null;
  if (key === 'e' || key === 'E') return { kind: 'edit' };
  if (key === 'z' || key === 'Z') return { kind: 'undo' };
  if (key === '/') return { kind: 'search' };
  if (/^[1-9]$/.test(key) && Number(key) <= groups) return { kind: 'jump', index: Number(key) - 1 };
  if (key === 'ArrowDown') return { kind: 'step', by: 1 };
  if (key === 'ArrowUp') return { kind: 'step', by: -1 };
  if (key === ']') return { kind: 'density', by: 1 };
  if (key === '[') return { kind: 'density', by: -1 };
  return null;
}
