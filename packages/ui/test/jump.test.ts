// @vitest-environment happy-dom
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { describe, expect, it, vi } from 'vitest';
import { flush, mount, part, press } from './mount';

const library = sampleLibrary();
const urlOf = (group: number, site: number): string => library.groups[group]?.sites[site]?.url as string;
const codes = (main: HTMLElement): string[] =>
  [...main.querySelectorAll('[data-part="grid"] .card .hk')].map((node) => node.textContent ?? '');
const showing = (main: HTMLElement): boolean => part(main, 'page').dataset['codes'] !== undefined;

describe('jump codes', () => {
  it('shows a code on every card with f, and the status bar names the keys of the codes', async () => {
    const { main } = await mount();
    expect(showing(main)).toBe(false);
    // Development has 29 sites, more than the letters, so every code has two
    expect(codes(main).slice(0, 3)).toEqual(['aa', 'as', 'ad']);
    expect(codes(main)).toHaveLength(29);
    press('f');
    expect(showing(main)).toBe(true);
    expect(part(main, 'keys').textContent).toBe(
      'letter: open   shift: background tab   1–8: other group   esc: cancel',
    );
    press('3');
    expect(codes(main)).toEqual(['a', 's', 'd', 'f', 'g', 'h', 'j']);
    expect(showing(main)).toBe(true);
  });

  it('opens the card of the letter, and the codes go away', async () => {
    const open = vi.fn();
    const { main } = await mount(undefined, { open });
    press('3');
    press('f');
    press('d');
    expect(open).toHaveBeenCalledWith(urlOf(2, 2));
    expect(showing(main)).toBe(false);
    expect(part(main, 'keys').textContent).toContain('f: jump code');
    expect(main.querySelector('[data-part="grid"] .card[data-index="2"]')?.classList.contains('fired')).toBe(true);
  });

  it('opens a card of another group with f, its number and its letter', async () => {
    const open = vi.fn();
    const { main } = await mount(undefined, { open });
    press('f');
    press('3');
    press('a');
    expect(open).toHaveBeenCalledWith(urlOf(2, 0));
    expect(part(main, 'lens-name').textContent).toBe('Qubernetic');
  });

  it('narrows the cards to a typed first letter and opens with the second', async () => {
    const open = vi.fn();
    const { main } = await mount(undefined, { open });
    press('f');
    press('s');
    const off = main.querySelectorAll('[data-part="grid"] .card.off');
    // the three cards whose code starts with s are left
    expect(off).toHaveLength(26);
    expect(part(main, 'keys').textContent).toContain('s…');
    press('d');
    expect(open).toHaveBeenCalledWith(urlOf(1, 28));
    expect(main.querySelectorAll('[data-part="grid"] .card.off')).toHaveLength(0);
  });

  it('opens behind this tab with Shift, and in a new tab where the page cannot choose', async () => {
    const open = vi.fn();
    const openBehind = vi.fn();
    await mount(undefined, { open, openBehind });
    press('3');
    press('f');
    press('Shift', { shiftKey: true });
    press('S', { shiftKey: true });
    expect(openBehind).toHaveBeenCalledWith(urlOf(2, 1));
    expect(open).not.toHaveBeenCalled();
    document.body.replaceChildren();

    const plain = vi.fn();
    await mount(undefined, { open: plain });
    press('3');
    press('f');
    press('A', { shiftKey: true });
    expect(plain).toHaveBeenCalledWith(urlOf(2, 0));
  });

  it('puts the codes away with Escape, a letter no card has, a click or Ctrl', async () => {
    const open = vi.fn();
    const { main } = await mount(undefined, { open });
    press('3');
    for (const away of [
      () => press('Escape'),
      () => press('m'),
      () => part(main, 'grid').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })),
      () => press('c', { ctrlKey: true }),
    ]) {
      press('f');
      expect(showing(main)).toBe(true);
      away();
      expect(showing(main)).toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
    // the key after a cancel is the page's own again
    press('e');
    expect(part(main, 'page').dataset['editing']).toBe('');
  });

  it('shows no codes in edit mode, in an empty group or while the user types', async () => {
    const { main } = await mount();
    press('e');
    press('f');
    expect(showing(main)).toBe(false);
    expect(codes(main)).toEqual([]);
    press('e');
    main.querySelector('input')?.focus();
    press('f', {}, main.querySelector('input') as HTMLElement);
    expect(showing(main)).toBe(false);

    const { main: empty } = await mount(emptyLibrary());
    press('f');
    expect(showing(empty)).toBe(false);
  });

  it('puts the codes away when the next group is empty, and with Alt', async () => {
    const { main } = await mount(withEmptyGroup());
    press('8');
    press('f');
    press('ArrowDown');
    expect(part(main, 'lens-name').textContent).toBe('Nothing yet');
    expect(showing(main)).toBe(false);
    press('1');
    press('f');
    press('s', { altKey: true });
    expect(showing(main)).toBe(false);
  });

  it('opens nothing for a card whose address is no web address', async () => {
    const open = vi.fn();
    const bad = sampleLibrary();
    const group = bad.groups[2] as Library['groups'][number];
    const odd = { ...(group.sites[0] as Library['groups'][number]['sites'][number]), url: 'javascript:alert(1)' };
    const lib: Library = { ...bad, groups: bad.groups.map((g, i) => (i === 2 ? { ...g, sites: [odd, ...g.sites.slice(1)] } : g)) };
    const { main } = await mount(lib, { open });
    press('3');
    press('f');
    press('a');
    expect(open).not.toHaveBeenCalled();
    expect(showing(main)).toBe(false);
  });

  it('keeps the codes after a turn of the wheel, with nothing typed', async () => {
    const { main } = await mount();
    press('f');
    press('s');
    part(main, 'page').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    await flush();
    expect(part(main, 'lens-name').textContent).toBe('Qubernetic');
    expect(showing(main)).toBe(true);
    expect(main.querySelectorAll('[data-part="grid"] .card.off')).toHaveLength(0);
  });
});

describe('the tooltips', () => {
  it('read their keys from the keymap', async () => {
    const { main } = await mount();
    expect(part(main, 'density').title).toBe('Next density ([ ])');
    expect(part(main, 'search-kbd').textContent).toBe('/');
    expect(part(main, 'edit-note').textContent).toContain('e: done');
  });
});

/** The sample library with a ninth group that has no sites, after the last one. */
function withEmptyGroup(): Library {
  const lib = sampleLibrary();
  return { ...lib, groups: [...lib.groups, { ...(lib.groups[0] as Library['groups'][number]), id: 'g-empty', name: 'Nothing yet', sites: [] }] };
}
