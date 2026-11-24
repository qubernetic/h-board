import { describe, expect, it } from 'vitest';
import { KEYMAP, codeHints, keyAction, keyHints, keysOf } from '../src/keys';

const key = (k: string, extra: Partial<Parameters<typeof keyAction>[0]> = {}): Parameters<typeof keyAction>[0] => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  typing: false,
  ...extra,
});

describe('keyAction', () => {
  it('jumps to a group by its number', () => {
    expect(keyAction(key('1'), 8)).toEqual({ kind: 'jump', index: 0 });
    expect(keyAction(key('8'), 8)).toEqual({ kind: 'jump', index: 7 });
    expect(keyAction(key('9'), 8)).toBeNull();
    expect(keyAction(key('0'), 8)).toBeNull();
  });

  it('steps through the groups with the arrow keys', () => {
    expect(keyAction(key('ArrowDown'), 8)).toEqual({ kind: 'step', by: 1 });
    expect(keyAction(key('ArrowUp'), 8)).toEqual({ kind: 'step', by: -1 });
  });

  it('changes the density with the brackets', () => {
    expect(keyAction(key(']'), 8)).toEqual({ kind: 'density', by: 1 });
    expect(keyAction(key('['), 8)).toEqual({ kind: 'density', by: -1 });
  });

  it('puts the focus into the search line with /', () => {
    expect(keyAction(key('/'), 8)).toEqual({ kind: 'search' });
    expect(keyAction(key('/', { typing: true }), 8)).toBeNull();
  });

  it('leaves a key alone while the user types or holds a modifier', () => {
    expect(keyAction(key('2', { typing: true }), 8)).toBeNull();
    expect(keyAction(key('ArrowDown', { ctrlKey: true }), 8)).toBeNull();
    expect(keyAction(key('2', { metaKey: true }), 8)).toBeNull();
    expect(keyAction(key('2', { altKey: true }), 8)).toBeNull();
    expect(keyAction(key('x'), 8)).toBeNull();
  });

  it('turns edit mode on and off with e, and undoes with z or Ctrl+Z', () => {
    expect(keyAction(key('e'), 8)).toEqual({ kind: 'edit' });
    expect(keyAction(key('E'), 8)).toEqual({ kind: 'edit' });
    expect(keyAction(key('z'), 8)).toEqual({ kind: 'undo' });
    expect(keyAction(key('z', { ctrlKey: true }), 8)).toEqual({ kind: 'undo' });
    expect(keyAction(key('z', { metaKey: true }), 8)).toEqual({ kind: 'undo' });
    expect(keyAction(key('Z', { ctrlKey: true, shiftKey: true }), 8)).toBeNull();
    expect(keyAction(key('z', { metaKey: true, shiftKey: true }), 8)).toBeNull();
    expect(keyAction(key('z', { ctrlKey: true, altKey: true }), 8)).toBeNull();
    expect(keyAction(key('z', { ctrlKey: true, typing: true }), 8)).toBeNull();
    expect(keyAction(key('e', { typing: true }), 8)).toBeNull();
  });

  it('shows the jump codes with f, once per press', () => {
    expect(keyAction(key('f'), 8)).toEqual({ kind: 'codes' });
    expect(keyAction(key('F'), 8)).toEqual({ kind: 'codes' });
    expect(keyAction(key('f', { repeat: true }), 8)).toBeNull();
    expect(keyAction(key('f', { typing: true }), 8)).toBeNull();
    expect(keyAction(key('f', { ctrlKey: true }), 8)).toBeNull();
  });

  it('goes to home and standby with s', () => {
    expect(keyAction(key('s'), 8)).toEqual({ kind: 'standby' });
    expect(keyAction(key('S'), 8)).toEqual({ kind: 'standby' });
    expect(keyAction(key('s', { typing: true }), 8)).toBeNull();
    expect(keyAction(key('s', { ctrlKey: true }), 8)).toBeNull();
  });

  it('opens and closes the restore panel with v, once per press', () => {
    expect(keyAction(key('v'), 8)).toEqual({ kind: 'restore' });
    expect(keyAction(key('V'), 8)).toEqual({ kind: 'restore' });
    expect(keyAction(key('v', { repeat: true }), 8)).toBeNull();
    expect(keyAction(key('v', { typing: true }), 8)).toBeNull();
    expect(keyAction(key('v', { ctrlKey: true }), 8)).toBeNull();
  });
});

describe('the keymap', () => {
  it('names every key the page answers; the status bar leaves out the restore panel, as the mock does', () => {
    expect(KEYMAP.map((entry) => entry.keys)).toEqual(['↕ wheel', '1–8', '/', 'e', 's', 'f', 'z', '[ ]', 'v']);
    expect(keyHints(8)).toEqual([
      '↕ wheel: group',
      '1–8: jump',
      '/: search',
      'e: edit',
      's: standby',
      'f: jump code',
      'z: undo',
      '[ ]: density',
    ]);
    expect(keyHints(3)).toContain('1–3: jump');
    expect(keyHints(1)).toContain('1: jump');
    expect(keyHints(12)).toContain('1–9: jump');
  });

  it('names the keys of the codes while they show, with what is typed so far', () => {
    expect(codeHints(8, '')).toEqual(['letter: open', 'shift: background tab', '1–8: other group', 'esc: cancel']);
    expect(codeHints(3, 's')).toEqual(['s…', 'shift: background tab', '1–3: other group', 'esc: cancel']);
  });

  it('gives the tooltips the keys of an action', () => {
    expect(keysOf('density')).toBe('[ ]');
    expect(keysOf('undo')).toBe('z');
    expect(keysOf('search')).toBe('/');
    expect(keysOf('edit')).toBe('e');
    expect(keysOf('codes')).toBe('f');
    expect(keysOf('restore')).toBe('v');
  });
});
