// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import type { Motion } from '@h-board/core';
import { describe, expect, it, vi } from 'vitest';
import type { FieldView } from '../src/field-view';
import { Standby } from '../src/standby';
import { fakeFrames, flush, mount, part, press } from './mount';

/** Gives `node` a box of its own; the test page lays nothing out. */
const box = (node: Element, left: number, top: number, width: number, height: number): void => {
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(left, top, width, height));
};

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

  it('lets the pointer play over the mark, and wakes on a movement off it on any side', async () => {
    const { standby, frames, shown } = await at('none');
    // the mark's box: 110 to 650 across, 90 to 810 down
    box(standby.querySelector('[aria-hidden="true"]') as Element, 110, 90, 540, 720);
    const move = (x: number, y: number): void => {
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    };
    for (const [x, y] of [
      [20, 400],
      [400, 20],
      [400, 900],
      [700, 400],
    ] as const) {
      press('s');
      frames.advance(1000);
      move(400, 400);
      move(600, 700);
      move(150, 120);
      expect(shown()).toBe('standby');
      move(x, y);
      expect(shown()).toBe('start');
    }
  });

  it('full: the hero clock travels to the standby clock and grows to its size', async () => {
    const { main, frames, shown } = await at('full');
    const hero = part(main, 'time');
    box(hero, 100, 200, 300, 100);
    // nothing to travel to while the standby clock has no size
    press('s');
    frames.advance(430);
    expect(hero.style.transform).toBe('');
    press('x');
    expect(shown()).toBe('start');
    box(part(main, 'standby-time'), 900, 280, 600, 200);
    press('s');
    frames.advance(430);
    expect(hero.style.transform).toBe('translate(400.00px, 40.00px) scale(1.5000)');
    frames.advance(500);
    expect(shown()).toBe('standby');
    expect(hero.style.transform).toBe('');
  });
});

describe('home · standby on its own', () => {
  /** A start page of `blocks` on `doc`, with a field that draws nothing; counts how often it settles. */
  function standbyOn(doc: Document, blocks: HTMLElement[]) {
    const frames = fakeFrames();
    const page = doc.createElement('div');
    const start = doc.createElement('div');
    const clock = doc.createElement('div');
    const lines = doc.createElement('div');
    start.append(lines, clock, ...blocks.filter((block) => block.id !== 'away'));
    page.append(start);
    doc.body.append(page);
    let settled = 0;
    const standby = new Standby(doc, frames, {
      page,
      start,
      clock,
      lines,
      view: { ring: () => undefined, decode: () => undefined } as unknown as FieldView,
      blocks: () => blocks,
      layoutField: () => undefined,
      size: () => ({ w: 1440, h: 900 }),
      settled: () => {
        settled += 1;
      },
      random: () => 0.5,
    });
    page.append(standby.node);
    return { frames, page, standby, settled: () => settled };
  }

  const block = (doc: Document, text: string, id = ''): HTMLElement => {
    const node = doc.createElement('div');
    node.id = id;
    node.textContent = text;
    return node;
  };

  it('does nothing when asked into standby twice or back to the start page while on it', () => {
    const { page, standby, settled } = standbyOn(document, []);
    standby.exit('none');
    expect(settled()).toBe(0);
    standby.enter('none');
    standby.enter('none');
    expect(settled()).toBe(1);
    expect(page.hasAttribute('data-standby')).toBe(true);
    standby.exit('none');
    standby.exit('none');
    expect(settled()).toBe(2);
    expect(page.hasAttribute('data-standby')).toBe(false);
  });

  it('dissolves only the blocks that are shown on the page, fully opaque when the style says nothing', () => {
    const shown = block(document, 'Mail');
    const hidden = block(document, 'News');
    hidden.hidden = true;
    const away = block(document, 'Wiki', 'away');
    const { frames, standby } = standbyOn(document, [shown, hidden, away]);
    standby.enter('full');
    expect(shown.style.opacity).toBe('1');
    frames.advance(200);
    expect(shown.classList.contains('dz')).toBe(true);
    frames.advance(200);
    expect(shown.style.opacity).toBe('0');
    for (const node of [hidden, away]) {
      expect(node.style.opacity).toBe('');
      expect(node.classList.contains('dz')).toBe(false);
    }
    frames.advance(600);
    expect(standby.moving).toBe(false);
    expect(shown.style.opacity).toBe('');
    expect(shown.textContent).toBe('Mail');
  });

  it('dissolves the blocks of a document without a window as fully opaque', () => {
    const doc = document.implementation.createHTMLDocument('');
    expect(doc.defaultView).toBeNull();
    const shown = block(doc, 'Mail');
    const { frames, standby } = standbyOn(doc, [shown]);
    standby.enter('full');
    expect(shown.style.opacity).toBe('1');
    frames.advance(400);
    expect(shown.style.opacity).toBe('0');
    frames.advance(600);
    expect(standby.on).toBe(true);
    expect(standby.moving).toBe(false);
  });
});
