import type { Density } from './model';

/**
 * The layout rules of the start page: every measure comes from the viewport (logical px), nothing is scaled.
 * They are `layout()` and `wheel_scale()` of `docs/design/gen/build.py`, which drew the frames in
 * `docs/design/png/`, with the mock's two corrections for small screens: a narrower rail under 1280 px and a
 * search that never gets narrower than `SEARCH_MIN`.
 */

/** Rounds as Python's `round()` does, a half to the even number, so the numbers agree with build.py's. */
export function round(value: number): number {
  const floor = Math.floor(value);
  if (Math.abs(value - floor - 0.5) > 1e-9) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/** x, y, width, height. */
export type Rect = readonly [x: number, y: number, width: number, height: number];
/** x, y, width. */
export type Spot = readonly [x: number, y: number, width: number];

/** Card width limits, card height and the gap between cards, per density. */
export const DENSITY: Readonly<Record<Density, { min: number; max: number; h: number; gap: number }>> = {
  // icon, name, host; the description shows on hover
  dense: { min: 150, max: 190, h: 64, gap: 12 },
  // and one truncated line of description; the default
  normal: { min: 200, max: 260, h: 112, gap: 16 },
  // and two lines of description and the tile's number
  spacious: { min: 240, max: 320, h: 148, gap: 24 },
};

/** The header ends here: 64 px and its rule. */
export const HEADER_H = 65;
/** The status bar's height. */
export const STATUS_H = 40;
/** The height of the weather block, the taller of the two info blocks. */
const INFO_H = 206;
/** The content block stops growing here; beyond it the block is centred. */
const MAX_BLOCK = 2600;
/** The side column for the to-dos and the weather, and its distance from the grid. */
const SIDE_W = 240;
const SIDE_GUTTER = 24;
/** The narrowest search box that still shows its placeholder. */
const SEARCH_MIN = 420;

/** Where the to-dos and the weather go: beside the clock, in a side column, or in a strip under the grid. */
export type InfoPlace = 'hero' | 'side' | 'strip';

export interface PageLayout {
  readonly w: number;
  readonly h: number;
  readonly density: Density;
  /** The tiles the grid holds: the sites and the new-site tile. */
  readonly tiles: number;
  /** The width of the group wheel's rail. */
  readonly rail: number;
  readonly margin: number;
  readonly gap: number;
  /** The left edge of the content block. */
  readonly x0: number;
  readonly columns: number;
  /** The rows in view, and all rows. */
  readonly rows: number;
  readonly rowsTotal: number;
  /** More rows than fit: the grid scrolls inside its own area, and the next row peeks in. */
  readonly scroll: boolean;
  readonly cardW: number;
  readonly cardH: number;
  /** A card's height and the gap under it. */
  readonly pitch: number;
  /** The grid's width, and its right edge. */
  readonly mainW: number;
  readonly right: number;
  /** The clock's type size and top. */
  readonly clock: number;
  readonly clockY: number;
  /** The hero's top: the date label. */
  readonly top: number;
  readonly search: Rect;
  /** The search sits on the clock's line instead of under it. */
  readonly inline: boolean;
  /** The grid's label row, the grid's top, the height of the grid's area and its bottom. */
  readonly secY: number;
  readonly gridY: number;
  readonly viewH: number;
  readonly gridBottom: number;
  readonly place: InfoPlace;
  readonly todo: Spot;
  /** The room the to-do list may take before it scrolls. */
  readonly todoH: number;
  /** Where the long weather block goes; `null` where the header's one-liner is all there is. */
  readonly weather: Spot | null;
  /** The top of the status bar. */
  readonly bottom: number;
}

/**
 * Every measure of the start screen for a `w` x `h` viewport.
 *
 * - rail: 14.5% of the width, 280 to 360 px (220 px under 1280 px).
 * - margin: 48, 80 or 96 px; a content block wider than 2600 px is centred.
 * - columns: the most that keep the cards at the density's minimum width, sharing the width up to the maximum.
 *   `columns` 4 to 12 fixes the count instead (0: as many as fit); a card is then at least 140 px wide.
 * - rows: at least three show. On a short screen the hero gives way first: the search moves beside the clock,
 *   then the clock shrinks. A group with more rows than fit scrolls inside the grid's area.
 * - clock: 9.5% of the height, 88 to 128 px; 176 px on a tall screen, with the search on its line.
 * - to-dos and weather: a strip under the grid on a tall screen, a side column from 1800 px, otherwise the
 *   to-dos sit beside the clock.
 */
export function layout(w: number, h: number, density: Density, columns: number, tiles: number): PageLayout {
  const D = DENSITY[density];
  const gap = D.gap;
  const rail = Math.min(360, Math.max(w < 1280 ? 220 : 280, round((w * 0.145) / 8) * 8));
  const margin = w < 2200 ? 48 : w < 3000 ? 80 : 96;
  let x0 = rail + margin;
  const areaTop = HEADER_H;
  const areaBottom = h - STATUS_H;
  const area = areaBottom - areaTop;
  let avail = w - margin - x0;
  if (avail > MAX_BLOCK) {
    x0 += Math.floor((avail - MAX_BLOCK) / 2);
    avail = MAX_BLOCK;
  }
  const tall = h >= 1200;
  const place: InfoPlace = tall ? 'strip' : w >= 1800 ? 'side' : 'hero';
  const gridW = avail - (place === 'side' ? SIDE_W + SIDE_GUTTER : 0);
  let n: number;
  let cardW: number;
  if (columns) {
    n = columns;
    cardW = Math.max(140, Math.floor((gridW - (n - 1) * gap) / n));
  } else {
    n = Math.max(1, Math.floor((gridW + gap) / (D.min + gap)));
    cardW = Math.floor(Math.min(D.max, (gridW - (n - 1) * gap) / n));
  }
  const mainW = n * cardW + (n - 1) * gap;
  const right = x0 + mainW;
  const rowsTotal = Math.ceil(tiles / n);
  const cardH = density === 'spacious' && tall ? 192 : D.h;
  const pitch = cardH + gap;
  const col = (c: number): number => x0 + c * (cardW + gap);
  const span = (c: number): number => c * cardW + (c - 1) * gap;
  let clock = tall ? 176 : Math.min(128, Math.max(88, round((h * 0.095) / 8) * 8));
  const sh = w < 1800 ? 52 : 60;
  let inline = tall;
  let secGap = h < 950 ? 28 : 40;
  let stripGap = 0;
  const pad = 32;
  const heroOf = (): number => 20 + 1.03 * clock + (inline ? 4 : 26 + sh);
  let rows: number;
  let viewH: number;
  let top: number;
  if (tall) {
    // the hero, the grid and the info strip share the height; what is left over becomes rhythm between them
    const heroH = heroOf();
    const rowsFit = Math.floor((area - heroH - 30 - INFO_H - 4 * 40 + gap) / pitch);
    rows = Math.min(rowsTotal, Math.max(1, rowsFit));
    viewH = rows * pitch - gap + (rowsTotal > rows ? Math.floor(pitch / 2) : 0);
    const free = area - (heroH + 30 + viewH + INFO_H);
    secGap = round(free * 0.2);
    stripGap = round(free * 0.22);
    top = round(areaTop + free * 0.25);
  } else {
    const fit = (): number => Math.floor((area - heroOf() - secGap - 30 - 2 * pad + gap) / pitch);
    const want = Math.min(3, rowsTotal);
    if (fit() < want) inline = true;
    while (fit() < want && clock > 64) clock -= 8;
    const heroH = heroOf();
    rows = Math.min(rowsTotal, Math.max(1, fit()));
    if (rowsTotal > rows) {
      top = areaTop + pad;
      viewH = areaBottom - 12 - round(top + heroH + secGap + 30); // the next row peeks in
    } else {
      viewH = rows * pitch - gap;
      top = round(areaTop + Math.max(pad, (area - (heroH + secGap + 30 + viewH)) * 0.42));
    }
  }
  const scroll = rowsTotal > rows;
  const heroH = heroOf();
  const clockY = top + 20;
  const todoX = right - 240;
  const clear = x0 + 3.45 * clock + 40; // the clock and its seconds end here
  let search: Rect;
  const searchRight = right - (place === 'hero' ? 300 : 0);
  let c0 = -1;
  for (let c = 0; c < n && c0 < 0; c++) if (col(c) >= clear) c0 = c;
  if (inline && (c0 >= 0 || searchRight - clear >= SEARCH_MIN)) {
    // the search starts on the first column edge clear of the clock and its seconds, or straight after the
    // clock when that edge would leave it too narrow
    let sx = c0 >= 0 ? col(c0) : searchRight;
    if (searchRight - sx < SEARCH_MIN) sx = Math.max(round(clear), searchRight - SEARCH_MIN);
    search = [sx, round(clockY + 1.03 * clock - sh), searchRight - sx, sh];
  } else {
    const limit = place === 'hero' ? todoX - x0 - 60 : 920;
    let c1 = 1;
    for (let c = 1; c <= n; c++) if (span(c) <= limit) c1 = c;
    search = [x0, round(clockY + 1.03 * clock + 26), Math.max(span(c1), Math.min(limit, SEARCH_MIN)), sh];
  }
  const secY = round(top + heroH + secGap);
  const gridY = secY + 30;
  let todo: Spot;
  let weather: Spot | null = null;
  if (place === 'side') {
    const sx = right + SIDE_GUTTER;
    todo = [sx, top, SIDE_W];
    weather = [sx, top + 196, SIDE_W];
  } else if (place === 'strip') {
    const sy = gridY + viewH + stripGap;
    let wc = n - 1;
    for (let c = n - 1; c >= 0; c--) if (col(c) >= x0 + 400) wc = c;
    todo = [x0, sy, 260];
    weather = [col(wc), sy, 340];
  } else {
    todo = [todoX, top, 240];
  }
  return {
    w,
    h,
    density,
    tiles,
    rail,
    margin,
    gap,
    x0,
    columns: n,
    rows,
    rowsTotal,
    scroll,
    cardW,
    cardH,
    pitch,
    mainW,
    right,
    clock,
    clockY,
    top,
    search,
    inline,
    secY,
    gridY,
    viewH,
    gridBottom: gridY + viewH,
    place,
    todo,
    todoH: place === 'hero' ? Math.max(60, secY - top - 70) : 150,
    weather,
    bottom: areaBottom,
  };
}

/** The drum's middle, its growth with the rail (`s` for the spacing, `fb` for the type) and the lens' half height. */
export interface WheelLayout {
  readonly cy: number;
  readonly s: number;
  readonly fb: number;
  readonly lh: number;
}

/** The wheel of a rail `h` px tall. */
export function wheelLayout(h: number): WheelLayout {
  const s = Math.min(1.6, Math.max(1, (h / 2 - 96) / 250));
  const fb = Math.min(1.25, s);
  return { cy: round(h / 2), s, fb, lh: round(42 * fb) };
}

/** Distance from the lens, by steps: offset, type size and opacity of a group's row. */
const WHEEL_OFFS = [0, 64, 116, 158];
const WHEEL_SIZE = [26, 17, 15, 13];
const WHEEL_OP = [1, 0.72, 0.48, 0.3];
/** The text padding on the rail's left, and the room the ruler takes on its right. */
const WHEEL_PAD = 32;
const WHEEL_RIGHT = 40;

/** One group's row on the drum. */
export interface DrumRow {
  /** The group's place in the list. */
  readonly index: number;
  /** Steps from the lens: negative above it. */
  readonly distance: number;
  /** The row's middle, from the rail's top. */
  readonly y: number;
  readonly size: number;
  readonly opacity: number;
  /** Off when the row would run into the rail's head or foot. */
  readonly visible: boolean;
}

/**
 * The rows of the wheel with group `active` in the lens: up to three neighbours each way, wrapping round the
 * list, each group once. Spacing, size and opacity fall off towards the limb.
 */
export function drum(active: number, names: readonly string[], w: number, h: number): DrumRow[] {
  const count = names.length;
  const { cy, s, fb } = wheelLayout(h);
  const rows: DrumRow[] = [];
  const above = Math.min(3, Math.floor((count - 1) / 2));
  const below = Math.min(3, Math.floor(count / 2));
  for (let d = -above; d <= below && count > 0; d++) {
    const index = (((active + d) % count) + count) % count;
    const a = Math.abs(d);
    const y = cy + Math.sign(d) * (WHEEL_OFFS[a] ?? 0) * s;
    let size = round((WHEEL_SIZE[a] ?? 0) * fb);
    if (d === 0) {
      const name = names[index] ?? '';
      size = Math.min(size, Math.floor((w - WHEEL_PAD - WHEEL_RIGHT) / (Math.max(1, name.length) * 0.6)));
    }
    rows.push({ index, distance: d, y, size, opacity: WHEEL_OP[a] ?? 0, visible: d === 0 || (y > 56 && y < h - 60) });
  }
  return rows;
}
