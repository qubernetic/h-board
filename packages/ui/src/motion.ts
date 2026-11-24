import type { Motion } from '@h-board/core';

/**
 * The one motion flag every movement reads: the level in the settings, except that a system asking for less
 * motion (`prefers-reduced-motion`) means none until the user picks a level.
 */
export function motionLevel(setting: Motion, systemReduced: boolean, picked: boolean): Motion {
  return systemReduced && !picked ? 'none' : setting;
}

/** The durations of the movements, in ms. `packages/ui/MOTION.md` explains each. */
export const MS = {
  /** M3 under reduced motion, and every other crossfade of a reduced movement that has no time of its own. */
  fade: 150,
  /** M3 full: the way into standby, and the way back. */
  enter: 920,
  exit: 640,
  /** M4 full: a card's text writing itself out of the field. */
  scramble: 240,
  /** M4: the drum's spring, both full and reduced. */
  spring: 320,
  /** M5 full: the cards travelling to their new place. */
  flip: 300,
  /** M5 reduced. */
  densityFade: 125,
  /** M6 full: a deleted card running out. */
  runOut: 200,
} as const;

/** The page's clock for movements: the time in ms and the next frame. The window's when left out. */
export interface Frames {
  now(): number;
  request(run: (now: number) => void): number;
  cancel(id: number): void;
}

export function windowFrames(win: Window): Frames {
  return {
    now: () => win.performance.now(),
    request: (run) => win.requestAnimationFrame(run),
    cancel: (id) => win.cancelAnimationFrame(id),
  };
}

/**
 * One movement over time: `render(t)` on every frame with t from 0 to `duration` ms, then `done`. `finish()` jumps
 * to the end at once: the user never waits for a movement.
 */
export class Tween {
  private id = 0;
  private end: (() => void) | null = null;

  constructor(private readonly frames: Frames) {}

  get running(): boolean {
    return this.end !== null;
  }

  run(duration: number, render: (t: number) => void, done: () => void = () => undefined): void {
    this.finish();
    const start = this.frames.now();
    this.end = () => {
      this.frames.cancel(this.id);
      this.end = null;
      render(duration);
      done();
    };
    const frame = (now: number): void => {
      const t = now - start;
      if (t >= duration) {
        this.end?.();
        return;
      }
      render(Math.max(0, t));
      this.id = this.frames.request(frame);
    };
    render(0);
    this.id = this.frames.request(frame);
  }

  /** Jumps to the end of the movement, if one runs. */
  finish(): void {
    this.end?.();
  }
}

/** A movement of the page and what it does at each level. */
export interface Movement {
  readonly id: string;
  readonly what: string;
  readonly full: string;
  readonly reduced: string;
  readonly none: string;
}

/** Every movement the page has, in the order of `packages/ui/MOTION.md`; a test holds the two together. */
export const MOVEMENTS: readonly Movement[] = [
  {
    id: 'M1',
    what: 'the character field and the pointer trail',
    full: 'the trail follows the pointer on the start page and on home · standby',
    reduced: 'the trail only on home · standby',
    none: 'still dots',
  },
  {
    id: 'M2',
    what: 'the mark on home · standby',
    full: 'shimmer and the pointer playing with it',
    reduced: 'the same',
    none: 'still',
  },
  {
    id: 'M3',
    what: 'entering and leaving home · standby',
    full: '920 ms in and 640 ms out, the mark decoding and a shockwave',
    reduced: '150 ms crossfade',
    none: 'at once',
  },
  {
    id: 'M4',
    what: 'switching groups on the wheel',
    full: 'the drum springs and the cards write their text out',
    reduced: 'the drum springs and the cards crossfade',
    none: 'at once',
  },
  {
    id: 'M5',
    what: 'changing the density',
    full: 'FLIP 300 ms',
    reduced: '125 ms crossfade',
    none: 'at once',
  },
  {
    id: 'M6',
    what: 'delete and undo',
    full: 'the card runs out, the toast with a time bar',
    reduced: 'the card fades, the toast with a time bar',
    none: 'the card disappears, the toast without a bar',
  },
  {
    id: 'M7',
    what: 'the toast coming and going',
    full: 'rises 8 px and fades in 200 ms',
    reduced: 'fades in 150 ms',
    none: 'at once',
  },
  {
    id: 'M8',
    what: 'the scrim behind the search suggestions',
    full: '150 ms fade',
    reduced: '150 ms fade',
    none: 'at once',
  },
  {
    id: 'M9',
    what: 'the edit and delete bar of a card in edit mode',
    full: '120 ms fade on hover and focus',
    reduced: '120 ms fade on hover and focus',
    none: 'at once',
  },
];
