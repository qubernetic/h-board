import { describe, expect, it } from 'vitest';
import { DENSITY, drum, layout, round, wheelLayout } from '../src/index';

// The expected numbers are what `layout()` of docs/design/gen/build.py gives for the same viewport, so the page
// and the frames in docs/design/png/ agree. 30 tiles: the 29 sites of the drawing's active group and the new-site
// tile.
describe('layout', () => {
  it('lays out the 1440 x 900 reference frame', () => {
    const L = layout(1440, 900, 'normal', 0, 30);
    expect(L).toMatchObject({
      rail: 280,
      margin: 48,
      gap: 16,
      x0: 328,
      columns: 5,
      rows: 3,
      rowsTotal: 6,
      scroll: true,
      cardW: 200,
      cardH: 112,
      pitch: 128,
      mainW: 1064,
      right: 1392,
      clock: 88,
      clockY: 117,
      top: 97,
      search: [328, 234, 632, 52],
      secY: 314,
      gridY: 344,
      viewH: 504,
      gridBottom: 848,
      place: 'hero',
      todo: [1152, 97, 240],
      weather: null,
      inline: false,
      bottom: 860,
    });
  });

  it('puts the to-dos into a side column from 1800 px', () => {
    const L = layout(1920, 1000, 'normal', 0, 30);
    expect(L).toMatchObject({
      columns: 6,
      rows: 4,
      rowsTotal: 5,
      scroll: true,
      clock: 96,
      search: [328, 242, 848, 60],
      secY: 342,
      gridY: 372,
      viewH: 576,
      place: 'side',
      todo: [1632, 97, 240],
      weather: [1632, 293, 240],
    });
  });

  it('puts the search beside a large clock and the to-dos under the grid on a tall screen', () => {
    const L = layout(2560, 1360, 'normal', 0, 30);
    expect(L).toMatchObject({
      rail: 360,
      margin: 80,
      x0: 440,
      columns: 9,
      cardW: 212,
      rows: 4,
      scroll: false,
      clock: 176,
      clockY: 164,
      top: 144,
      search: [1124, 285, 1352, 60],
      secY: 413,
      gridY: 443,
      viewH: 496,
      place: 'strip',
      todo: [440, 1009, 260],
      weather: [896, 1009, 340],
      inline: true,
    });
  });

  it('stops the content block at 2600 px and centres it', () => {
    const L = layout(3440, 1360, 'normal', 0, 30);
    expect(L).toMatchObject({
      margin: 96,
      x0: 600,
      columns: 12,
      cardW: 202,
      mainW: 2600,
      right: 3200,
      rows: 3,
      search: [1254, 317, 1946, 60],
      secY: 470,
      gridY: 500,
      viewH: 368,
    });
  });

  it('sizes the cards by density', () => {
    expect(layout(1920, 1000, 'dense', 0, 30)).toMatchObject({
      gap: 12,
      columns: 7,
      cardW: 172,
      cardH: 64,
      rows: 5,
      scroll: false,
      top: 171,
      gridY: 446,
      viewH: 368,
    });
    expect(layout(1920, 1000, 'spacious', 0, 30)).toMatchObject({
      gap: 24,
      columns: 4,
      cardW: 302,
      cardH: 148,
      rows: 3,
      rowsTotal: 8,
      scroll: true,
    });
    expect(layout(2560, 1360, 'spacious', 0, 30).cardH).toBe(192);
    expect(DENSITY.normal).toEqual({ min: 200, max: 260, h: 112, gap: 16 });
  });

  it('takes a fixed column count, with cards at least 140 px wide', () => {
    expect(layout(1440, 900, 'normal', 6, 30)).toMatchObject({ columns: 6, cardW: 164, search: [328, 234, 704, 52] });
    expect(layout(1440, 900, 'normal', 12, 30)).toMatchObject({ columns: 12, cardW: 140 });
  });

  it('centres a short group in the height', () => {
    expect(layout(1440, 900, 'normal', 0, 1)).toMatchObject({ rows: 1, scroll: false, top: 248, gridY: 495, viewH: 112 });
  });

  it('keeps everything inside a small screen, with a narrower rail', () => {
    const L = layout(960, 640, 'normal', 0, 30);
    expect(L.rail).toBe(220);
    expect(L.search[2]).toBeGreaterThan(0);
    expect(L.search[0] + L.search[2]).toBeLessThanOrEqual(L.right);
    expect(L.right + L.margin).toBeLessThanOrEqual(960);
  });

  it('gives the to-do list the room above the grid beside the clock', () => {
    expect(layout(1440, 900, 'normal', 0, 30).todoH).toBe(147);
    expect(layout(1920, 1000, 'normal', 0, 30).todoH).toBe(150);
  });
});

const GROUPS = ['Start', 'Development', 'Qubernetic', 'Automation', 'Media', 'Finance', 'Reading', 'Tools'];

describe('the wheel', () => {
  it('grows the drum with the rail', () => {
    expect(wheelLayout(795)).toEqual({ cy: 398, s: 1.206, fb: 1.206, lh: 51 });
    expect(wheelLayout(1255)).toEqual({ cy: 628, s: 1.6, fb: 1.25, lh: 52 });
    expect(wheelLayout(300)).toMatchObject({ s: 1, fb: 1, lh: 42 });
    // build.py rounds a half to the even number, as Python does: 42 x 1.25 = 52.5 gives 52
    expect(wheelLayout(855)).toEqual({ cy: 428, s: 1.326, fb: 1.25, lh: 52 });
    expect(round(52.5)).toBe(52);
    expect(round(53.5)).toBe(54);
    expect(round(-1.5)).toBe(-2);
    expect(round(2.4)).toBe(2);
  });

  it('shows three neighbours each way round the active group, wrapping round the list', () => {
    const rows = drum(1, GROUPS, 280, 795);
    expect(rows.map((row) => [row.index, row.distance])).toEqual([
      [6, -3],
      [7, -2],
      [0, -1],
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
    const active = rows[3];
    expect(active).toMatchObject({ y: 398, opacity: 1, visible: true });
    expect(active?.size).toBe(Math.min(Math.round(26 * 1.206), Math.floor((280 - 72) / (11 * 0.6))));
    expect(rows[4]).toMatchObject({ y: 398 + 64 * 1.206, size: Math.round(17 * 1.206), opacity: 0.72 });
    expect(rows[0]).toMatchObject({ y: 398 - 158 * 1.206, size: Math.round(13 * 1.206), opacity: 0.3 });
  });

  it('hides a neighbour that would leave the rail, and repeats none in a short list', () => {
    expect(drum(0, GROUPS, 280, 200).filter((row) => !row.visible).length).toBeGreaterThan(0);
    expect(drum(0, GROUPS.slice(0, 3), 280, 795).map((row) => row.index)).toEqual([2, 0, 1]);
    expect(drum(0, GROUPS.slice(0, 4), 280, 795).map((row) => row.distance)).toEqual([-1, 0, 1, 2]);
    expect(drum(0, [], 280, 795)).toEqual([]);
  });

  it('fits a long name into the lens', () => {
    const [row] = drum(0, ['A group with a very long name'], 280, 795);
    expect(row?.size).toBe(Math.floor((280 - 72) / (29 * 0.6)));
  });
});
