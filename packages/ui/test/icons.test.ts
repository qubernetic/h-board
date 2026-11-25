import { describe, expect, it } from 'vitest';
import { glyph, hasGlyph } from '../src/icons';

describe('glyph', () => {
  it('finds a Phosphor icon by name', () => {
    expect(glyph('github-logo')).toBe('');
    expect(glyph('gear-six')).toBe('');
  });

  it('draws a globe for a name it does not know', () => {
    expect(glyph('no-such-icon')).toBe('');
    expect(glyph('toString')).toBe('');
  });
});

describe('hasGlyph', () => {
  it('knows the names of the bundled font only', () => {
    expect(hasGlyph('gear-six')).toBe(true);
    expect(hasGlyph('')).toBe(false);
    expect(hasGlyph('toString')).toBe(false);
  });
});
