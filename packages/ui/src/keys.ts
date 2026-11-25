/** What a key asks the page to do. */
export type KeyAction =
  | { readonly kind: 'search' }
  | { readonly kind: 'jump'; readonly index: number }
  | { readonly kind: 'step'; readonly by: 1 | -1 }
  | { readonly kind: 'density'; readonly by: 1 | -1 }
  | { readonly kind: 'edit' }
  | { readonly kind: 'standby' }
  | { readonly kind: 'codes' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'restore' };

/** The part of a key event that decides the action. `typing`: the focus is in a text field. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly typing: boolean;
  /** The key is held down and repeats. */
  readonly repeat?: boolean;
}

/** The actions of the page that have a key. */
export type KeyId = 'group' | 'jump' | 'search' | 'edit' | 'standby' | 'codes' | 'undo' | 'density' | 'restore';

/** An action that has a key, as the status bar and the tooltips name it. */
export interface KeyBinding {
  readonly id: string;
  readonly keys: string;
  readonly does: string;
  /** Left out of the status bar's hints; the key still works and the tooltips still name it. */
  readonly quiet?: boolean;
}

/** Every key the page answers, in the order the status bar names them. The tooltips read their keys from here. */
export const KEYMAP: readonly KeyBinding[] = [
  { id: 'group', keys: '↕ wheel', does: 'group' },
  { id: 'jump', keys: '1–8', does: 'jump' },
  { id: 'search', keys: '/', does: 'search' },
  { id: 'edit', keys: 'e', does: 'edit' },
  { id: 'standby', keys: 's', does: 'standby' },
  { id: 'codes', keys: 'f', does: 'jump code' },
  { id: 'undo', keys: 'z', does: 'undo' },
  { id: 'density', keys: '[ ]', does: 'density' },
  // the status bar's sign opens the panel too, so the hints leave it out, as the mock does
  { id: 'restore', keys: 'v', does: 'restore', quiet: true },
];

/** The keys while the jump codes show, in the order the status bar names them. */
export const CODE_KEYMAP: readonly KeyBinding[] = [
  { id: 'open', keys: 'letter', does: 'open' },
  { id: 'background', keys: 'shift', does: 'background tab' },
  { id: 'jump', keys: '1–8', does: 'other group' },
  { id: 'cancel', keys: 'esc', does: 'cancel' },
];

/** The keys of the action `id`, for a tooltip or a label. */
export function keysOf(id: KeyId): string {
  return (KEYMAP.find((entry) => entry.id === id) as KeyBinding).keys;
}

/** The number keys for `groups` groups. */
function numbers(groups: number): string {
  const last = Math.min(9, groups);
  return last > 1 ? `1–${last}` : '1';
}

const hint = ({ id, keys, does }: KeyBinding, groups: number): string =>
  `${id === 'jump' ? numbers(groups) : keys}: ${does}`;

/** The status bar's key hints, with the number keys for `groups` groups. */
export function keyHints(groups: number): string[] {
  return KEYMAP.filter((entry) => !entry.quiet).map((entry) => hint(entry, groups));
}

/** The status bar's key hints while the codes show; `typed`, the letters typed so far, takes the first place. */
export function codeHints(groups: number, typed: string): string[] {
  return CODE_KEYMAP.map((entry) => (entry.id === 'open' && typed ? `${typed}…` : hint(entry, groups)));
}

/** The action for a key, or `null` when the page leaves the key to the browser. */
export function keyAction(press: KeyPress, groups: number): KeyAction | null {
  const { key } = press;
  if (press.typing || press.altKey) return null;
  // Ctrl+Z, or Cmd+Z on a Mac, undoes as z does; with Shift it means redo elsewhere, so the browser keeps it
  if (press.ctrlKey || press.metaKey) return !press.shiftKey && (key === 'z' || key === 'Z') ? { kind: 'undo' } : null;
  if (key === 'e' || key === 'E') return { kind: 'edit' };
  if (key === 's' || key === 'S') return { kind: 'standby' };
  if (key === 'f' || key === 'F') return press.repeat ? null : { kind: 'codes' };
  if (key === 'z' || key === 'Z') return { kind: 'undo' };
  if (key === 'v' || key === 'V') return press.repeat ? null : { kind: 'restore' };
  if (key === '/') return { kind: 'search' };
  if (/^[1-9]$/.test(key) && Number(key) <= groups) return { kind: 'jump', index: Number(key) - 1 };
  if (key === 'ArrowDown') return { kind: 'step', by: 1 };
  if (key === 'ArrowUp') return { kind: 'step', by: -1 };
  if (key === ']') return { kind: 'density', by: 1 };
  if (key === '[') return { kind: 'density', by: -1 };
  return null;
}
