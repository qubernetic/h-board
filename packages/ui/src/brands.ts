/// <reference types="vite/client" />
import { hostOf } from '@h-board/core';

/** A bundled brand mark: its Simple Icons slug, its title and its SVG path on a 24 x 24 box. */
export interface Brand {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
}

// The marks are bundled with the page (see assets/brands/NOTICE); nothing is fetched.
const FILES = import.meta.glob<string>('../assets/brands/*.svg', { query: '?raw', import: 'default', eager: true });

/** Every bundled mark, by slug. */
export const BRANDS: readonly Brand[] = Object.entries(FILES)
  .map(([file, svg]) => ({
    // every file is a Simple Icons SVG with one title and one path; the titles hold no character references
    slug: file.slice(file.lastIndexOf('/') + 1, -'.svg'.length),
    title: String(/<title>([^<]*)<\/title>/.exec(svg)?.[1]),
    path: String(/<path d="([^"]*)"/.exec(svg)?.[1]),
  }))
  .sort((a, b) => a.slug.localeCompare(b.slug));

const BY_SLUG = new Map(BRANDS.map((brand) => [brand.slug, brand]));

export const hasBrand = (slug: string | null): boolean => slug !== null && BY_SLUG.has(slug);

const SVG = 'http://www.w3.org/2000/svg';

/** The mark of `slug` as an SVG in the current colour, or `null` for a slug that is not bundled. */
export function brandMark(doc: Document, slug: string): SVGSVGElement | null {
  const brand = BY_SLUG.get(slug);
  if (!brand) return null;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'brand');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', brand.path);
  svg.append(path);
  return svg;
}

/** The slug of the bundled mark whose name is a part of the address's host (`github` for github.com), or `null`. */
export function guessBrand(url: string): string | null {
  const labels = hostOf(url).split('.');
  if (labels.length < 2) return null;
  for (const label of labels.slice(0, -1).reverse()) {
    if (BY_SLUG.has(label)) return label;
  }
  return null;
}
