import { describe, expect, it } from 'vitest';
import { Field, MARK, REACH, TRAIL, Tint, standbyGrid, startGrid } from '../src/field';
import type { Grid } from '../src/field';

/** The text of the grid as it is drawn now: one line per row, trailing spaces cut. */
function text(field: Field): string {
  const { cols, rows } = field.grid;
  const lines = Array.from({ length: rows }, () => Array<string>(cols).fill(' '));
  field.each((c, r, glyph) => {
    (lines[r] as string[])[c] = glyph;
  });
  return lines.map((line) => line.join('').trimEnd()).join('\n');
}

/** A random source that always says `value`. */
const always = (value: number) => (): number => value;

const DOT = '·';

describe('the character field', () => {
  it('puts the dots where the drawing has them', () => {
    const field = new Field();
    field.layout(startGrid(1440, 900), []);
    expect(field.grid).toMatchObject({ cw: 7, ch: 14, cols: 206, rows: 65 });
    const lines = text(field).split('\n');
    expect(lines).toHaveLength(65);
    // the numbers of build.py's field(): 664 dots, and these in the first row
    expect([...text(field)].filter((char) => char === DOT)).toHaveLength(664);
    expect(lines[0]?.slice(0, 80)).toBe(
      '·             ·             ·                            ·             ·        ',
    );
  });

  it('uses a larger cell from 2200 px', () => {
    expect(startGrid(2560, 1360)).toMatchObject({ cw: 8, ch: 16 });
  });

  it('flips the cells round the pointer to glyphs, and they turn back into dots after the trail', () => {
    const field = new Field(always(0));
    field.layout(startGrid(1440, 900), []);
    const before = text(field);
    field.move(400, 400);
    expect(field.step(1000)).toBe(true);
    const hot = field.hot();
    expect(hot.length).toBeGreaterThan(100);
    for (const i of hot) {
      const { cw, ch, cols } = field.grid;
      const dx = ((i % cols) + 0.5) * cw - 400;
      const dy = (Math.floor(i / cols) + 0.5) * ch - 400;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(REACH);
    }
    expect(text(field)).not.toBe(before);
    field.leave();
    field.step(1000 + TRAIL);
    expect(field.hot()).toEqual([]);
    expect(text(field)).toBe(before);
    expect(field.step(1000 + TRAIL + 16)).toBe(false);
  });

  it('flips a cell with the chance f² · 0.8 · q, so the rim of the reach stays calm', () => {
    const field = new Field(always(0.5));
    field.layout(startGrid(1440, 900), []);
    field.move(400, 400);
    field.step(1000);
    const { cw, ch, cols } = field.grid;
    for (const i of field.hot()) {
      const d = Math.hypot(((i % cols) + 0.5) * cw - 400, (Math.floor(i / cols) + 0.5) * ch - 400);
      const f = 1 - d / REACH;
      expect(f * f * 0.8).toBeGreaterThanOrEqual(0.5);
    }
    expect(field.hot().length).toBeGreaterThan(0);
  });

  it('fades the effect behind text and cards: 0.2 right behind a block, 1 from 80 px away', () => {
    const field = new Field(always(0));
    field.layout(startGrid(1440, 900), [{ left: 300, top: 300, right: 500, bottom: 500 }]);
    expect(field.quietAt(400, 400)).toBeCloseTo(0.2);
    expect(field.quietAt(540, 400)).toBeCloseTo(0.2 + 0.8 * (42.5 / 80) ** 2, 2);
    expect(field.quietAt(700, 400)).toBe(1);
    field.move(400, 400);
    field.step(1000);
    const hot = field.hot();
    expect(hot.length).toBeGreaterThan(0);
    for (const i of hot) expect(field.alpha(i)).toBeCloseTo(0.2);
  });

  it('leaves the cells alone while the pointer is outside the page', () => {
    const field = new Field(always(0));
    field.layout(startGrid(1440, 900), []);
    // the new layout itself wants drawing once
    expect(field.step(1000)).toBe(true);
    expect(field.step(1016)).toBe(false);
    expect(field.hot()).toEqual([]);
  });
});

describe('the mark on home · standby', () => {
  const grid: Grid = standbyGrid(1440, 900);

  it('draws the mark of the drawing at its place on a 9 x 18 grid', () => {
    expect(grid).toMatchObject({ x0: 0, y0: 0, cw: 9, ch: 18, mark: { c: 12, r: 5 } });
    const field = new Field();
    field.layout(grid, []);
    const lines = text(field).split('\n');
    // the mark's own rows: its fourth row has its first ink, two dots at the mark's columns 43 and 44
    expect(lines[5 + 3]?.slice(12 + 43, 12 + 45)).toBe('..');
    expect(field.markCells()).toBe([...MARK.dens.join('')].filter((d) => d !== '0').length);
  });

  it('centres the 1440 x 900 drawing on a larger page and scales it', () => {
    const big = standbyGrid(2560, 1440);
    const sf = Math.min(2560 / 1440, 1440 / 900);
    expect(big.cw).toBeCloseTo(9 * sf);
    expect(big.ch).toBeCloseTo(18 * sf);
    const markLeft = big.x0 + (big.mark?.c ?? 0) * big.cw;
    expect(markLeft).toBeCloseTo((2560 - 1440 * sf) / 2 + 12 * 9 * sf);
    expect(big.x0).toBeLessThanOrEqual(0);
    expect(big.x0 + big.cols * big.cw).toBeGreaterThanOrEqual(2560);
  });

  it('decodes the mark row by row from the top: hidden, hot, then its own character', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    const full = text(field);
    field.decode(0, 0);
    expect(text(field)).not.toContain('@');
    field.decode(10_000, 16);
    field.decode(null, 32);
    expect(text(field)).toBe(full);
  });

  it('collapses the mark to dots where the shockwave has passed', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    field.ring({ x: 500, y: 450, r: 3000, band: 72 }, 0);
    field.step(0);
    expect(text(field)).not.toMatch(/[@%#]/);
  });

  it('lets one mark cell blink on its own now and then', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    field.shimmer = true;
    expect(field.step(0)).toBe(true);
    expect(field.hot()).toHaveLength(1);
  });
});

/** A random source that says `values` in turn, then `rest` for ever. */
const seq = (values: number[], rest = 0) => (): number => values.shift() ?? rest;

/** What each cell is drawn as now, by its index. */
function cells(field: Field): Map<number, { glyph: string; tint: Tint }> {
  const { cols } = field.grid;
  const out = new Map<number, { glyph: string; tint: Tint }>();
  field.each((c, r, glyph, tint) => out.set(r * cols + c, { glyph, tint }));
  return out;
}

/** The mark's own colour of cell i of a grid with the mark, or `null` away from the mark. */
function ownTint(grid: Grid, i: number): Tint | null {
  const mark = grid.mark as { c: number; r: number };
  const mc = (i % grid.cols) - mark.c;
  const mr = Math.floor(i / grid.cols) - mark.r;
  if (mc < 0 || mc >= MARK.cols || mr < 0 || mr >= MARK.rows || MARK.dens[mr]?.[mc] === '0') return null;
  return MARK.cyan[mr]?.[mc] === '1' ? Tint.Cyan : Tint.Ink;
}

/** The middle of the first mark cell in cyan, in CSS px. */
function firstCyan(grid: Grid): { x: number; y: number } {
  const mark = grid.mark as { c: number; r: number };
  const cyan = (mr: number, mc: number): boolean => MARK.cyan[mr]?.[mc] === '1' && MARK.dens[mr]?.[mc] !== '0';
  const mr = MARK.cyan.findIndex((row, r) => [...row].some((_, c) => cyan(r, c)));
  const mc = [...(MARK.cyan[mr] as string)].findIndex((_, c) => cyan(mr, c));
  return { x: grid.x0 + (mark.c + mc + 0.5) * grid.cw, y: grid.y0 + (mark.r + mr + 0.5) * grid.ch };
}

describe('the mark under the pointer and in its transitions', () => {
  const grid: Grid = standbyGrid(1440, 900);

  it('keeps the decode where it stands when the page is laid out again', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    field.decode(0, 0);
    field.layout(grid, []);
    expect(text(field)).not.toMatch(/[@%#]/);
  });

  it('swaps ink and cyan on a decoding cell, and keeps swapping them on every flip', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    // at 450 ms the mark's rows 9 to 19 are decoding: hot, with ink and cyan swapped
    field.decode(450, 0);
    const decoding = field.hot();
    expect(decoding.length).toBeGreaterThan(0);
    const swapped = (tint: Tint | null): Tint => (tint === Tint.Cyan ? Tint.Ink : Tint.Cyan);
    const first = cells(field);
    const tints = new Set<Tint>();
    for (const i of decoding) {
      const own = ownTint(grid, i);
      tints.add(own as Tint);
      expect(first.get(i)?.tint).toBe(swapped(own));
    }
    expect([...tints].sort()).toEqual([Tint.Ink, Tint.Cyan]);
    // 35 ms on, each decoding cell flips to a new glyph and swaps back
    expect(field.step(35)).toBe(true);
    const next = cells(field);
    for (const i of decoding) expect(next.get(i)?.tint).toBe(ownTint(grid, i));
  });

  it('keeps the own colour of a decoding cell half of the time', () => {
    const field = new Field(always(0.6));
    field.layout(grid, []);
    field.decode(450, 0);
    const drawn = cells(field);
    const decoding = field.hot();
    expect(decoding.length).toBeGreaterThan(0);
    for (const i of decoding) expect(drawn.get(i)?.tint).toBe(ownTint(grid, i));
  });

  it('lets a blinking cell keep its own colour, and leaves a cell alone while it blinks', () => {
    let random = always(0);
    const field = new Field(() => random());
    field.layout(grid, []);
    // the shimmer's chance, the cell, the glyph, then the colour: 0.9 keeps the cell's own
    random = seq([0, 0, 0, 0.9]);
    field.shimmer = true;
    field.step(0);
    const [i] = field.hot() as [number];
    const blink = cells(field).get(i);
    expect(blink?.tint).toBe(ownTint(grid, i));
    // the first glyph of the set, as the random source said 0
    expect(blink?.glyph).toBe('0');
    // the shimmer picks the same cell again: it is still blinking, so it stays as it is
    field.step(1);
    expect(field.hot()).toEqual([i]);
    expect(cells(field).get(i)).toEqual(blink);
  });

  it('flips the mark under the pointer and swaps a cyan cell to ink', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    const at = firstCyan(grid);
    field.move(at.x, at.y);
    field.step(1000);
    const { cols, cw, ch } = grid;
    const i = Math.floor((at.y - grid.y0) / ch) * cols + Math.floor((at.x - grid.x0) / cw);
    expect(field.hot()).toContain(i);
    expect(cells(field).get(i)?.tint).toBe(Tint.Ink);
  });

  it('keeps the colours of the mark under the pointer when the flip does not swap them', () => {
    // 0.3: enough to flip a mark cell near the pointer, too much to swap its colour
    const field = new Field(always(0.3));
    field.layout(grid, []);
    const at = firstCyan(grid);
    field.move(at.x, at.y);
    field.step(1000);
    const hot = field.hot();
    const drawn = cells(field);
    const marked = hot.filter((i) => ownTint(grid, i) !== null);
    expect(marked.length).toBeGreaterThan(0);
    for (const i of marked) expect(drawn.get(i)?.tint).toBe(ownTint(grid, i));
  });

  it('flips a cell under the pointer again only after its next flip time', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    const at = firstCyan(grid);
    field.move(at.x, at.y);
    field.step(1000);
    const first = cells(field);
    // 10 ms on, every cell flipped at 1000 waits until 1050
    expect(field.step(1010)).toBe(false);
    expect(cells(field)).toEqual(first);
  });

  it('leaves the decoding mark to its decode while the pointer is on it', () => {
    const field = new Field(always(0));
    field.layout(grid, []);
    field.decode(450, 0);
    const decoding = field.hot();
    const drawn = cells(field);
    const i = decoding[0] as number;
    const x = grid.x0 + ((i % grid.cols) + 0.5) * grid.cw;
    const y = grid.y0 + (Math.floor(i / grid.cols) + 0.5) * grid.ch;
    field.move(x, y);
    // before the decode's next flip at 35 ms, the pointer changes none of the decoding cells
    field.step(10);
    const after = cells(field);
    for (const j of decoding) expect(after.get(j)).toEqual(drawn.get(j));
  });
});
