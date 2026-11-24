import { describe, expect, it } from 'vitest';
import {
  ENGINES,
  HISTORY_SIZE,
  SEARCH_ENGINES,
  SITE_SEARCHES,
  addressOf,
  emptyLibrary,
  engineUrl,
  hostOf,
  nextEngine,
  remember,
  sampleLibrary,
  scopeByWord,
  scopedSuggestions,
  searchTarget,
  siteSearchOf,
  siteSearchUrl,
  suggestions,
} from '../src/index';
import type { Library, Site } from '../src/index';
import { site } from './support';

const github: Site = { ...site('s9', 'github'), url: 'https://github.com', glyph: 'github-logo' };

describe('the search engines', () => {
  it('has a name and a search address for every engine a setting may name', () => {
    expect(Object.keys(SEARCH_ENGINES)).toEqual([...ENGINES]);
    for (const engine of ENGINES) expect(SEARCH_ENGINES[engine].url).toMatch(/^https:\/\/[^%]+%s$/);
  });

  it('puts the words into the engine address', () => {
    expect(engineUrl('ddg', 'rust tokio & select')).toBe('https://duckduckgo.com/?q=rust%20tokio%20%26%20select');
    expect(engineUrl('google', 'x')).toBe('https://www.google.com/search?q=x');
  });

  it('turns to the next engine and back to the first', () => {
    expect(nextEngine('ddg')).toBe('google');
    expect(nextEngine('google')).toBe('startpage');
    expect(nextEngine('startpage')).toBe('ddg');
  });
});

describe('the site searches', () => {
  it('keeps one search address with one %s per host, and an alias at most once', () => {
    const aliases = SITE_SEARCHES.flatMap((s) => (s.alias ? [s.alias] : []));
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const s of SITE_SEARCHES) expect(s.url.split('%s')).toHaveLength(2);
  });

  it('reads the host of an address without the scheme, the www and the path', () => {
    expect(hostOf('https://www.GitHub.com/qubernetic?tab=1')).toBe('github.com');
    expect(hostOf('http://infosys.beckhoff.com/ads')).toBe('infosys.beckhoff.com');
    expect(hostOf('docs.rs')).toBe('docs.rs');
  });

  it("finds a site's search by its host, also for an address deeper in the site", () => {
    expect(siteSearchOf(github)?.alias).toBe('gh');
    expect(siteSearchOf({ ...github, url: 'https://infosys.beckhoff.com/te1000' })?.alias).toBe('inf');
    expect(siteSearchOf(site('s1'))).toBeNull();
  });

  it("puts the words into the site's search address", () => {
    const search = siteSearchOf(github);
    expect(search && siteSearchUrl(search, 'tokio select')).toBe('https://github.com/search?q=tokio%20select');
  });
});

describe('the word that turns the line into a site search', () => {
  const library: Library = {
    ...emptyLibrary(),
    groups: [{ id: 'g1', name: 'Development', iconMode: 'brand', sites: [site('s1'), github] }],
  };

  it.each(['gh ', 'GitHub ', 'github.com '])('is the alias, the name or the host and a space: %j', (raw) => {
    expect(scopeByWord(library, raw)?.id).toBe('s9');
  });

  it.each(['gh', 'gh rust', ' gh ', 'so ', 's1 '])('is nothing else: %j', (raw) => {
    expect(scopeByWord(library, raw)).toBeNull();
  });
});

describe('the suggestions', () => {
  const library = sampleLibrary();
  const development = library.groups.findIndex((group) => group.name === 'Development');

  it('shows only the history while nothing is typed, at most five', () => {
    const history = ['a', 'b', 'c', 'd', 'e', 'f'];
    const items = suggestions(library, development, '  ', history);
    expect(items.map((item) => [item.kind, item.text])).toEqual(history.slice(0, 5).map((text) => ['history', text]));
    expect(items[0]?.meta).toBe('history');
  });

  it("puts the user's own sites first, with their group, then two matching searches from the history", () => {
    const history = ['twincat 3.1.4026 release notes', 'rust tokio select', 'twincat ads', 'twincat ads io'];
    const items = suggestions(library, development, 'twincat ads', history);
    expect(items.map((item) => item.kind)).toEqual(['site', 'site', 'site', 'history', 'history']);
    expect(items[0]).toMatchObject({ text: 'beckhoff infosys', meta: 'Development · own site', icon: 'book-open' });
    expect(items[0]?.url).toBe('https://infosys.beckhoff.com');
    expect(items.slice(3).map((item) => item.text)).toEqual(['twincat 3.1.4026 release notes', 'twincat ads io']);
  });

  it('ranks a site whose name starts with the words first, and the group in view before the others', () => {
    const items = suggestions(library, development, 'git', []);
    expect(items.map((item) => item.text)).toEqual(['github', 'gitlab', 'ghcr']);
    const two: Library = {
      ...emptyLibrary(),
      groups: [
        { id: 'g1', name: 'One', iconMode: 'brand', sites: [site('s1', 'notes')] },
        { id: 'g2', name: 'Two', iconMode: 'brand', sites: [site('s2', 'notes')] },
      ],
    };
    expect(suggestions(two, 1, 'notes', []).map((item) => item.meta)).toEqual(['Two · own site', 'One · own site']);
  });

  it('marks a site that has a search, so Tab can search inside it', () => {
    const [first] = suggestions(library, development, 'github', []);
    expect(first?.scope?.name).toBe('github');
    const [mail] = suggestions(library, 0, 'mail', []);
    expect(mail?.scope).toBeUndefined();
  });

  it('inside a site: one row that searches the site, or none while nothing is typed', () => {
    expect(scopedSuggestions(github, ' tokio ')).toEqual([
      {
        kind: 'scoped',
        text: 'tokio',
        meta: 'search on github.com',
        icon: 'magnifying-glass',
        url: 'https://github.com/search?q=tokio',
      },
    ]);
    expect(scopedSuggestions(github, ' ')).toEqual([]);
    expect(scopedSuggestions(site('s1'), 'tokio')).toEqual([]);
  });
});

describe('where a search goes', () => {
  it.each([
    ['github.com/qubernetic', 'https://github.com/qubernetic'],
    ['http://ha.example.com:8123', null],
    ['http://ha.example.com/lovelace', 'http://ha.example.com/lovelace'],
    ['docs.rs', 'https://docs.rs'],
    ['rust tokio', null],
    ['tokio', null],
  ])('opens an address as it is: %s', (text, url) => {
    expect(addressOf(text)).toBe(url);
  });

  it('opens an address without remembering it', () => {
    expect(searchTarget('docs.rs', 'ddg', null)).toEqual({ url: 'https://docs.rs', remember: null });
  });

  it('sends words to the engine and remembers them', () => {
    expect(searchTarget(' rust tokio ', 'startpage', null)).toEqual({
      url: 'https://www.startpage.com/do/search?q=rust%20tokio',
      remember: 'rust tokio',
    });
  });

  it('inside a site, sends anything to the site and remembers nothing', () => {
    expect(searchTarget('docs.rs', 'ddg', github)).toEqual({ url: 'https://github.com/search?q=docs.rs', remember: null });
  });

  it('goes nowhere with nothing typed', () => {
    expect(searchTarget('   ', 'ddg', null)).toBeNull();
  });

  it('can search the words of an address too', () => {
    expect(searchTarget('docs.rs', 'ddg', null, { address: false })?.url).toBe('https://duckduckgo.com/?q=docs.rs');
  });
});

describe('the history', () => {
  it('keeps the newest search first, once, and the last five', () => {
    expect(HISTORY_SIZE).toBe(5);
    expect(remember(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(remember(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});
