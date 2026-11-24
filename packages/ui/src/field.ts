import markData from '../../../docs/design/gen/mark.json';

/**
 * The character field behind the page (M1 and M2 of `MOTION.md`): the faint dots of `field()` in
 * `docs/design/gen/build.py`, the pointer trail of the anatomy sheet, and on home · standby the Qubernetic mark,
 * all on one grid of characters. The rules are those of the mock's `startField()`. This is the model only: no DOM,
 * the time and the random source come from outside; `field-view.ts` draws it.
 */

/** The mark's density per cell, as a ramp of characters. */
const RAMP = ' .:-=+*#%@';
/** The glyphs a hot cell flips through. */
const SET = '01<>/\\[]{}()#$%&*+=-_:;!?|~^';
/** px round the pointer that it reaches. */
export const REACH = 60;
/** The chance that a flipped cell swaps ink and cyan. */
const TINT = 0.25;
/** ms a cell stays hot, at most, after the pointer has left it. */
export const TRAIL = 200;
/** The share of the effect left right behind a block of text, and the px over which it comes back to full. */
const QUIET_IN = 0.2;
const FADE = 80;
/** The mark's decode on the way into standby: the row scan starts at `DECODE_AT` ms and takes `DECODE_SCAN` ms. */
const DECODE_AT = 250;
const DECODE_SCAN = 400;

/** The Qubernetic mark as a grid of 76 x 40 characters (`docs/design/gen/mark.json`). */
export const MARK = { cols: 76, rows: 40, dens: markData.dens, cyan: markData.cyan } as const;

/** What colour a cell is drawn in: a background dot, the ink, cyan, or a glyph away from the mark. */
export const Tint = { Dot: 0, Ink: 1, Cyan: 2, Dim: 3 } as const;
export type Tint = (typeof Tint)[keyof typeof Tint];

/** Where the grid lies on the page, in CSS px. Cell (0, 0) has its top-left corner at x0, y0. */
export interface Grid {
  readonly x0: number;
  readonly y0: number;
  readonly cw: number;
  readonly ch: number;
  readonly cols: number;
  readonly rows: number;
  /** The cell that the dots' pattern starts from. */
  readonly c0: number;
  readonly r0: number;
  /** The mark's top-left cell, on home · standby. */
  readonly mark?: { readonly c: number; readonly r: number };
}

/** A box in CSS px: a block of text or a card, which quiets the field round it. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The shockwave on the way out of standby: a ring round x, y in CSS px. */
export interface Ring {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly band: number;
}

/** The start page's grid: cells of 7 x 14 px, 8 x 16 from 2200 px, from the top-left corner. */
export function startGrid(w: number, h: number): Grid {
  const [cw, ch] = w < 2200 ? [7, 14] : [8, 16];
  return { x0: 0, y0: 0, cw, ch, cols: Math.floor(w / cw) + 1, rows: Math.floor(h / ch) + 1, c0: 0, r0: 0 };
}

/** The scale and the corner of the 1440 x 900 drawing of home · standby, centred on a page of w x h. */
export function standbyFrame(w: number, h: number): { sf: number; ox: number; oy: number } {
  const sf = Math.max(0.75, Math.min(w / 1440, h / 900));
  return { sf, ox: (w - 1440 * sf) / 2, oy: (h - 900 * sf) / 2 };
}

/** Home · standby's grid: the drawing's 9 x 18 cells, scaled with it, the mark at its cell (12, 5). */
export function standbyGrid(w: number, h: number): Grid {
  const { sf, ox, oy } = standbyFrame(w, h);
  const cw = 9 * sf;
  const ch = 18 * sf;
  // whole cells to the left of and above the drawing, so the grid covers the page from its edge
  const c0 = Math.max(0, Math.ceil(ox / cw - 1e-9));
  const r0 = Math.max(0, Math.ceil(oy / ch - 1e-9));
  const x0 = ox - c0 * cw;
  const y0 = oy - r0 * ch;
  const cols = c0 + Math.ceil((w - ox) / cw - 1e-9) + 1;
  const rows = r0 + Math.ceil((h - oy) / ch - 1e-9) + 1;
  return { x0, y0, cw, ch, cols, rows, c0, r0, mark: { c: c0 + 12, r: r0 + 5 } };
}

/** The same cells on every layout: a stable hash picks 5% of them. Python's ints: no overflow, a modulo >= 0. */
function isDot(c: number, r: number): boolean {
  const h = (BigInt(c) * 73856093n) ^ (BigInt(r) * 19349663n);
  return ((h % 100n) + 100n) % 100n < 5n;
}

export class Field {
  grid: Grid = { x0: 0, y0: 0, cw: 7, ch: 14, cols: 0, rows: 0, c0: 0, r0: 0 };
  /** Whether a mark cell blinks on its own now and then (M2). */
  shimmer = false;

  private base: string[] = [];
  private glyph: string[] = [];
  private baseTint = new Uint8Array(0);
  private tint = new Uint8Array(0);
  private hotUntil = new Float64Array(0);
  private nextFlip = new Float64Array(0);
  private quiet = new Float32Array(0);
  /** A mark cell in the standby transition: shown (0), decoding (1) or hidden (2). */
  private phase = new Uint8Array(0);
  private readonly hotCells = new Set<number>();
  private markIdx: number[] = [];
  private appear = new Float32Array(0);
  private settle = new Float32Array(0);
  private pointer: { x: number; y: number } | null = null;
  private decodeAt: number | null = null;
  private wave: Ring | null = null;
  private changed = true;

  constructor(private readonly random: () => number = Math.random) {}

  /** Lays the grid out; `blocks` are the boxes of text and cards that quiet the field round them. */
  layout(grid: Grid, blocks: readonly Rect[]): void {
    const { cols, rows, cw, ch, mark } = grid;
    const n = cols * rows;
    this.grid = grid;
    this.base = new Array<string>(n);
    this.glyph = new Array<string>(n);
    this.baseTint = new Uint8Array(n);
    this.tint = new Uint8Array(n);
    this.hotUntil = new Float64Array(n);
    this.nextFlip = new Float64Array(n);
    this.quiet = new Float32Array(n).fill(1);
    this.phase = new Uint8Array(n);
    this.hotCells.clear();
    this.markIdx = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const mc = mark ? c - mark.c : -1;
        const mr = mark ? r - mark.r : -1;
        const inMark = mc >= 0 && mc < MARK.cols && mr >= 0 && mr < MARK.rows;
        const d = inMark ? Number(MARK.dens[mr]?.[mc] ?? 0) : 0;
        this.base[i] = d ? (RAMP[d] as string) : isDot(c - grid.c0, r - grid.r0) ? '·' : ' ';
        this.baseTint[i] = d ? (MARK.cyan[mr]?.[mc] === '1' ? Tint.Cyan : Tint.Ink) : Tint.Dot;
        this.glyph[i] = this.base[i] as string;
        this.tint[i] = this.baseTint[i] as number;
        if (d) this.markIdx.push(i);
      }
    }
    // the decode is a row scan from the top with a little jitter; a cell settles 120 to 200 ms after it appears
    const count = this.markIdx.length;
    this.appear = new Float32Array(count);
    this.settle = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      const mr = Math.floor((this.markIdx[k] as number) / cols) - (mark?.r ?? 0);
      this.appear[k] = DECODE_AT + (mr / MARK.rows) * DECODE_SCAN + this.random() * 60;
      this.settle[k] = (this.appear[k] as number) + 120 + this.random() * 80;
    }
    // the distance to the nearest block, once per layout: only the cells round each block are visited
    for (const block of blocks) {
      const l = block.left - grid.x0;
      const rt = block.right - grid.x0;
      const t = block.top - grid.y0;
      const b = block.bottom - grid.y0;
      const ca = Math.max(0, Math.floor((l - FADE) / cw));
      const cb = Math.min(cols - 1, Math.ceil((rt + FADE) / cw));
      const ra = Math.max(0, Math.floor((t - FADE) / ch));
      const rb = Math.min(rows - 1, Math.ceil((b + FADE) / ch));
      for (let r = ra; r <= rb; r++) {
        for (let c = ca; c <= cb; c++) {
          const x = (c + 0.5) * cw;
          const y = (r + 0.5) * ch;
          const k = Math.min(1, Math.hypot(Math.max(l - x, 0, x - rt), Math.max(t - y, 0, y - b)) / FADE);
          const q = QUIET_IN + (1 - QUIET_IN) * k * k;
          const i = r * cols + c;
          if (q < (this.quiet[i] as number)) this.quiet[i] = q;
        }
      }
    }
    if (this.decodeAt !== null) this.applyDecode(0, this.decodeAt);
    this.changed = true;
  }

  /** The pointer, in CSS px of the page. */
  move(x: number, y: number): void {
    this.pointer = { x, y };
  }

  leave(): void {
    this.pointer = null;
  }

  /** Where the decode of the way into standby stands, in ms; `null` shows the whole mark. */
  decode(t: number | null, now: number): void {
    if (t === null) {
      if (this.decodeAt !== null) this.applyDecode(now, Infinity);
    } else this.applyDecode(now, t);
    this.decodeAt = t;
  }

  /** The shockwave of the way out of standby, or `null`. */
  ring(ring: Ring | null, now: number): void {
    this.wave = ring;
    if (ring) this.applyRing(now);
  }

  /** One frame: the trail, the cooling, the shimmer. Says whether a cell changed since the last frame. */
  step(now: number): boolean {
    if (this.wave) this.applyRing(now);
    if (this.pointer) this.trail(now, this.pointer);
    for (const i of this.hotCells) {
      if (now >= (this.hotUntil[i] as number)) {
        this.cool(i);
      } else if (now >= (this.nextFlip[i] as number)) {
        this.glyph[i] = this.pick();
        if (this.phase[i] === 1) {
          // decoding: ink and cyan keep swapping
          if (this.random() < 0.35) this.tint[i] = this.tint[i] === Tint.Cyan ? Tint.Ink : Tint.Cyan;
          this.nextFlip[i] = now + 35 + this.random() * 50;
        } else this.nextFlip[i] = now + 70 + this.random() * 160;
        this.changed = true;
      }
    }
    if (this.shimmer && this.markIdx.length && this.random() < 0.125) {
      const i = this.markIdx[Math.floor(this.random() * this.markIdx.length)] as number;
      if (!this.hotUntil[i] && !this.phase[i]) {
        this.glyph[i] = this.pick();
        this.tint[i] = this.random() < 0.5 ? Tint.Cyan : (this.baseTint[i] as number);
        this.heat(i, now + 250 + this.random() * 500);
        this.nextFlip[i] = now + 90;
      }
    }
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  /** Calls `draw` for every cell that shows a character. */
  each(draw: (c: number, r: number, glyph: string, tint: Tint, alpha: number) => void): void {
    const { cols } = this.grid;
    for (let i = 0; i < this.glyph.length; i++) {
      const glyph = this.glyph[i] as string;
      if (glyph !== ' ') draw(i % cols, Math.floor(i / cols), glyph, this.tint[i] as Tint, this.alpha(i));
    }
  }

  /** How strongly cell i is drawn: a hot cell fades behind text and cards. */
  alpha(i: number): number {
    return this.hotUntil[i] ? (this.quiet[i] as number) : 1;
  }

  /** The quiet of the cell under x, y in CSS px. */
  quietAt(x: number, y: number): number {
    const { x0, y0, cw, ch, cols } = this.grid;
    return this.quiet[Math.floor((y - y0) / ch) * cols + Math.floor((x - x0) / cw)] as number;
  }

  /** The cells that are hot now. */
  hot(): number[] {
    return [...this.hotCells].sort((a, b) => a - b);
  }

  markCells(): number {
    return this.markIdx.length;
  }

  // ---------------------------------------------------------------- inside

  private pick(): string {
    return SET[Math.floor(this.random() * SET.length)] as string;
  }

  private heat(i: number, until: number): void {
    this.hotUntil[i] = until;
    this.hotCells.add(i);
    this.changed = true;
  }

  private cool(i: number): void {
    this.hotUntil[i] = 0;
    this.hotCells.delete(i);
    if (this.phase[i] !== 2) {
      this.glyph[i] = this.base[i] as string;
      this.tint[i] = this.baseTint[i] as number;
    }
    this.changed = true;
  }

  /** Cells under the pointer flip to a glyph, sometimes change colour, and stay hot for a while. */
  private trail(now: number, at: { x: number; y: number }): void {
    const { x0, y0, cw, ch, cols, rows } = this.grid;
    const px = at.x - x0;
    const py = at.y - y0;
    const ca = Math.max(0, Math.floor((px - REACH) / cw));
    const cb = Math.min(cols - 1, Math.floor((px + REACH) / cw));
    const ra = Math.max(0, Math.floor((py - REACH) / ch));
    const rb = Math.min(rows - 1, Math.floor((py + REACH) / ch));
    for (let r = ra; r <= rb; r++) {
      for (let c = ca; c <= cb; c++) {
        const d = Math.hypot((c + 0.5) * cw - px, (r + 0.5) * ch - py);
        if (d > REACH) continue;
        const i = r * cols + c;
        if (now < (this.nextFlip[i] as number) || this.phase[i]) continue;
        // 1 at the pointer, 0 at the rim
        const f = 1 - d / REACH;
        const mark = this.baseTint[i] !== Tint.Dot;
        if (this.random() >= (mark ? 0.25 + f * 0.75 : f * f * 0.8 * (this.quiet[i] as number))) {
          this.nextFlip[i] = now + 60;
          continue;
        }
        this.glyph[i] = this.pick();
        if (this.random() < TINT) this.tint[i] = this.baseTint[i] === Tint.Cyan ? Tint.Ink : Tint.Cyan;
        else this.tint[i] = mark ? (this.baseTint[i] as number) : Tint.Dim;
        this.nextFlip[i] = now + 50 + this.random() * 140;
        this.heat(i, now + TRAIL * (0.4 + this.random() * 0.6));
      }
    }
  }

  private setPhase(i: number, want: number, now: number): void {
    if (this.phase[i] === want) return;
    this.phase[i] = want;
    if (want === 2) {
      const { cols, c0, r0 } = this.grid;
      this.glyph[i] = isDot((i % cols) - c0, Math.floor(i / cols) - r0) ? '·' : ' ';
      this.tint[i] = Tint.Dot;
      this.hotUntil[i] = 0;
      this.hotCells.delete(i);
    } else if (want === 1) {
      this.glyph[i] = this.pick();
      const own = this.baseTint[i] as number;
      this.tint[i] = this.random() < 0.5 ? (own === Tint.Cyan ? Tint.Ink : Tint.Cyan) : own;
      // hot for as long as the phase lasts
      this.heat(i, now + 1e9);
      this.nextFlip[i] = now + 35 + this.random() * 50;
    } else {
      this.cool(i);
    }
    this.changed = true;
  }

  /** Where the decode stands at time t of the way in; a pure function of t. */
  private applyDecode(now: number, t: number): void {
    for (let k = 0; k < this.markIdx.length; k++) {
      const want = t < (this.appear[k] as number) ? 2 : t < (this.settle[k] as number) ? 1 : 0;
      this.setPhase(this.markIdx[k] as number, want, now);
    }
  }

  /** Cells in the ring's band flip hot like the trail; mark cells the ring has passed collapse to dots. */
  private applyRing(now: number): void {
    const wave = this.wave as Ring;
    const { x0, y0, cw, ch, cols, rows } = this.grid;
    const ox = wave.x - x0;
    const oy = wave.y - y0;
    const inner = wave.r - wave.band;
    const half = wave.band / 2;
    const ra = Math.max(0, Math.floor((oy - wave.r) / ch));
    const rb = Math.min(rows - 1, Math.ceil((oy + wave.r) / ch));
    const ca = Math.max(0, Math.floor((ox - wave.r) / cw));
    const cb = Math.min(cols - 1, Math.ceil((ox + wave.r) / cw));
    for (let r = ra; r <= rb; r++) {
      const dy = (r + 0.5) * ch - oy;
      for (let c = ca; c <= cb; c++) {
        const d = Math.hypot((c + 0.5) * cw - ox, dy);
        if (d > wave.r) continue;
        const i = r * cols + c;
        if (this.baseTint[i] !== Tint.Dot) {
          this.setPhase(i, d < inner ? 2 : 1, now);
          continue;
        }
        if (d < inner || now < (this.nextFlip[i] as number)) continue;
        // 1 in the middle of the band
        const f = 1 - Math.abs(d - inner - half) / half;
        if (this.random() >= 0.25 + 0.6 * f * (this.quiet[i] as number)) {
          this.nextFlip[i] = now + 30;
          continue;
        }
        this.glyph[i] = this.pick();
        this.tint[i] = this.random() < TINT ? Tint.Cyan : Tint.Dim;
        this.nextFlip[i] = now + 50 + this.random() * 140;
        this.heat(i, now + TRAIL * (0.4 + this.random() * 0.6));
      }
    }
  }
}
