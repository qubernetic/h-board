// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import type { Motion } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { fakeFrames, flush, mount, part, press } from './mount';

/** A board on the sample library at the motion level `motion`, with a clock that moves when told. */
async function at(motion: Motion, idleMs?: number) {
  const library = sampleLibrary();
  const frames = fakeFrames();
  const { main, store } = await mount(
    { ...library, settings: { ...library.settings, motion } },
    { frames, systemReducedMotion: () => false, random: () => 0.5, ...(idleMs ? { idleMs } : {}) },
  );
  const page = part(main, 'page');
  const start = page.querySelector<HTMLElement>('.hb-start') as HTMLElement;
  const standby = part(main, 'standby');
  const shown = (): 'standby' | 'start' | 'moving' =>
    page.hasAttribute('data-sb-anim') ? 'moving' : page.hasAttribute('data-standby') ? 'standby' : 'start';
  return { main, store, frames, page, start, standby, shown };
}

const lens = (main: HTMLElement): string | null => part(main, 'lens-name').textContent;
const field = (main: HTMLElement): HTMLCanvasElement => main.querySelector('canvas.hb-field') as HTMLCanvasElement;

describe('home · standby', () => {
  it('shows the clock, the date and the next to-do of the drawing', async () => {
    const { main, shown } = await at('none');
    press('s');
    expect(shown()).toBe('standby');
    expect(part(main, 'standby-time').textContent).toBe('14:32');
    expect(part(main, 'standby-date').textContent).toBe('Monday, 23 November');
    expect(part(main, 'standby-next').textContent).toBe('next: Client: review the quote');
    expect(part(main, 'standby').textContent).toContain('Home · standby · after 5 minutes idle');
    expect(part(main, 'standby').textContent).toContain('any key or mouse movement: back');
  });

  it('places the drawing at its own size on a 1440 x 900 page', async () => {
    const { main } = await at('none');
    const time = part(main, 'standby-time');
    expect([time.style.left, time.style.top, time.style.fontSize]).toEqual(['930px', '280px', '150px']);
    expect(part(main, 'standby-next').style.top).toBe('610px');
  });

  it('none: changes at once, both ways, and the field holds still', async () => {
    const { main, shown } = await at('none');
    expect(field(main).dataset['live']).toBe('false');
    press('s');
    expect(shown()).toBe('standby');
    expect(field(main).dataset['live']).toBe('false');
    press('x');
    expect(shown()).toBe('start');
  });

  it('reduced: a 150 ms crossfade both ways, the trail only on standby', async () => {
    const { main, frames, start, standby, shown } = await at('reduced');
    expect(field(main).dataset['live']).toBe('false');
    press('s');
    expect(shown()).toBe('moving');
    frames.advance(80);
    expect(Number(start.style.opacity)).toBeCloseTo(1 - 80 / 150, 2);
    expect(Number(standby.style.opacity)).toBeCloseTo(80 / 150, 2);
    frames.advance(80);
    expect(shown()).toBe('standby');
    expect(start.style.opacity).toBe('');
    expect(field(main).dataset['live']).toBe('true');
    press('x');
    expect(shown()).toBe('moving');
    frames.advance(160);
    expect(shown()).toBe('start');
    expect(field(main).dataset['live']).toBe('false');
  });

  it('full: 920 ms in and 640 ms out, and the trail on the start page too', async () => {
    const { main, frames, shown } = await at('full');
    expect(field(main).dataset['live']).toBe('true');
    press('s');
    frames.advance(900);
    expect(shown()).toBe('moving');
    frames.advance(32);
    expect(shown()).toBe('standby');
    press('x');
    frames.advance(620);
    expect(shown()).toBe('moving');
    frames.advance(32);
    expect(shown()).toBe('start');
  });

  it('full: the start page dissolves into glyphs on the way in and writes itself back on the way out', async () => {
    const { main, frames } = await at('full');
    const todo = main.querySelector('[data-part="todo"] li') as HTMLElement;
    press('s');
    frames.advance(200);
    expect(main.querySelector('.dz')).not.toBeNull();
    frames.advance(800);
    expect(todo.textContent).toBe('Client: review the quote');
    expect(main.querySelector('.dz')).toBeNull();
  });

  it('a key on the way in brings the start page back at once, and acts at once on the way out', async () => {
    const { main, frames, shown } = await at('full');
    press('s');
    frames.advance(300);
    press('x');
    expect(shown()).toBe('start');
    press('s');
    frames.advance(1000);
    expect(shown()).toBe('standby');
    press('x');
    frames.advance(100);
    expect(shown()).toBe('moving');
    press('3');
    expect(shown()).toBe('start');
    expect(lens(main)).toBe('Qubernetic');
  });

  it('a key on standby only wakes the page; a modifier alone does not', async () => {
    const { main, shown } = await at('none');
    press('s');
    press('Shift');
    expect(shown()).toBe('standby');
    press('3');
    expect(shown()).toBe('start');
    expect(lens(main)).toBe('Development');
  });

  it('goes to standby after the idle time without input', async () => {
    const { frames, shown } = await at('none', 1000);
    frames.advance(1000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(shown()).toBe('standby');
  });

  it('wakes on a click, on the wheel, and on a pointer movement away from the mark after the first second', async () => {
    const { page, frames, shown } = await at('none');
    press('s');
    document.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
    expect(shown()).toBe('start');
    press('s');
    page.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(shown()).toBe('start');
    press('s');
    const move = (x: number, y: number): void => {
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    };
    move(1200, 700);
    move(1300, 800);
    expect(shown()).toBe('standby');
    frames.advance(1000);
    move(1200, 700);
    move(1210, 705);
    expect(shown()).toBe('standby');
    move(1300, 800);
    expect(shown()).toBe('start');
  });

  it('closes the settings and ends edit mode on the way in', async () => {
    const { main, page } = await at('none');
    part(main, 'settings').click();
    press('e');
    press('s');
    expect(part(main, 'settings-panel').hidden).toBe(true);
    expect(page.hasAttribute('data-editing')).toBe(false);
    press('x');
    await flush();
  });
});
