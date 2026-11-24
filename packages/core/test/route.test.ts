import { describe, expect, it } from 'vitest';
import { emptyLibrary, route } from '../src/index';
import type { Library, Site } from '../src/index';
import { site } from './support';

const at = (id: string, name: string, url: string): Site => ({ ...site(id, name), url });

const github = at('gh', 'GitHub', 'https://github.com');
const hackerNews = at('hn', 'Hacker News', 'https://news.ycombinator.com');
const docs = at('rs', 'docs.rs', 'https://docs.rs');
const youtube = at('yt', 'YouTube', 'https://www.youtube.com/feed/subscriptions');
const blog = at('blog', 'Blog', 'https://blog.example.com/posts');
const many = Array.from({ length: 29 }, (_, i) => site(`m${i}`, `Card ${i}`));

/** Three groups: two small ones and one with more cards than letters. */
const library: Library = {
  ...emptyLibrary(),
  groups: [
    { id: 'g1', name: 'Start', iconMode: 'brand', sites: [github, hackerNews, youtube] },
    { id: 'g2', name: 'Development', iconMode: 'phosphor', sites: [docs, blog] },
    { id: 'g3', name: 'Many', iconMode: 'phosphor', sites: many },
  ],
};

const urlOf = (text: string, active = 0, lib: Library = library): string | undefined => route(lib, text, active)?.url;

describe('route', () => {
  it('routes nothing typed nowhere, so that the host opens the board', () => {
    expect(route(library, '', 0)).toBeNull();
    expect(route(library, '   ', 0)).toBeNull();
  });

  it('opens a site by its name, whatever the case and the spaces around it', () => {
    expect(route(library, '  GitHub ', 0)).toEqual({ kind: 'site', site: github, url: 'https://github.com' });
    expect(urlOf('hacker news')).toBe('https://news.ycombinator.com');
    expect(urlOf('blog')).toBe('https://blog.example.com/posts');
  });

  it('opens a site by the alias of its search', () => {
    expect(urlOf('gh')).toBe('https://github.com');
    expect(urlOf('hn')).toBe('https://news.ycombinator.com');
    expect(urlOf('yt')).toBe('https://www.youtube.com/feed/subscriptions');
  });

  it('opens a site by its host, or the first part of it, without www', () => {
    expect(urlOf('docs.rs')).toBe('https://docs.rs');
    expect(urlOf('docs')).toBe('https://docs.rs');
    expect(urlOf('youtube.com')).toBe('https://www.youtube.com/feed/subscriptions');
    expect(urlOf('youtube')).toBe('https://www.youtube.com/feed/subscriptions');
    expect(urlOf('news')).toBe('https://news.ycombinator.com');
  });

  it('opens a card by its jump code in the group seen last', () => {
    expect(route(library, 'a', 0)).toEqual({ kind: 'site', site: github, url: 'https://github.com' });
    expect(urlOf('s', 0)).toBe('https://news.ycombinator.com');
    expect(urlOf('s', 1)).toBe('https://blog.example.com/posts');
    expect(urlOf('sa', 2)).toBe(many[26]?.url);
  });

  it('opens a card of another group by its number and the code', () => {
    expect(urlOf('2a')).toBe('https://docs.rs');
    expect(urlOf('3aa')).toBe(many[0]?.url);
    expect(urlOf('3sd')).toBe(many[28]?.url);
  });

  it('takes the code as typed on the page, with the f in front and a space or not', () => {
    expect(urlOf('f2s')).toBe('https://blog.example.com/posts');
    expect(urlOf('F2S')).toBe('https://blog.example.com/posts');
    expect(urlOf('f 2s')).toBe('https://blog.example.com/posts');
    expect(urlOf('fs')).toBe('https://news.ycombinator.com');
    expect(urlOf('f s')).toBe('https://news.ycombinator.com');
    expect(urlOf('f3sa')).toBe(many[26]?.url);
    expect(urlOf('fsa', 2)).toBe(many[26]?.url);
  });

  it('reads f alone as the code f', () => {
    const four: Library = { ...library, groups: [{ id: 'g4', name: 'Four', iconMode: 'phosphor', sites: many.slice(0, 4) }] };
    expect(urlOf('f', 0, four)).toBe(many[3]?.url);
  });

  it('keeps the group seen last inside the library', () => {
    const two: Library = { ...library, groups: library.groups.slice(0, 2) };
    expect(urlOf('a', 7, two)).toBe('https://docs.rs');
    expect(urlOf('a', -1, two)).toBe('https://github.com');
  });

  it('prefers a site by name over a jump code', () => {
    const named: Library = {
      ...library,
      groups: [{ id: 'g1', name: 'Start', iconMode: 'brand', sites: [github, at('s', 'S', 'https://s.example.org')] }],
    };
    expect(urlOf('s', 0, named)).toBe('https://s.example.org');
  });

  it('searches inside a site named by its alias, name or host, with the words as typed', () => {
    expect(route(library, 'gh Rust lang', 0)).toEqual({
      kind: 'search',
      site: github,
      words: 'Rust lang',
      url: 'https://github.com/search?q=Rust%20lang',
    });
    expect(urlOf('docs tokio')).toBe('https://docs.rs/releases/search?query=tokio');
    expect(urlOf('GitHub  h-board')).toBe('https://github.com/search?q=h-board');
    expect(urlOf('yt lo-fi & rain')).toBe('https://www.youtube.com/results?search_query=lo-fi%20%26%20rain');
  });

  it('sends everything else to the chosen engine, all of it', () => {
    expect(route(library, 'blog ideas', 0)).toEqual({
      kind: 'engine',
      engine: 'ddg',
      words: 'blog ideas',
      url: 'https://duckduckgo.com/?q=blog%20ideas',
    });
    expect(urlOf('z')).toBe('https://duckduckgo.com/?q=z');
    expect(urlOf('9a')).toBe('https://duckduckgo.com/?q=9a');
    expect(urlOf('weather tomorrow')).toBe('https://duckduckgo.com/?q=weather%20tomorrow');
    const google: Library = { ...library, settings: { ...library.settings, engine: 'google' } };
    expect(urlOf('Gh', 0, emptyLibrary())).toBe('https://duckduckgo.com/?q=Gh');
    expect(urlOf('gh  rust', 0, { ...google, groups: [] })).toBe('https://www.google.com/search?q=gh%20%20rust');
  });
});
