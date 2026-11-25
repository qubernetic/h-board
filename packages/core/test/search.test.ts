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

  it('finds the history whatever the case', () => {
    const items = suggestions(library, development, 'tokio', ['Rust Tokio select']);
    expect(items.filter((item) => item.kind === 'history').map((item) => item.text)).toEqual(['Rust Tokio select']);
  });

  it('puts what is typed first, as a web search or as an address, and nothing for another scheme', () => {
    expect(suggestions(library, development, ' Twincat ADS ', [])[0]).toEqual({
      kind: 'web',
      text: 'Twincat ADS',
      meta: 'web search',
      icon: 'magnifying-glass',
    });
    expect(suggestions(library, development, 'github', []).map((item) => item.kind)).toEqual(['web', 'site', 'site']);
    expect(suggestions(library, development, 'example.org/a', [])).toEqual([
      { kind: 'web', text: 'example.org/a', meta: 'open address', icon: 'globe' },
    ]);
    expect(suggestions(library, development, 'file:///etc/hosts', [])).toEqual([]);
  });

  it("puts the user's own sites next, with their group, then two matching searches from the history", () => {
    const history = ['twincat 3.1.4026 release notes', 'rust tokio select', 'twincat ads', 'twincat ads io'];
    const items = suggestions(library, development, 'twincat ads', history);
    expect(items.map((item) => item.kind)).toEqual(['web', 'site', 'site', 'site', 'history', 'history']);
    expect(items[1]).toMatchObject({ text: 'beckhoff infosys', meta: 'Development · own site', icon: 'book-open' });
    expect(items[1]?.url).toBe('https://infosys.beckhoff.com');
    expect(items.slice(4).map((item) => item.text)).toEqual(['twincat 3.1.4026 release notes', 'twincat ads io']);
  });

  it('ranks a site whose name starts with the words first, and the group in view before the others', () => {
    const items = suggestions(library, development, 'git', []);
    expect(items.map((item) => item.text)).toEqual(['git', 'github', 'gitlab', 'ghcr']);
    const two: Library = {
      ...emptyLibrary(),
      groups: [
        { id: 'g1', name: 'One', iconMode: 'brand', sites: [site('s1', 'notes')] },
        { id: 'g2', name: 'Two', iconMode: 'brand', sites: [site('s2', 'notes')] },
      ],
    };
    expect(suggestions(two, 1, 'notes', []).map((item) => item.meta)).toEqual(['web search', 'Two · own site', 'One · own site']);
  });

  describe('what counts as a hit', () => {
    const office: Site = {
      ...site('s1', 'client gate'),
      url: 'https://gate.example.com/login',
      description: 'Public administration and tax downloads.',
    };
    const own: Library = {
      ...emptyLibrary(),
      groups: [{ id: 'g1', name: 'Finance', iconMode: 'brand', sites: [office] }],
    };
    const found = (raw: string): string[] =>
      suggestions(own, 0, raw, [])
        .filter((item) => item.kind === 'site')
        .map((item) => item.text);

    it('takes a typed word only where it starts a word of the name, the address or the description', () => {
      expect(found('mini')).toEqual([]);
      expect(found('ads')).toEqual([]);
      expect(found('ample')).toEqual([]);
      expect(found('admin')).toEqual(['client gate']);
      expect(found('GATE')).toEqual(['client gate']);
      expect(found('example.com')).toEqual(['client gate']);
      expect(found('login')).toEqual(['client gate']);
    });

    it('wants at least half of the typed words, so one word by chance does not bring a site', () => {
      expect(found('tax forms')).toEqual(['client gate']);
      expect(found('tax forms 2026')).toEqual([]);
      expect(found('public tax forms')).toEqual(['client gate']);
      expect(found('amazefit gts4 mini')).toEqual([]);
    });
  });

  it('marks a site that has a search, so Tab can search inside it', () => {
    const [web, first] = suggestions(library, development, 'github', []);
    expect(web?.scope).toBeUndefined();
    expect(first?.scope?.name).toBe('github');
    const [, mail] = suggestions(library, 0, 'mail', []);
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
    ['http://ha.example.com:8123', 'http://ha.example.com:8123'],
    ['ha.example.com:8123/lovelace', 'https://ha.example.com:8123/lovelace'],
    ['127.0.0.1:8787', 'https://127.0.0.1:8787'],
    ['HTTPS://docs.rs', 'HTTPS://docs.rs'],
    ['javascript://example.com/%0Aalert(1)', null],
    ['file://host.lan/x', null],
    ['chrome://settings.x', null],
    ['ftp://files.example.com', null],
    ['ha.example.com:', null],
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

  it('opens nothing for an address that is not http or https', () => {
    expect(searchTarget('javascript://example.com/%0Aalert(1)', 'ddg', null)).toBeNull();
    expect(searchTarget(' file://host.lan/x ', 'ddg', null, { address: false })).toBeNull();
    expect(searchTarget('file://host.lan/x', 'ddg', github)?.url).toBe('https://github.com/search?q=file%3A%2F%2Fhost.lan%2Fx');
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
