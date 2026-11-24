import { jumpCode } from './codes';
import type { Engine, Library, Site } from './model';
import { engineUrl, hostOf, siteSearchOf, siteSearchUrl } from './search';

/**
 * Where the address bar sends what is typed: to one of the user's sites, to the search inside a site, or to the
 * chosen engine. The site's name and address are data the user typed, never instructions.
 */
export type Route =
  | { readonly kind: 'site'; readonly site: Site; readonly url: string }
  | { readonly kind: 'search'; readonly site: Site; readonly words: string; readonly url: string }
  | { readonly kind: 'engine'; readonly engine: Engine; readonly words: string; readonly url: string };

/** The site a word names: the alias of its search, its name, its host, or the first part of the host. */
function named(library: Library, word: string): Site | undefined {
  for (const group of library.groups) {
    for (const site of group.sites) {
      const host = hostOf(site.url);
      if (siteSearchOf(site)?.alias === word || site.name.toLowerCase() === word || host === word || host.split('.')[0] === word) {
        return site;
      }
    }
  }
  return undefined;
}

/** The card a jump code opens: `a` or `sa` in the group seen last, `3a` in group 3. */
function coded(library: Library, active: number, text: string): Site | undefined {
  const match = /^([1-9])?([a-z]{1,2})$/.exec(text);
  if (!match) return undefined;
  const group = library.groups[match[1] ? Number(match[1]) - 1 : active];
  if (!group) return undefined;
  const count = group.sites.length;
  return group.sites.find((_, index) => jumpCode(index, count) === match[2]);
}

/**
 * The `/go` router of the mock, for the address bar: a site's name or alias alone opens the site, a jump code
 * (`a`, `4a`, or `f4a` as typed on the page) opens a card, a site's name and words search inside the site, and
 * everything else goes to the chosen engine. `active` is the group seen last, for a code without a number.
 * `null` when nothing is typed: the host opens the board.
 */
export function route(library: Library, text: string, active: number): Route | null {
  const typed = text.trim();
  const low = typed.toLowerCase();
  if (!low) return null;
  const last = Math.min(library.groups.length - 1, Math.max(0, active));
  const site = named(library, low) ?? coded(library, last, low) ?? (/^f\s*\S/.test(low) ? coded(library, last, low.replace(/^f\s*/, '')) : undefined);
  if (site) return { kind: 'site', site, url: site.url };
  const split = /^(\S+)\s+(.+)$/.exec(low);
  const scope = split && named(library, split[1] as string);
  const search = scope && siteSearchOf(scope);
  if (scope && search) {
    const words = typed.slice((split[1] as string).length).trim();
    return { kind: 'search', site: scope, words, url: siteSearchUrl(search, words) };
  }
  const { engine } = library.settings;
  return { kind: 'engine', engine, words: typed, url: engineUrl(engine, typed) };
}
