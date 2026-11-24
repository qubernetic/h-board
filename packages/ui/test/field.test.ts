import { describe, expect, it } from 'vitest';
import { fieldOf } from '../src/field';

describe('the character field', () => {
  it('puts the dots where the drawing has them', () => {
    const field = fieldOf(1440, 900);
    expect(field).toMatchObject({ cw: 7, ch: 14 });
    const lines = field.text.split('\n');
    expect(lines).toHaveLength(65);
    // the numbers of build.py's field(): 664 dots, and these in the first row
    expect([...field.text].filter((char) => char === '·')).toHaveLength(664);
    expect(lines[0]?.slice(0, 80)).toBe(
      '·             ·             ·                            ·             ·        ',
    );
    expect(lines.every((line) => line === line.trimEnd())).toBe(true);
  });

  it('uses a larger cell from 2200 px', () => {
    expect(fieldOf(2560, 1360)).toMatchObject({ cw: 8, ch: 16 });
  });
});
