import { make } from './dom';
import { Field } from './field';
import type { Grid, Rect, Ring } from './field';
import type { Frames } from './motion';

/** The colours of the four tints, from the page's tokens: dot, ink, cyan, the glyph colour. */
const TOKENS = ['--dot', '--ink', '--cyan', '--glyph'] as const;

/**
 * Draws the character field on a canvas behind the page and runs it frame by frame while it is live. It draws
 * only when a cell changed, so a still field costs nothing after its first frame.
 */
export class FieldView {
  readonly canvas: HTMLCanvasElement;
  readonly field: Field;
  private live = false;
  private id = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(
    doc: Document,
    private readonly win: Window,
    private readonly frames: Frames,
    random?: () => number,
  ) {
    this.canvas = make(doc, 'canvas', 'hb-field');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.field = new Field(random);
  }

  /** Lays the field out on a page of w x h CSS px and draws it. */
  layout(grid: Grid, blocks: readonly Rect[], w: number, h: number): void {
    this.dpr = Math.min(this.win.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    const width = Math.round(w * this.dpr);
    const height = Math.round(h * this.dpr);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.field.layout(grid, blocks);
    this.draw();
  }

  /** Live: the trail and the shimmer run on every frame. Not live: the field holds still. */
  setLive(live: boolean, shimmer: boolean): void {
    this.field.shimmer = shimmer;
    this.canvas.dataset['live'] = String(live);
    if (!live) this.field.leave();
    if (live === this.live) return;
    this.live = live;
    if (live) this.id = this.frames.request((now) => this.frame(now));
    else this.frames.cancel(this.id);
  }

  get isLive(): boolean {
    return this.live;
  }

  move(x: number, y: number): void {
    if (this.live) this.field.move(x, y);
  }

  leave(): void {
    this.field.leave();
  }

  /** The decode of the way into standby at t ms, or `null`; drawn at once. */
  decode(t: number | null): void {
    const now = this.frames.now();
    this.field.decode(t, now);
    this.field.step(now);
    this.draw();
  }

  /** The shockwave of the way out, or `null`; drawn at once. */
  ring(ring: Ring | null): void {
    const now = this.frames.now();
    this.field.ring(ring, now);
    this.field.step(now);
    this.draw();
  }

  stop(): void {
    this.frames.cancel(this.id);
    this.live = false;
  }

  private frame(now: number): void {
    if (!this.live) return;
    if (this.field.step(now)) this.draw();
    this.id = this.frames.request((next) => this.frame(next));
  }

  /** Draws every cell that shows a character, one colour at a time. */
  draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const style = this.win.getComputedStyle(this.canvas);
    const palette = TOKENS.map((token) => style.getPropertyValue(token).trim() || 'gray');
    const { x0, y0, cw, ch } = this.field.grid;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = `${cw / 0.6}px ${style.getPropertyValue('--mono').trim() || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // the baseline a line of ch px puts the font on, as the drawing's text lines have it
    const m = ctx.measureText('M');
    const ascent = m.fontBoundingBoxAscent || (cw / 0.6) * 0.8;
    const descent = m.fontBoundingBoxDescent || (cw / 0.6) * 0.2;
    const baseline = (ch - ascent - descent) / 2 + ascent;
    const byTint: [number, number, string, number][][] = [[], [], [], []];
    this.field.each((c, r, glyph, tint, alpha) => {
      byTint[tint]?.push([x0 + (c + 0.5) * cw, y0 + r * ch + baseline, glyph, alpha]);
    });
    for (const [tint, cells] of byTint.entries()) {
      ctx.fillStyle = palette[tint] as string;
      let alpha = 1;
      ctx.globalAlpha = 1;
      for (const [x, y, glyph, a] of cells) {
        if (a !== alpha) ctx.globalAlpha = alpha = a;
        ctx.fillText(glyph, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }
}
