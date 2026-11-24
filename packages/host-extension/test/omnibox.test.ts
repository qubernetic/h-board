import { route, sampleLibrary } from '@h-board/core';
import type { Library, Route } from '@h-board/core';
import { ExtStore, peekLibrary } from '@h-board/store';
import { describe, expect, it } from 'vitest';
import { describeRoute, lastGroup, routeTyped, watchOmnibox } from '../src/index';
import type { Disposition, OmniboxApi, OmniboxTabs } from '../src/index';
import { FakeArea } from './area';

const library = sampleLibrary();
const BOARD = 'chrome-extension://h-board/newtab.html';

/** A stand-in for `chrome.omnibox`: the tests type and press Enter through it. */
function fakeOmnibox(): OmniboxApi & {
  descriptions: string[];
  type(text: string): void;
  enter(text: string, disposition?: Disposition): void;
} {
  const changed: ((text: string) => void)[] = [];
  const entered: ((text: string, disposition: Disposition) => void)[] = [];
  const descriptions: string[] = [];
  return {
    descriptions,
    setDefaultSuggestion: ({ description }) => void descriptions.push(description),
    onInputChanged: { addListener: (listener) => void changed.push(listener) },
    onInputEntered: { addListener: (listener) => void entered.push(listener) },
    type: (text) => {
      for (const listener of changed) listener(text);
    },
    enter: (text, disposition = 'currentTab') => {
      for (const listener of entered) listener(text, disposition);
    },
  };
}

function fakeTabs(): OmniboxTabs & { opened: unknown[] } {
  const opened: unknown[] = [];
  return {
    opened,
    update: (properties) => Promise.resolve(void opened.push({ update: properties })),
    create: (properties) => Promise.resolve(void opened.push({ create: properties })),
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('routeTyped', () => {
  const stored = (kept: Library) => (): Promise<Library | null> => Promise.resolve(kept);

  it('routes on the stored library, the codes in the group seen last', async () => {
    const area = new FakeArea();
    const first = library.groups[0];
    const third = library.groups[2];
    expect(await routeTyped(stored(library), area, 'a')).toEqual(route(library, 'a', 1));
    await lastGroup(area)(third?.id as string);
    expect((await routeTyped(stored(library), area, 'a'))?.url).toBe(third?.sites[0]?.url);
    expect((await routeTyped(stored(library), area, '1a'))?.url).toBe(first?.sites[0]?.url);
  });

  it('takes the group the page opens on, or the first, when the group seen last is gone', async () => {
    const area = new FakeArea();
    await area.set({ group: 'gone' });
    expect(await routeTyped(stored(library), area, 'aa')).toEqual(route(library, 'aa', 1));
    const plain: Library = { ...library, settings: { ...library.settings, activeGroup: null } };
    expect(await routeTyped(stored(plain), area, 'a')).toEqual(route(plain, 'a', 0));
  });

  it('opens the board on a library it cannot read and leaves it to the board to repair and say so', async () => {
    const area = new FakeArea();
    await new ExtStore(area, { initial: sampleLibrary }).apply('group.add', { name: 'Work' });
    area.items.set('library', JSON.stringify({ ...(area.read('library') as object), groups: 'lost' }));
    const before = JSON.stringify([...area.items]);
    expect(await routeTyped(() => peekLibrary(area), area, 'a')).toBeNull();
    expect(JSON.stringify([...area.items])).toBe(before);
    expect((await new ExtStore(area, { initial: sampleLibrary }).load()).notice).toContain('The stored library could not be read');
  });
});

describe('lastGroup', () => {
  it('keeps the id of the group in view in the local area', async () => {
    const area = new FakeArea();
    await lastGroup(area)('g3');
    expect(area.read('group')).toBe('g3');
  });
});

describe('describeRoute', () => {
  const github = library.groups.flatMap((group) => group.sites).find((site) => site.url.includes('github.com'));

  it('says where Enter goes', () => {
    expect(describeRoute(null)).toBe('Open H-Board');
    expect(describeRoute(route(library, 'gh', 0))).toBe(`Open <match>${github?.name ?? ''}</match> <url>${github?.url ?? ''}</url>`);
    expect(describeRoute(route(library, 'gh h-board', 0))).toBe('Search github.com for <match>h-board</match>');
    expect(describeRoute(route(library, 'rain radar', 0))).toBe('Search DuckDuckGo for <match>rain radar</match>');
  });

  it('shows names, addresses and words as text, never as markup', () => {
    const site = { id: 'x', name: '<b>Tom & Jerry</b>', url: 'https://x.example.com/?a=1&b="2"', description: '', glyph: 'globe', brand: null, icon: null };
    const opened: Route = { kind: 'site', site, url: site.url };
    expect(describeRoute(opened)).toBe(
      "Open <match>&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;</match> <url>https://x.example.com/?a=1&amp;b=&quot;2&quot;</url>",
    );
    expect(describeRoute(route(library, "<i>'it'</i>", 0))).toBe(
      'Search DuckDuckGo for <match>&lt;i&gt;&apos;it&apos;&lt;/i&gt;</match>',
    );
  });
});

describe('watchOmnibox', () => {
  const setup = (where: (text: string) => Promise<Route | null>) => {
    const omnibox = fakeOmnibox();
    const tabs = fakeTabs();
    watchOmnibox({ omnibox, tabs, board: BOARD, where });
    return { omnibox, tabs };
  };
  const onLibrary = (text: string): Promise<Route | null> => Promise.resolve(route(library, text, 0));

  it('describes what is typed as the first row', async () => {
    const { omnibox } = setup(onLibrary);
    omnibox.type('rain radar');
    await settle();
    expect(omnibox.descriptions).toEqual(['Search DuckDuckGo for <match>rain radar</match>']);
  });

  it('opens the route in this tab, a new tab or one behind, as the browser asks', async () => {
    const { omnibox, tabs } = setup(onLibrary);
    const url = route(library, 'rain radar', 0)?.url;
    omnibox.enter('rain radar');
    omnibox.enter('rain radar', 'newForegroundTab');
    omnibox.enter('rain radar', 'newBackgroundTab');
    await settle();
    expect(tabs.opened).toEqual([
      { update: { url } },
      { create: { url, active: true } },
      { create: { url, active: false } },
    ]);
  });

  it('opens the board for nothing typed, and when the library cannot be read', async () => {
    const { omnibox, tabs } = setup(onLibrary);
    omnibox.enter('  ');
    await settle();
    expect(tabs.opened).toEqual([{ update: { url: BOARD } }]);

    const broken = setup(() => Promise.reject(new Error('The stored library has schema 9')));
    broken.omnibox.type('gh');
    broken.omnibox.enter('gh');
    await settle();
    expect(broken.omnibox.descriptions).toEqual(['Open H-Board']);
    expect(broken.tabs.opened).toEqual([{ update: { url: BOARD } }]);
  });
});
