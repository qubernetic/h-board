/**
 * The resting character field behind the page: the faint dots of `field()` in `docs/design/gen/build.py`, on a
 * grid of `cw` x `ch` px cells. The pointer trail and the motion come later.
 */
export interface Field {
  readonly cw: number;
  readonly ch: number;
  /** One line per row of cells, a dot or a space per cell, trailing spaces cut. */
  readonly text: string;
}

/** The same cells on every layout: a stable hash picks 5% of them. */
function isDot(c: number, r: number): boolean {
  // the drawing's Python ints do not overflow; BigInt keeps the same bits
  return ((BigInt(c) * 73856093n) ^ (BigInt(r) * 19349663n)) % 100n < 5n;
}

export function fieldOf(w: number, h: number): Field {
  const [cw, ch] = w < 2200 ? [7, 14] : [8, 16];
  const cols = Math.floor(w / cw) + 1;
  const rows = Math.floor(h / ch) + 1;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) line += isDot(c, r) ? '·' : ' ';
    lines.push(line.trimEnd());
  }
  return { cw, ch, text: lines.join('\n') };
}
