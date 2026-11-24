import phosphor from '../assets/fonts/phosphor-map.json';

const CODES = new Map(Object.entries(phosphor.regular));

/** The character of the Phosphor icon `name` in the bundled font; a globe for a name the font lacks. */
export function glyph(name: string): string {
  return String.fromCodePoint(parseInt(CODES.get(name) ?? CODES.get('globe') ?? 'e288', 16));
}
