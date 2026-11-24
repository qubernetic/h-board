import phosphor from '../assets/fonts/phosphor-map.json';

const CODES = new Map(Object.entries(phosphor.regular));

/** The name of every icon in the bundled Phosphor font. */
export const GLYPH_NAMES: readonly string[] = [...CODES.keys()];
const GLOBE = 'e288';

/** The character of the Phosphor icon `name` in the bundled font; a globe for a name the font lacks. */
export function glyph(name: string): string {
  return String.fromCodePoint(parseInt(CODES.get(name) ?? GLOBE, 16));
}
