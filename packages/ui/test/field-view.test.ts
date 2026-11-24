// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { startGrid } from '../src/field';
import { FieldView } from '../src/field-view';
import { fakeFrames } from './mount';

/** A 2D context that keeps what was drawn. */
function fakeContext() {
  const drawn: { glyph: string; x: number; y: number; colour: string; alpha: number }[] = [];
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    setTransform: () => undefined,
    clearRect: () => drawn.splice(0),
    measureText: () => ({ fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0 }),
    fillText(glyph: string, x: number, y: number) {
      drawn.push({ glyph, x, y, colour: ctx.fillStyle, alpha: ctx.globalAlpha });
    },
  };
  return { ctx, drawn };
}

function view() {
  const frames = fakeFrames();
  const field = new FieldView(document, window, frames, () => 0);
  const { ctx, drawn } = fakeContext();
  field.canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  field.canvas.style.setProperty('--dot', 'rgb(1, 1, 1)');
  field.canvas.style.setProperty('--glyph', 'rgb(3, 3, 3)');
  document.body.append(field.canvas);
  field.layout(startGrid(1440, 900), [], 1440, 900);
  return { field, frames, drawn };
}

describe('the field on its canvas', () => {
  it('draws the dots in the dot colour, at the middle of their cells', () => {
    const { field, drawn } = view();
    expect(drawn).toHaveLength(664);
    expect(drawn[0]).toMatchObject({ glyph: '·', x: 3.5, colour: 'rgb(1, 1, 1)', alpha: 1 });
    expect(field.canvas.style.width).toBe('1440px');
    expect(field.canvas.width).toBe(1440);
  });

  it('runs the trail frame by frame while it is live, and stops', () => {
    const { field, frames, drawn } = view();
    field.move(400, 400);
    frames.advance(16);
    expect(drawn.some((cell) => cell.glyph !== '·')).toBe(false);
    field.setLive(true, false);
    expect(field.isLive).toBe(true);
    field.move(400, 400);
    frames.advance(16);
    expect(drawn.some((cell) => cell.glyph !== '·')).toBe(true);
    field.setLive(false, false);
    frames.advance(400);
    expect(drawn.some((cell) => cell.glyph !== '·')).toBe(true);
    field.stop();
    expect(field.isLive).toBe(false);
  });

  it('draws the shockwave and lets go of it', () => {
    const { field, drawn } = view();
    field.ring({ x: 700, y: 450, r: 200, band: 72 });
    expect(drawn.some((cell) => cell.glyph !== '·')).toBe(true);
    field.ring(null);
    field.leave();
  });
});
