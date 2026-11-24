// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleLibrary } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { MOVEMENTS, motionLevel } from '../src/motion';
import { flush, mount, part } from './mount';

describe('the motion level', () => {
  it('is the setting, but none while the system asks for less motion and the user has not picked one', () => {
    expect(motionLevel('reduced', false, false)).toBe('reduced');
    expect(motionLevel('full', false, false)).toBe('full');
    expect(motionLevel('reduced', true, false)).toBe('none');
    expect(motionLevel('full', true, false)).toBe('none');
    expect(motionLevel('reduced', true, true)).toBe('reduced');
    expect(motionLevel('full', true, true)).toBe('full');
  });

  it('names every movement once, from M1 on, with its three levels', () => {
    expect(MOVEMENTS.map((movement) => movement.id)).toEqual(MOVEMENTS.map((_, i) => `M${i + 1}`));
    for (const movement of MOVEMENTS) {
      expect(movement.what).not.toBe('');
      for (const level of ['full', 'reduced', 'none'] as const) expect(movement[level]).not.toBe('');
    }
  });
});

describe('MOTION.md', () => {
  it('lists every movement with its full, reduced and none behaviour, as the page has them', () => {
    const doc = readFileSync(join(import.meta.dirname, '..', 'MOTION.md'), 'utf8');
    const rows = doc
      .split('\n')
      .filter((line) => /^\| M\d+ \|/.test(line))
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
    expect(rows).toEqual(MOVEMENTS.map((m) => [m.id, m.what, m.full, m.reduced, m.none]));
  });
});

describe('the motion setting', () => {
  it('is reduced by default and shows on the page as one flag', async () => {
    const { main } = await mount();
    expect(part(main, 'page').dataset['motion']).toBe('reduced');
  });

  it('is none when the system asks for less motion, until the user picks a level in the settings', async () => {
    const { main, store } = await mount(undefined, { systemReducedMotion: () => true });
    const page = part(main, 'page');
    expect(page.dataset['motion']).toBe('none');
    part(main, 'settings').click();
    const panel = part(main, 'settings-panel');
    const pressed = (): string[] =>
      [...panel.querySelectorAll<HTMLElement>('[data-motion][aria-pressed="true"]')].map((b) => b.dataset['motion'] ?? '');
    expect(pressed()).toEqual(['none']);
    panel.querySelector<HTMLButtonElement>('[data-motion="reduced"]')?.click();
    await flush();
    expect(page.dataset['motion']).toBe('reduced');
    expect(pressed()).toEqual(['reduced']);
    panel.querySelector<HTMLButtonElement>('[data-motion="full"]')?.click();
    await flush();
    expect(page.dataset['motion']).toBe('full');
    expect((await store.load()).library.settings.motion).toBe('full');
  });

  it('counts a level other than the default in the library as picked', async () => {
    const library = sampleLibrary();
    const { main } = await mount(
      { ...library, settings: { ...library.settings, motion: 'full' } },
      { systemReducedMotion: () => true },
    );
    expect(part(main, 'page').dataset['motion']).toBe('full');
  });
});
