import { describe, expect, it } from 'vitest';
import { codeStep, jumpCode } from '../src/codes';
import type { KeyPress } from '../src/keys';

const key = (k: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  typing: false,
  ...extra,
});

describe('jumpCode', () => {
  it('gives each card a letter, home row first', () => {
    expect([0, 1, 2, 3, 9, 25].map((i) => jumpCode(i, 26))).toEqual(['a', 's', 'd', 'f', 'q', 'm']);
  });

  it('gives two letters to every card of a group with more cards than letters', () => {
    expect(jumpCode(0, 29)).toBe('aa');
    expect(jumpCode(1, 29)).toBe('as');
    expect(jumpCode(26, 29)).toBe('sa');
    expect(jumpCode(28, 29)).toBe('sd');
  });
});

describe('codeStep', () => {
  it('opens the card whose code the letter completes, behind this tab with Shift', () => {
    expect(codeStep('', key('d'), 7)).toEqual({ kind: 'open', index: 2, background: false });
    expect(codeStep('', key('D', { shiftKey: true }), 7)).toEqual({ kind: 'open', index: 2, background: true });
    expect(codeStep('s', key('a'), 29)).toEqual({ kind: 'open', index: 26, background: false });
  });

  it('narrows the cards with the first letter of a two-letter code', () => {
    expect(codeStep('', key('s'), 29)).toEqual({ kind: 'narrow', typed: 's' });
  });

  it('cancels on Escape and on a letter no card has', () => {
    expect(codeStep('', key('Escape'), 7)).toEqual({ kind: 'cancel' });
    expect(codeStep('', key('m'), 7)).toEqual({ kind: 'cancel' });
    expect(codeStep('s', key('m'), 29)).toEqual({ kind: 'cancel' });
    expect(codeStep('', key('Enter'), 7)).toEqual({ kind: 'cancel' });
  });

  it('waits on Shift alone, for the letter that comes with it', () => {
    expect(codeStep('', key('Shift', { shiftKey: true }), 7)).toEqual({ kind: 'hold' });
  });

  it('lets a group key through and keeps the codes for the next group', () => {
    expect(codeStep('s', key('4'), 29)).toEqual({ kind: 'pass', keep: true });
    expect(codeStep('', key('ArrowDown'), 29)).toEqual({ kind: 'pass', keep: true });
    expect(codeStep('', key('ArrowUp'), 29)).toEqual({ kind: 'pass', keep: true });
  });

  it('puts the codes away and lets a key with Ctrl, Cmd or Alt through', () => {
    expect(codeStep('', key('z', { ctrlKey: true }), 7)).toEqual({ kind: 'pass', keep: false });
    expect(codeStep('', key('a', { metaKey: true }), 7)).toEqual({ kind: 'pass', keep: false });
    expect(codeStep('', key('a', { altKey: true }), 7)).toEqual({ kind: 'pass', keep: false });
  });
});
