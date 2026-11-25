import { sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { afterEach } from 'vitest';
import { mountBoard } from '../src/index';
import type { BoardOptions } from '../src/index';
import type { Frames } from '../src/motion';

// What the editing tests share: a board on a memory store, and a few ways to poke it.

const NOW = new Date(2026, 10, 23, 14, 32, 7);
let stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.body.replaceChildren();
});

export async function mount(
  library: Library = sampleLibrary(),
  options: BoardOptions = {},
): Promise<{ main: HTMLElement; store: MemoryStore }> {
  const main = document.createElement('main');
  document.body.append(main);
  const store = new MemoryStore({ initial: () => library });
  // no motion unless a test asks for it: the system's wish for less motion means none
  stops.push(
    await mountBoard(main, store, {
      now: () => NOW,
      viewport: () => ({ w: 1440, h: 900 }),
      systemReducedMotion: () => true,
      ...options,
    }),
  );
  return { main, store };
}

export const part = (root: ParentNode, name: string): HTMLElement => {
  const node = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!node) throw new Error(`no ${name}`);
  return node;
};

export const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
};

/** Lets the store's promises and the redraw they start run. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** A clock for the movements that moves only when told: `advance(ms)` runs the frames in steps of 16 ms. */
export function fakeFrames(): Frames & { advance(ms: number): void } {
  let now = 0;
  let id = 0;
  const queue = new Map<number, (now: number) => void>();
  return {
    now: () => now,
    request: (run) => {
      id += 1;
      queue.set(id, run);
      return id;
    },
    cancel: (which) => {
      queue.delete(which);
    },
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        const runs = [...queue.values()];
        queue.clear();
        for (const run of runs) run(now);
      }
    },
  };
}

export const names =(main: HTMLElement): string[] =>
  [...main.querySelectorAll('[data-part="grid"] .card:not(.add) .name')].map((node) => node.textContent ?? '');

export const click = (node: Element | null | undefined): void => {
  if (!node) throw new Error('nothing to click');
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
