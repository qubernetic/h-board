import { SEARCH_ENGINES, hostOf, route } from '@h-board/core';
import type { Route } from '@h-board/core';
import type { LocalArea, Store } from '@h-board/store';

/** Where the board keeps the group in view, for the codes typed into the address bar. */
const GROUP_KEY = 'group';

/** How the browser asks to open what was entered: Enter, Alt+Enter, or a click with a modifier. */
export type Disposition = 'currentTab' | 'newForegroundTab' | 'newBackgroundTab';

/** The part of `chrome.omnibox` the keyword uses. */
export interface OmniboxApi {
  setDefaultSuggestion(suggestion: { description: string }): void;
  readonly onInputChanged: { addListener(listener: (text: string) => void): void };
  readonly onInputEntered: { addListener(listener: (text: string, disposition: Disposition) => void): void };
}

/** The part of `chrome.tabs` the keyword uses. `update` without a tab is the tab the user typed in. */
export interface OmniboxTabs {
  update(properties: { url: string }): Promise<unknown>;
  create(properties: { url: string; active: boolean }): Promise<unknown>;
}

/** Keeps the id of the group in view in the local area: the board's `onGroup`. */
export function lastGroup(area: Pick<LocalArea, 'set'>): (id: string) => Promise<void> {
  return (id) => area.set({ [GROUP_KEY]: id });
}

/**
 * Where the text typed after the keyword goes, on the stored library. A code without a group number is read in
 * the group seen last on the board, or the group the page opens on, or the first.
 */
export async function routeTyped(store: Pick<Store, 'load'>, area: Pick<LocalArea, 'get'>, text: string): Promise<Route | null> {
  const [{ library }, { [GROUP_KEY]: seen }] = await Promise.all([store.load(), area.get([GROUP_KEY])]);
  const index = (id: unknown): number => library.groups.findIndex((group) => group.id === id);
  const active = index(seen) >= 0 ? index(seen) : Math.max(0, index(library.settings.activeGroup));
  return route(library, text, active);
}

/** Text for the omnibox's markup: a site's name or address and the words typed are data, never markup. */
const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** The first row under the address bar: where Enter goes. */
export function describeRoute(to: Route | null): string {
  if (!to) return 'Open H-Board';
  switch (to.kind) {
    case 'site':
      return `Open <match>${escape(to.site.name)}</match> <url>${escape(to.url)}</url>`;
    case 'search':
      return `Search ${escape(hostOf(to.site.url))} for <match>${escape(to.words)}</match>`;
    case 'engine':
      return `Search ${SEARCH_ENGINES[to.engine].name} for <match>${escape(to.words)}</match>`;
  }
}

export interface OmniboxOptions {
  readonly omnibox: OmniboxApi;
  readonly tabs: OmniboxTabs;
  /** The board's address, for nothing typed and for a library that cannot be read: the board says why. */
  readonly board: string;
  readonly where: (text: string) => Promise<Route | null>;
}

/** The keyword `h`: describes where the typed text goes, and opens it on Enter. */
export function watchOmnibox({ omnibox, tabs, board, where }: OmniboxOptions): void {
  const routed = (text: string): Promise<Route | null> => where(text).catch(() => null);
  omnibox.onInputChanged.addListener((text) => {
    void routed(text).then((to) => omnibox.setDefaultSuggestion({ description: describeRoute(to) }));
  });
  omnibox.onInputEntered.addListener((text, disposition) => {
    void routed(text).then((to) => {
      const url = to?.url ?? board;
      return disposition === 'currentTab' ? tabs.update({ url }) : tabs.create({ url, active: disposition === 'newForegroundTab' });
    });
  });
}
