import type { Library, Motion } from '@h-board/core';
import { clockParts, standbyDate } from './clock';
import { make, place } from './dom';
import type { FieldView } from './field-view';
import { MARK, standbyFrame } from './field';
import type { Rect } from './field';
import { MS, Tween } from './motion';
import type { Frames } from './motion';
import { label } from './parts';

/** The glyphs a block of text dissolves into and writes itself back out of. */
const SET = '01<>/\\[]{}()#$%&*+=-_:;!?|~^';
/** M3 full, on the way in: each block dissolves in `DISSOLVE_MS`, the last ones `DISSOLVE_SPREAD` ms after the first. */
const DISSOLVE_MS = 190;
const DISSOLVE_SPREAD = 110;
/** M3 full, on the way out: the ring crosses the page in `RING_MS`, a block writes itself back in `WRITE_MS`. */
const RING_MS = 420;
const RING_BAND = 72;
const WRITE_MS = 200;
/** Glyphs change about 30 times a second. */
const SCRAMBLE_EVERY = 32;
/** How far the pointer may move from where it stopped before it wakes the page, in px. */
const WAKE_PX = 24;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeInOut = (v: number): number => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);

/** What home · standby needs of the start page. */
export interface StandbyHost {
  readonly page: HTMLElement;
  readonly start: HTMLElement;
  /** The hero's clock: on the way in it travels to the standby clock's place. */
  readonly clock: HTMLElement;
  /** The start page's grid lines. */
  readonly lines: HTMLElement;
  readonly view: FieldView;
  /** The blocks of the start page that dissolve on the way in and write themselves back on the way out. */
  blocks(): HTMLElement[];
  /** Lays the field out for one of the two pages. */
  layoutField(standby: boolean): void;
  /** The page's size in CSS px. */
  size(): { w: number; h: number };
  /** Called when the page has settled on one side, after the movement or at once. */
  settled(): void;
  random(): number;
}

/** A block in a movement: its text nodes, their own text, and its opacity at rest. */
interface Block {
  readonly node: HTMLElement;
  readonly texts: { node: Text; final: string }[];
  readonly base: number;
  readonly rect: DOMRect;
  at: number;
  scrambled: boolean;
}

/**
 * Home and standby (M2 and M3 of `MOTION.md`): the mark in the character field, the clock, the date and the next
 * to-do, on the 1440 x 900 drawing of `standby()` in `docs/design/gen/build.py`, scaled and centred. The page
 * between the two runs at the motion level it is given.
 */
export class Standby {
  readonly node: HTMLElement;
  private readonly label: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly date: HTMLElement;
  private readonly rule: HTMLElement;
  private readonly next: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly line: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly tween: Tween;
  /** Standby is shown, or on its way in. */
  private shown = false;
  private kind: 'enter' | 'exit' | 'fade' | null = null;
  private since = 0;
  private ref: { x: number; y: number } | null = null;
  private blocks: Block[] = [];
  private texts: Block[] = [];
  private lastScramble = 0;

  constructor(
    private readonly doc: Document,
    private readonly frames: Frames,
    private readonly host: StandbyHost,
  ) {
    this.node = make(doc, 'section', 'hb-standby');
    this.node.dataset['part'] = 'standby';
    this.node.setAttribute('aria-label', 'Home · standby');
    this.line = make(doc, 'div', 'hb-sb-line');
    this.stage = make(doc, 'div', 'abs');
    this.stage.setAttribute('aria-hidden', 'true');
    this.label = label(doc, 'H', 'Home · standby · after 5 minutes idle');
    this.label.classList.add('abs');
    this.clock = make(doc, 'div', 'abs hb-sb-clock');
    this.clock.dataset['part'] = 'standby-time';
    this.date = make(doc, 'div', 'abs hb-sb-date');
    this.date.dataset['part'] = 'standby-date';
    this.rule = make(doc, 'div', 'abs hb-sb-rule');
    this.next = make(doc, 'div', 'abs hb-sb-next');
    this.next.dataset['part'] = 'standby-next';
    this.hint = make(doc, 'div', 'abs hb-sb-hint', 'any key or mouse movement: back');
    this.node.append(this.line, this.stage, this.label, this.clock, this.date, this.rule, this.next, this.hint);
    this.tween = new Tween(frames);
  }

  /** Whether standby is shown or on its way in. */
  get on(): boolean {
    return this.shown;
  }

  /** Whether the page is between the two. */
  get moving(): boolean {
    return this.kind !== null;
  }

  /** Places the drawing's parts on a page of w x h. */
  place(w: number, h: number): void {
    const { sf, ox, oy } = standbyFrame(w, h);
    const at = (node: HTMLElement, x: number, y: number, size?: number): void => {
      place(node, Math.round(ox + x * sf), Math.round(oy + y * sf));
      if (size) node.style.fontSize = `${size * sf}px`;
    };
    place(this.node, 0, 0, w, h);
    place(this.line, Math.round(ox + 880 * sf), 0, 1, h);
    place(this.stage, ox + 110 * sf, oy + 90 * sf, MARK.cols * 9 * sf, MARK.rows * 18 * sf);
    at(this.label, 940, 250);
    at(this.clock, 930, 280, 150);
    this.clock.style.letterSpacing = `${-4 * sf}px`;
    at(this.date, 940, 470, 22);
    at(this.rule, 940, 530);
    this.rule.style.width = `${420 * sf}px`;
    at(this.next, 940, 610, 15);
    at(this.hint, 940, 820);
  }

  /** The time, the date and the first open to-do. */
  update(now: Date, library: Library): void {
    const time = clockParts(now).time;
    if (this.clock.textContent !== time) this.clock.textContent = time;
    const date = standbyDate(now);
    if (this.date.textContent !== date) this.date.textContent = date;
    const next = library.todos.find((todo) => !todo.done);
    const text = next ? `next: ${next.text}` : '';
    if (this.next.textContent !== text) this.next.textContent = text;
  }

  /** The boxes of standby's text, which quiet the field round them. */
  quietRects(): Rect[] {
    return [this.label, this.clock, this.date, this.next, this.hint].map((node) => node.getBoundingClientRect());
  }

  /** Goes to standby at the motion level `level`. */
  enter(level: Motion): void {
    if (this.shown) return;
    this.finish();
    this.shown = true;
    this.since = this.frames.now();
    this.ref = null;
    if (level === 'none') {
      this.settle(true);
      return;
    }
    if (level === 'reduced') {
      this.fade(true);
      return;
    }
    this.begin('enter');
    this.blocks = this.read(this.host.blocks());
    const { w, h } = this.host.size();
    // the page dissolves from the centre outwards
    const far = Math.hypot(w, h) / 2;
    for (const block of this.blocks) {
      const r = block.rect;
      block.at = (DISSOLVE_SPREAD * Math.hypot(r.left + r.width / 2 - w / 2, r.top + r.height / 2 - h / 2)) / far;
    }
    this.texts = this.read([this.label, this.date, this.next, this.hint]);
    for (const [i, block] of this.texts.entries()) block.at = [400, 470, 610, 680][i] as number;
    this.host.layoutField(true);
    this.host.view.decode(0);
    this.tween.run(MS.enter, (t) => this.renderEnter(t), () => this.settle(true));
  }

  /** Goes back to the start page at the level `level`; x, y is where the wake came from. */
  exit(level: Motion, x?: number, y?: number): void {
    if (!this.shown) return;
    if (this.kind === 'enter' || level === 'none') {
      // still on the way in, or no motion: the start page is back at once
      this.tween.finish();
      this.shown = false;
      this.settle(false);
      return;
    }
    this.finish();
    this.shown = false;
    if (level === 'reduced') {
      this.fade(false);
      return;
    }
    const { w, h } = this.host.size();
    const ox = x ?? w / 2;
    const oy = y ?? h / 2;
    const diag = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy));
    this.begin('exit');
    delete this.host.page.dataset['standby'];
    this.blocks = this.read(this.host.blocks());
    for (const block of this.blocks) {
      const r = block.rect;
      // a block starts writing when the ring reaches its nearest point
      const d = Math.hypot(Math.max(r.left - ox, 0, ox - r.right), Math.max(r.top - oy, 0, oy - r.bottom));
      block.at = (RING_MS * d) / diag;
    }
    this.texts = this.read([this.label, this.date, this.next, this.hint]);
    let swapped = false;
    this.tween.run(
      MS.exit,
      (t) => {
        if (t < RING_MS) this.host.view.ring({ x: ox, y: oy, r: (diag * t) / RING_MS, band: RING_BAND });
        else if (!swapped) {
          // the ring has left the page: back to the start page's grid, without the mark
          swapped = true;
          this.host.view.ring(null);
          this.host.view.decode(null);
          this.host.layoutField(false);
        }
        this.renderExit(t);
      },
      () => this.settle(false),
    );
  }

  /** Jumps a movement to its end. */
  finish(): void {
    this.tween.finish();
  }

  /**
   * A pointer movement on standby: any movement brings the start page back, except over the mark, where the
   * pointer plays with it, and in the first second. Says whether the page should wake.
   */
  wakes(x: number, y: number): boolean {
    if (!this.shown || this.kind || this.frames.now() - this.since < 1000) return false;
    const r = this.stage.getBoundingClientRect();
    const onMark = x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 30;
    if (!this.ref || onMark) {
      this.ref = { x, y };
      return false;
    }
    return Math.hypot(x - this.ref.x, y - this.ref.y) > WAKE_PX;
  }

  // ---------------------------------------------------------------- inside

  private begin(kind: 'enter' | 'exit' | 'fade'): void {
    this.kind = kind;
    this.lastScramble = -Infinity;
    // the hero clock travels in its place
    if (kind !== 'fade') this.clock.style.opacity = '0';
    // both pages are laid out from here on
    this.host.page.dataset['sbAnim'] = '';
  }

  /** M3 reduced: a plain crossfade; the field changes pages at the midpoint. */
  private fade(toStandby: boolean): void {
    this.begin('fade');
    const { start } = this.host;
    let swapped = false;
    this.tween.run(
      MS.fade,
      (t) => {
        const k = clamp01(t / MS.fade);
        start.style.opacity = String(toStandby ? 1 - k : k);
        this.node.style.opacity = String(toStandby ? k : 1 - k);
        if (!swapped && k >= 0.5) {
          swapped = true;
          this.host.layoutField(toStandby);
        }
      },
      () => this.settle(toStandby),
    );
  }

  private renderEnter(t: number): void {
    const scramble = this.tick();
    for (const block of this.blocks) {
      const k = clamp01((t - block.at) / DISSOLVE_MS);
      block.node.style.opacity = String(block.base * (1 - clamp01((k - 0.3) / 0.7)));
      block.node.classList.toggle('dz', k > 0.1);
      if (k <= 0 || k >= 1) this.restore(block);
      else if (scramble) this.scramble(block, 0, Math.min(1, k * 2.2));
    }
    for (const block of this.texts) {
      const k = clamp01((t - block.at) / 220);
      block.node.style.opacity = k > 0 ? '1' : '0';
      block.node.classList.toggle('dz', k > 0 && k < 0.6);
      if (k >= 1) this.restore(block);
      else if (scramble) this.scramble(block, k, 1);
    }
    this.rule.style.opacity = String(clamp01((t - 500) / 200));
    this.host.lines.style.opacity = String(1 - clamp01(t / 150));
    this.line.style.opacity = String(clamp01((t - 150) / 150));
    this.flip(easeInOut(clamp01((t - 80) / 700)));
    this.host.view.decode(t);
  }

  private renderExit(t: number): void {
    const scramble = this.tick();
    for (const block of this.blocks) {
      const k = clamp01((t - block.at) / WRITE_MS);
      block.node.style.opacity = String(block.base * clamp01(k * 4));
      block.node.classList.toggle('dz', k < 0.5);
      if (k >= 1) this.restore(block);
      else if (scramble) this.scramble(block, k, 1);
    }
    for (const block of this.texts) {
      const k = clamp01(t / 160);
      block.node.style.opacity = String(1 - k);
      block.node.classList.toggle('dz', k > 0.1);
      if (scramble && k < 1) this.scramble(block, 0, k * 1.5);
    }
    this.rule.style.opacity = String(1 - clamp01(t / 160));
    this.line.style.opacity = String(1 - clamp01(t / 200));
    this.host.lines.style.opacity = String(clamp01((t - 200) / 200));
    this.flip(1 - easeInOut(clamp01(t / 440)));
  }

  /** Whether the glyphs change on this frame. */
  private tick(): boolean {
    const now = this.frames.now();
    if (now - this.lastScramble < SCRAMBLE_EVERY) return false;
    this.lastScramble = now;
    return true;
  }

  /** The hero clock on its way: k = 0 at its own place, 1 at the standby clock's. */
  private flip(k: number): void {
    const clock = this.host.clock;
    // measured without the transform it has now
    const was = clock.style.transform;
    clock.style.transform = '';
    const from = clock.getBoundingClientRect();
    clock.style.transform = was;
    const z = this.clock.getBoundingClientRect();
    if (!from.height || !z.height) return;
    const s = z.height / from.height;
    clock.style.transform = `translate(${((z.left - from.left) * k).toFixed(2)}px, ${((z.top - from.top) * k).toFixed(2)}px) scale(${(1 + (s - 1) * k).toFixed(4)})`;
  }

  private read(nodes: HTMLElement[]): Block[] {
    const blocks: Block[] = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (node.hidden || !node.isConnected) continue;
      const texts: Block['texts'] = [];
      const walk = this.doc.createTreeWalker(node, 4);
      for (let text = walk.nextNode() as Text | null; text; text = walk.nextNode() as Text | null) {
        if (!text.data.trim() || text.parentElement?.closest('.ph, .vh, .brand')) continue;
        texts.push({ node: text, final: text.data });
      }
      const opacity = Number.parseFloat(this.doc.defaultView?.getComputedStyle(node).opacity ?? '1');
      blocks.push({ node, texts, base: Number.isNaN(opacity) ? 1 : opacity, rect, at: 0, scrambled: false });
    }
    return blocks;
  }

  /** `done`: the share of each text already final from the left; `chance`: the share of the rest shown as glyphs. */
  private scramble(block: Block, done: number, chance: number): void {
    for (const text of block.texts) {
      const { final } = text;
      const k = Math.floor(done * final.length);
      let out = final.slice(0, k);
      for (let i = k; i < final.length; i++) {
        const char = final[i] as string;
        out +=
          char === ' ' || char === '\n' || this.host.random() >= chance
            ? char
            : SET[Math.floor(this.host.random() * SET.length)];
      }
      text.node.data = out;
    }
    block.scrambled = true;
  }

  private restore(block: Block): void {
    if (!block.scrambled) return;
    for (const text of block.texts) text.node.data = text.final;
    block.scrambled = false;
  }

  /** The end of every movement: one page shown, nothing left over from the way. */
  private settle(standby: boolean): void {
    for (const block of [...this.blocks, ...this.texts]) {
      this.restore(block);
      block.node.style.opacity = '';
      block.node.classList.remove('dz');
    }
    this.blocks = [];
    this.texts = [];
    for (const node of [this.host.start, this.node, this.clock, this.rule, this.line, this.host.lines]) {
      node.style.opacity = '';
    }
    this.host.clock.style.transform = '';
    this.kind = null;
    delete this.host.page.dataset['sbAnim'];
    if (standby) this.host.page.dataset['standby'] = '';
    else delete this.host.page.dataset['standby'];
    this.host.view.ring(null);
    this.host.view.decode(null);
    this.host.layoutField(standby);
    this.host.settled();
  }
}
