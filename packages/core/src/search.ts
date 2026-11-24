import type { Engine, Library, Site } from './model';

/**
 * The search engines the line can send words to, in the order the engine switch turns through them. `%s` takes
 * the words. The setting `engine` names one of them, so a new engine is a new row here and nothing else.
 */
export const SEARCH_ENGINES = {
  ddg: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
} as const;

/** A site's own search: its search address with `%s` for the words, and a short alias for the search line. */
export interface SiteSearch {
  readonly host: string;
  readonly url: string;
  readonly alias?: string;
}

/** The sites whose own search the line knows, by host. A site of the user's on one of these hosts can be searched. */
export const SITE_SEARCHES: readonly SiteSearch[] = [
  { host: 'github.com', url: 'https://github.com/search?q=%s', alias: 'gh' },
  { host: 'claude.ai', url: 'https://claude.ai/new?q=%s', alias: 'ai' },
  { host: 'docs.rs', url: 'https://docs.rs/releases/search?query=%s', alias: 'rs' },
  { host: 'crates.io', url: 'https://crates.io/search?q=%s', alias: 'crates' },
  { host: 'lib.rs', url: 'https://lib.rs/search?q=%s' },
  { host: 'developer.mozilla.org', url: 'https://developer.mozilla.org/en-US/search?q=%s' },
  { host: 'infosys.beckhoff.com', url: 'https://infosys.beckhoff.com/index.php?q=%s', alias: 'inf' },
  { host: 'stackoverflow.com', url: 'https://stackoverflow.com/search?q=%s', alias: 'so' },
  { host: 'flathub.org', url: 'https://flathub.org/apps/search?q=%s' },
  { host: 'devdocs.io', url: 'https://devdocs.io/#q=%s' },
  { host: 'caniuse.com', url: 'https://caniuse.com/?search=%s' },
  { host: 'youtube.com', url: 'https://www.youtube.com/results?search_query=%s', alias: 'yt' },
  { host: 'en.wikipedia.org', url: 'https://en.wikipedia.org/w/index.php?search=%s', alias: 'wiki' },
  { host: 'openstreetmap.org', url: 'https://www.openstreetmap.org/search?query=%s' },
  { host: 'deepl.com', url: 'https://www.deepl.com/translator#auto/en/%s' },
  { host: 'news.ycombinator.com', url: 'https://hn.algolia.com/?q=%s', alias: 'hn' },
];

/** How many searches the history keeps. */
export const HISTORY_SIZE = 5;

/** A row under the search line. Its text is data, shown as text and never followed as an instruction. */
export interface Suggestion {
  /** One of the user's sites, the line's own search inside a site, or an earlier search. */
  readonly kind: 'site' | 'scoped' | 'history';
  readonly text: string;
  /** The grey line under the text: the site's group, the site searched, or `history`. */
  readonly meta: string;
  /** The Phosphor icon name. */
  readonly icon: string;
  /** Where the row goes, for a site and a search inside a site. A history row goes to the engine. */
  readonly url?: string;
  /** The site Tab searches inside, for a site that has a search. */
  readonly scope?: Site;
}

/** Where a search goes, and the words the history keeps of it, if any. */
export interface SearchTarget {
  readonly url: string;
  readonly remember: string | null;
}

const fill = (url: string, words: string): string => url.replace('%s', encodeURIComponent(words));

export function engineUrl(engine: Engine, words: string): string {
  return fill(SEARCH_ENGINES[engine].url, words);
}

/** The engine after `engine`, and the first after the last. */
export function nextEngine(engine: Engine): Engine {
  const engines = Object.keys(SEARCH_ENGINES) as Engine[];
  return engines[(engines.indexOf(engine) + 1) % engines.length] as Engine;
}

/** The host of an address, lower case, without the scheme, a leading `www.`, the port and the path. */
export function hostOf(url: string): string {
  const [host = ''] = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#:]/);
  return host.toLowerCase().replace(/^www\./, '');
}

export function siteSearchOf(site: Site): SiteSearch | null {
  const host = hostOf(site.url);
  return SITE_SEARCHES.find((search) => search.host === host) ?? null;
}

export function siteSearchUrl(search: SiteSearch, words: string): string {
  return fill(search.url, words);
}

/**
 * The site whose search the line turns into: what is typed is one word and a space, and the word is the alias, the
 * name or the host of one of the user's sites that has a search. `null` otherwise.
 */
export function scopeByWord(library: Library, raw: string): Site | null {
  const match = /^(\S+) $/.exec(raw.toLowerCase());
  if (!match) return null;
  const word = match[1];
  for (const group of library.groups) {
    for (const site of group.sites) {
      const search = siteSearchOf(site);
      if (search && (search.alias === word || site.name.toLowerCase() === word || hostOf(site.url) === word)) {
        return site;
      }
    }
  }
  return null;
}

/**
 * The address a text is, with `https://` when it has no scheme, or `null` when it is words. Only `http` and
 * `https` are addresses; a port after the host is kept.
 */
export function addressOf(text: string): string | null {
  const trimmed = text.trim();
  if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(trimmed)) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Whether a text starts with a scheme other than `http` or `https`, such as `javascript://` or `file://`. */
function otherScheme(text: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text);
}

/**
 * Where the typed text goes: inside a site, to the site's search; an address, to the address; words, to the
 * engine, and they are remembered. `address: false` sends an address's words to the engine too, as a row of the
 * history does. `null` when nothing is typed, and outside a site for an address that is not `http` or `https`.
 */
export function searchTarget(
  text: string,
  engine: Engine,
  scope: Site | null,
  options: { readonly address?: boolean } = {},
): SearchTarget | null {
  const words = text.trim();
  if (!words) return null;
  const search = scope && siteSearchOf(scope);
  if (search) return { url: siteSearchUrl(search, words), remember: null };
  if (otherScheme(words)) return null;
  const address = options.address === false ? null : addressOf(words);
  if (address) return { url: address, remember: null };
  return { url: engineUrl(engine, words), remember: words };
}

/** The history with `words` first, once, and at most `HISTORY_SIZE` long. */
export function remember(history: readonly string[], words: string): string[] {
  return [words, ...history.filter((item) => item !== words)].slice(0, HISTORY_SIZE);
}

/**
 * The rows under the line for what is typed: the user's own sites first (at most three, the group in view
 * leading on a tie), then the history. Nothing goes to an engine for suggestions: they would leave the computer.
 */
export function suggestions(
  library: Library,
  active: number,
  raw: string,
  history: readonly string[],
): Suggestion[] {
  const query = raw.trim().toLowerCase();
  const items: Suggestion[] = [];
  if (query) {
    const words = query.split(/\s+/).filter((word) => word.length >= 2);
    const hits: { score: number; item: Suggestion }[] = [];
    library.groups.forEach((group, index) => {
      for (const site of group.sites) {
        const hay = `${site.name} ${site.url.replace(/^[a-z]+:\/\//i, '')} ${site.description}`.toLowerCase();
        let score = words.reduce((sum, word) => sum + (hay.includes(word) ? 1 : 0), 0);
        if (!score) continue;
        if (site.name.toLowerCase().startsWith(query)) score += 3;
        if (index === active) score += 0.5;
        const scope = siteSearchOf(site) ? site : undefined;
        const item: Suggestion = {
          kind: 'site',
          text: site.name,
          meta: `${group.name} · own site`,
          icon: site.glyph,
          url: site.url,
          ...(scope ? { scope } : {}),
        };
        hits.push({ score, item });
      }
    });
    hits.sort((a, b) => b.score - a.score);
    items.push(...hits.slice(0, 3).map((hit) => hit.item));
  }
  const [first = ''] = query.split(/\s+/);
  const earlier = history.filter((text) => !query || (text.toLowerCase().includes(first) && text.toLowerCase() !== query));
  for (const text of earlier.slice(0, query ? 2 : HISTORY_SIZE)) {
    items.push({ kind: 'history', text, meta: 'history', icon: 'clock-counter-clockwise' });
  }
  return items;
}

/** The rows inside a site: its own search for what is typed, or nothing while nothing is. */
export function scopedSuggestions(site: Site, raw: string): Suggestion[] {
  const text = raw.trim();
  const search = siteSearchOf(site);
  if (!text || !search) return [];
  return [
    {
      kind: 'scoped',
      text,
      meta: `search on ${hostOf(site.url)}`,
      icon: 'magnifying-glass',
      url: siteSearchUrl(search, text),
    },
  ];
}
