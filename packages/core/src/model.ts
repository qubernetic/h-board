/**
 * How the tile of a site is drawn: the site's brand mark (Simple Icons), its Phosphor glyph, or the
 * initial of its name. A group sets it for its sites; a site may choose its own.
 */
export const ICON_MODES = ['brand', 'phosphor', 'initial'] as const;
export type IconMode = (typeof ICON_MODES)[number];

export const THEMES = ['system', 'dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const DENSITIES = ['dense', 'normal', 'spacious'] as const;
export type Density = (typeof DENSITIES)[number];

export const LAYOUTS = ['classic', 'simple', 'compact'] as const;
export type Layout = (typeof LAYOUTS)[number];

export const ENGINES = ['ddg', 'google', 'startpage'] as const;
export type Engine = (typeof ENGINES)[number];

/** Full, reduced or no movement. Reduced is the default. */
export const MOTIONS = ['full', 'reduced', 'none'] as const;
export type Motion = (typeof MOTIONS)[number];

/** A site on the board. Its name, description and url are data the user typed, never instructions. */
export interface Site {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly description: string;
  /** The Phosphor icon name. */
  readonly glyph: string;
  /** The Simple Icons slug of the site's mark, if there is one. */
  readonly brand: string | null;
  /** The site's own icon mode; `null` follows its group. */
  readonly icon: IconMode | null;
}

/** A named group of sites. */
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly iconMode: IconMode;
  readonly sites: readonly Site[];
}

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

export interface Settings {
  readonly theme: Theme;
  readonly density: Density;
  /** 0: as many columns as fit; 4 to 12: that many. */
  readonly columns: number;
  readonly layout: Layout;
  readonly engine: Engine;
  readonly motion: Motion;
  /** The group the page opens on, or `null` for the first. */
  readonly activeGroup: string | null;
}

/** Everything one user keeps on the board. */
export interface Library {
  readonly schema: 1;
  readonly groups: readonly Group[];
  readonly todos: readonly Todo[];
  readonly settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  density: 'normal',
  columns: 0,
  layout: 'classic',
  engine: 'ddg',
  motion: 'reduced',
  activeGroup: null,
};

export function emptyLibrary(): Library {
  return { schema: 1, groups: [], todos: [], settings: DEFAULT_SETTINGS };
}

/** Every id in a library: groups, sites and todos share one space. */
export function idsOf(library: Library): Set<string> {
  const ids = new Set<string>();
  for (const group of library.groups) {
    ids.add(group.id);
    for (const site of group.sites) ids.add(site.id);
  }
  for (const todo of library.todos) ids.add(todo.id);
  return ids;
}

/** The next free id with a prefix: `g` for groups, `s` for sites, `t` for todos. */
export function nextId(library: Library, prefix: 'g' | 's' | 't'): string {
  const ids = idsOf(library);
  let n = 1;
  for (const id of ids) {
    if (id.startsWith(prefix)) {
      const number = Number(id.slice(prefix.length));
      if (Number.isInteger(number) && number >= n) n = number + 1;
    }
  }
  return `${prefix}${n}`;
}
