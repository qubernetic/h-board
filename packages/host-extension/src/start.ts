import { sampleLibrary } from '@h-board/core';
import { ExtStore, MemoryStore } from '@h-board/store';
import type { LocalArea } from '@h-board/store';
import { mountBoard } from '@h-board/ui';
import type { BoardOptions } from '@h-board/ui';
import { readBookmarks } from './bookmarks';
import type { BookmarkNode } from './bookmarks';
import { storedSearches } from './searches';

/**
 * The part of `chrome` the pages use. Outside the extension (the preview of the build) none of it is
 * there, and the page runs on a store in memory. Only the local storage area: nothing syncs to an account.
 */
export interface ExtensionApi {
  storage?: { local: LocalArea };
  tabs?: { create(properties: { url: string; active: boolean }): Promise<unknown> };
  permissions?: { request(permissions: { permissions: string[] }): Promise<boolean> };
  /** There only once the user allowed the optional `bookmarks` permission. */
  bookmarks?: { getTree(): Promise<BookmarkNode[]> };
}

export interface StartOptions {
  /** The settings page: the board with its settings shown. */
  readonly settings?: boolean;
  /** For tests: the board's clock, size and so on. */
  readonly options?: BoardOptions;
}

/**
 * Shows the board in `root` on the extension's local storage, the sample library on the first start.
 * Returns the function that stops it.
 */
export async function startBoard(
  root: HTMLElement,
  chrome: ExtensionApi | undefined,
  { settings = false, options = {} }: StartOptions = {},
): Promise<() => void> {
  const area = chrome?.storage?.local;
  const tabs = chrome?.tabs;
  const permissions = chrome?.permissions;
  const store = area ? new ExtStore(area, { initial: sampleLibrary }) : new MemoryStore({ initial: sampleLibrary });
  return mountBoard(root, store, {
    ...(area && { searchHistory: await storedSearches(area) }),
    ...(tabs && { openBehind: (url: string) => void tabs.create({ url, active: false }) }),
    ...(permissions && {
      bookmarks: () =>
        readBookmarks({
          request: (asked) => permissions.request(asked),
          tree: () => (chrome.bookmarks ? chrome.bookmarks.getTree() : Promise.reject(new Error('the bookmarks cannot be read'))),
        }),
    }),
    openSettings: settings,
    ...options,
  });
}
