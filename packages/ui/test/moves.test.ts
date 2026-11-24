// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import type { Motion } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { Moves, spring } from '../src/moves';
import { click, fakeFrames, flush, mount, names, part, press } from './mount';

async function at(motion: Motion) {
  const library = sampleLibrary();
  const frames = fakeFrames();
  const mounted = await mount(
    { ...library, settings: { ...library.settings, motion } },
    { frames, systemReducedMotion: () => false, random: () => 0.5 },
  );
  return { ...mounted, frames, grid: part(mounted.main, 'grid') };
}

const firstName = (grid: HTMLElement): string | null | undefined => grid.querySelector('.card .name')?.textContent;
const deleteFirst = (grid: HTMLElement): void => click(grid.querySelector('.card.ed [data-act="delete"]'));

describe('M4: switching groups', () => {
  it('full: the drum springs and the cards write their text out in 240 ms', async () => {
    const { main, frames, grid } = await at('full');
    press('3');
    expect(firstName(grid)).not.toBe('brand');
    const row = part(main, 'rail').querySelector<HTMLElement>('.drum-row');
    expect(row?.style.transform).toMatch(/^translateY\(44(\.0)?px\)$/);
    frames.advance(240);
    expect(firstName(grid)).toBe('brand');
    frames.advance(100);
    expect(row?.style.transform).toBe('');
  });

  it('reduced: the drum springs and the cards fade in', async () => {
    const { main, frames, grid } = await at('reduced');
    press('3');
    expect(firstName(grid)).toBe('brand');
    expect(grid.style.opacity).toBe('0');
    expect(part(main, 'rail').querySelector<HTMLElement>('.drum-row')?.style.transform).not.toBe('');
    frames.advance(160);
    expect(grid.style.opacity).toBe('');
  });

  it('none: at once', async () => {
    const { main, grid } = await at('none');
    press('3');
    expect(firstName(grid)).toBe('brand');
    expect(grid.style.opacity).toBe('');
    expect(part(main, 'rail').querySelector<HTMLElement>('.drum-row')?.style.transform).toBe('');
  });

  it('a key during the movement ends it at once', async () => {
    const { grid } = await at('full');
    press('3');
    expect(firstName(grid)).not.toBe('brand');
    press('x');
    expect(firstName(grid)).toBe('brand');
  });

  it('springs with a small overshoot and settles on its place', () => {
    expect(spring(0)).toBeCloseTo(0);
    expect(spring(1)).toBe(1);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(spring))).toBeGreaterThan(1);
  });
});

describe('M5: density', () => {
  it('full: each card travels from its old place and size to its new one in 300 ms', () => {
    const frames = fakeFrames();
    const moves = new Moves(frames, () => 0.5);
    const grid = document.createElement('div');
    const card = document.createElement('a');
    card.className = 'card';
    card.dataset['index'] = '0';
    const still = document.createElement('a');
    still.className = 'card';
    still.dataset['index'] = '1';
    grid.append(card, still);
    let box = { left: 100, top: 100, width: 200, height: 100 };
    const rect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) as DOMRect;
    card.getBoundingClientRect = rect;
    still.getBoundingClientRect = () => ({ left: 0, top: 0, width: 50, height: 50, right: 50, bottom: 50 }) as DOMRect;
    const from = moves.rects(grid);
    box = { left: 150, top: 120, width: 100, height: 50 };
    moves.flip(grid, from, 'full');
    expect(card.style.transform).toBe('translate(-50.0px, -20.0px) scale(2.0000, 2.0000)');
    expect(still.style.transform).toBe('');
    expect(moves.running).toBe(true);
    frames.advance(320);
    expect(card.style.transform).toBe('');
    expect(moves.running).toBe(false);
  });

  it('reduced: the cards fade in at their new place in 125 ms', async () => {
    const { frames, grid } = await at('reduced');
    press(']');
    await flush();
    expect(grid.style.opacity).toBe('0');
    frames.advance(128);
    expect(grid.style.opacity).toBe('');
  });

  it('none: at once', async () => {
    const { grid } = await at('none');
    press(']');
    await flush();
    expect(grid.style.opacity).toBe('');
  });
});

describe('M6: delete and undo', () => {
  for (const [motion, ms, runs] of [
    ['full', 200, true],
    ['reduced', 150, false],
  ] as const) {
    it(`${motion}: the card ${runs ? 'runs out' : 'fades'} in ${ms} ms, then goes; the toast has a time bar`, async () => {
      const { main, frames, grid } = await at(motion);
      press('e');
      deleteFirst(grid);
      const card = grid.querySelector<HTMLElement>('.card') as HTMLElement;
      frames.advance(96);
      expect(Number(card.style.opacity)).toBeLessThan(1);
      expect(card.style.transform !== '').toBe(runs);
      expect(names(main)).toContain('github');
      frames.advance(ms);
      await flush();
      expect(names(main)).not.toContain('github');
      expect(part(main, 'toast').querySelector('.bar')).not.toBeNull();
    });
  }

  it('none: the card goes at once', async () => {
    const { main, grid } = await at('none');
    press('e');
    deleteFirst(grid);
    await flush();
    expect(names(main)).not.toContain('github');
    expect(part(main, 'page').dataset['motion']).toBe('none');
  });

  it('z during the movement deletes at once and takes the delete back', async () => {
    const { main, frames, grid } = await at('full');
    press('e');
    deleteFirst(grid);
    frames.advance(32);
    press('z');
    await flush();
    // the card comes back the way a group switch draws it
    frames.advance(240);
    expect(names(main)[0]).toBe('github');
    expect(names(main)).toHaveLength(29);
    expect(part(main, 'toast').textContent).toContain('undone');
  });
});
