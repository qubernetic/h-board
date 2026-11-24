import type { Motion } from '@h-board/core';
import { MS, Tween } from './motion';
import type { Frames } from './motion';

/** The glyphs a card's text writes itself out of. */
const SET = '01<>/\\[]{}()#$%&*+=-_:;!?|~^';
/** How far the drum's rows start from their place, per group of the step, in px. */
const DRUM_PX = 44;
/** How far a deleted card runs out, in px. */
const RUN_OUT_PX = 24;

/** A spring that overshoots a little and settles: 0 at the start, 1 at the end. */
export const spring = (v: number): number => 1 + 2.70158 * (v - 1) ** 3 + 1.70158 * (v - 1) ** 2;
const easeOut = (v: number): number => 1 - (1 - v) ** 3;

/**
 * The movements of the cards and the drum (M4, M5 and M6 of `MOTION.md`), each at the level it is given. They run on
 * the page's frames; `finish()` jumps every one of them to its end.
 */
export class Moves {
  private readonly cards: Tween;
  private readonly drum: Tween;

  constructor(
    frames: Frames,
    private readonly random: () => number,
  ) {
    this.cards = new Tween(frames);
    this.drum = new Tween(frames);
  }

  get running(): boolean {
    return this.cards.running || this.drum.running;
  }

  finish(): void {
    this.cards.finish();
    this.drum.finish();
  }

  /** M4: the drum's rows spring into place from `by` groups away; nothing under none. */
  spring(rail: HTMLElement, by: number, level: Motion): void {
    if (level === 'none' || !by) return;
    const rows = [...rail.querySelectorAll<HTMLElement>('.drum-row, .lens-name')];
    const from = Math.sign(by) * Math.min(2, Math.abs(by)) * DRUM_PX;
    this.drum.run(
      MS.spring,
      (t) => {
        const k = spring(t / MS.spring);
        for (const row of rows) row.style.transform = t >= MS.spring ? '' : `translateY(${(from * (1 - k)).toFixed(1)}px)`;
      },
    );
  }

  /** M4, and undo: the cards in view write their text out (full) or fade in (reduced). */
  cardsIn(grid: HTMLElement, level: Motion): void {
    if (level === 'none') return;
    if (level === 'reduced') {
      this.fadeIn(grid, MS.fade);
      return;
    }
    const texts: { node: Text; final: string }[] = [];
    for (const part of grid.querySelectorAll('.card .name, .card .host, .card .desc')) {
      for (const node of part.childNodes) {
        if (node.nodeType === 3) texts.push({ node: node as Text, final: (node as Text).data });
      }
    }
    this.cards.run(MS.scramble, (t) => {
      const done = t / MS.scramble;
      for (const { node, final } of texts) {
        if (done >= 1) {
          node.data = final;
          continue;
        }
        const k = Math.floor(done * final.length);
        let out = final.slice(0, k);
        for (let i = k; i < final.length; i++) {
          const char = final[i] as string;
          out += char === ' ' ? char : SET[Math.floor(this.random() * SET.length)];
        }
        node.data = out;
      }
    });
  }

  /** Where each card of the grid is now, by its index, for `flip()` after the next drawing. */
  rects(grid: HTMLElement): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const card of grid.querySelectorAll<HTMLElement>('.card')) {
      rects.set(card.dataset['index'] ?? 'add', card.getBoundingClientRect());
    }
    return rects;
  }

  /** M5: the cards travel from where they were (full, FLIP) or fade in at their new place (reduced). */
  flip(grid: HTMLElement, from: Map<string, DOMRect>, level: Motion): void {
    if (level === 'none') return;
    if (level === 'reduced') {
      this.fadeIn(grid, MS.densityFade);
      return;
    }
    const moves: { card: HTMLElement; dx: number; dy: number; kx: number; ky: number }[] = [];
    for (const card of grid.querySelectorAll<HTMLElement>('.card')) {
      const a = from.get(card.dataset['index'] ?? 'add');
      const b = card.getBoundingClientRect();
      if (!a || !a.width || !b.width || !a.height || !b.height) continue;
      const move = { card, dx: a.left - b.left, dy: a.top - b.top, kx: a.width / b.width, ky: a.height / b.height };
      if (Math.abs(move.dx) < 0.5 && Math.abs(move.dy) < 0.5 && Math.abs(move.kx - 1) < 0.01) continue;
      card.style.transformOrigin = '0 0';
      moves.push(move);
    }
    this.cards.run(MS.flip, (t) => {
      const k = easeOut(t / MS.flip);
      for (const { card, dx, dy, kx, ky } of moves) {
        card.style.transform =
          t >= MS.flip
            ? ''
            : `translate(${(dx * (1 - k)).toFixed(1)}px, ${(dy * (1 - k)).toFixed(1)}px) scale(${(1 + (kx - 1) * (1 - k)).toFixed(4)}, ${(1 + (ky - 1) * (1 - k)).toFixed(4)})`;
      }
    });
  }

  /** M6: a deleted card runs out (full), fades (reduced) or goes at once (none); then `done`. */
  leave(card: HTMLElement, level: Motion, done: () => void): void {
    if (level === 'none') {
      done();
      return;
    }
    const full = level === 'full';
    const ms = full ? MS.runOut : MS.fade;
    this.cards.run(
      ms,
      (t) => {
        const k = t / ms;
        card.style.opacity = String(1 - k);
        if (full) card.style.transform = `translateX(${(RUN_OUT_PX * easeOut(k)).toFixed(1)}px)`;
      },
      done,
    );
  }

  private fadeIn(node: HTMLElement, ms: number): void {
    this.cards.run(ms, (t) => {
      node.style.opacity = t >= ms ? '' : String(t / ms);
    });
  }
}
