import { sampleLibrary } from '@h-board/core';
import { ExtStore, MemoryStore, RemoteError, RemoteStore, peekLibrary } from '@h-board/store';
import type { LocalArea, Store } from '@h-board/store';
import { mountBoard } from '@h-board/ui';
import type { BoardOptions } from '@h-board/ui';
import { readBookmarks } from './bookmarks';
import type { BookmarkNode } from './bookmarks';
import { browserFavicons } from './favicons';
import { imagePixels } from './pixels';
import { lastGroup } from './omnibox';
import { storedSearches } from './searches';
import { ServerLink } from './server';

/**
 * The part of `chrome` the pages use. Outside the extension (the preview of the build) none of it is
 * there, and the page runs on a store in memory. Only the local storage area: nothing syncs to an account.
 */
export interface ExtensionApi {
  storage?: { local: LocalArea };
  tabs?: { create(properties: { url: string; active: boolean }): Promise<unknown> };
  permissions?: {
    request(permissions: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
    contains(permissions: { permissions: string[] }): Promise<boolean>;
    /** Gives an optional permission back: the user's server, on the way to local mode. */
    remove?(permissions: { origins: string[] }): Promise<boolean>;
  };
  /** The extension's own addresses: its `_favicon` address reads the browser's stored favicons. */
  runtime?: { getURL(path: string): string };
  /** There only once the user allowed the optional `bookmarks` permission. */
  bookmarks?: { getTree(): Promise<BookmarkNode[]> };
}

export interface StartOptions {
  /** The settings page: the board with its settings shown. */
  readonly settings?: boolean;
  /** For tests: the pixels of an image, which a canvas reads in the browser. */
  readonly pixels?: (url: string) => Promise<Uint8ClampedArray | undefined>;
  /** For tests: how the user's server is asked. `fetch` when left out. */
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** For tests: the board's clock, size and so on. */
  readonly options?: BoardOptions;
}

/** `store` with `notice` on its load: the board shows it once, as text. */
function withNotice(store: Store, notice: string): Store {
  return {
    load: async () => ({ ...(await store.load()), notice }),
    apply: (id, params, options) => store.apply(id, params, options),
    undo: (options) => store.undo(options),
    redo: (options) => store.redo(options),
    restore: (id, options) => store.restore(id, options),
    subscribe: (listener) => store.subscribe(listener),
  };
}

/**
 * Shows the board in `root` on the extension's local storage, the sample library on the first start, or, once the
 * user has signed in to their own server, on the server's library. The local library stays as it is meanwhile, and
 * shows again on the way back. Returns the function that stops it.
 */
export async function startBoard(
  root: HTMLElement,
  chrome: ExtensionApi | undefined,
  { settings = false, pixels = (url) => imagePixels(root.ownerDocument, url), fetch, options = {} }: StartOptions = {},
): Promise<() => void> {
  const area = chrome?.storage?.local;
  const tabs = chrome?.tabs;
  const permissions = chrome?.permissions;
  const runtime = chrome?.runtime;
  const local = area ? new ExtStore(area, { initial: sampleLibrary }) : new MemoryStore({ initial: sampleLibrary });
  const remove = permissions?.remove?.bind(permissions);
  const link = area
    ? await ServerLink.open({
        area,
        ...(permissions && remove && { permissions: { request: (asked) => permissions.request(asked), remove } }),
        ...(fetch && { fetch }),
        library: () => peekLibrary(area, { initial: sampleLibrary }),
      })
    : undefined;
  const boardOptions: BoardOptions = {
    ...(area && { searchHistory: await storedSearches(area), onGroup: (id: string) => void lastGroup(area)(id).catch(() => undefined) }),
    ...(tabs && { openBehind: (url: string) => void tabs.create({ url, active: false }) }),
    ...(permissions && {
      bookmarks: () =>
        readBookmarks({
          request: (asked) => permissions.request(asked),
          tree: () => (chrome.bookmarks ? chrome.bookmarks.getTree() : Promise.reject(new Error('the bookmarks cannot be read'))),
        }),
    }),
    ...(permissions &&
      runtime && {
        favicons: browserFavicons(runtime.getURL(''), {
          request: (asked) => permissions.request(asked),
          contains: (asked) => permissions.contains(asked),
          pixels,
        }),
      }),
    ...(link && { server: link }),
    ...options,
  };

  let stopBoard = (): void => undefined;
  let stopped = false;
  /** The store the board shows: the local one, or the server and session it is on. */
  let shown = '';

  /** Shows the board on the store of the link's stage, when that is not the one it shows already. */
  const mount = async (): Promise<void> => {
    const token = link?.token();
    const address = link?.state().address;
    const wanted = area && link && token !== undefined && address !== undefined ? `${address} ${token}` : 'local';
    if (stopped || wanted === shown) return;
    // the settings stay open when the user switched in them
    const openSettings = settings || root.querySelector('[data-part="settings-panel"]:not([hidden])') !== null;
    stopBoard();
    stopBoard = () => undefined;
    const store =
      area && link && wanted !== 'local'
        ? new RemoteStore({
            server: address as string,
            token: (by) => (by.kind === 'user' ? link.token() : undefined),
            cache: area,
            ...(fetch && { fetch }),
          })
        : local;
    try {
      stopBoard = await mountBoard(root, store, { ...boardOptions, openSettings });
    } catch (error) {
      if (error instanceof RemoteError && error.code === 'signed-out' && link) {
        // the server no longer knows the session: back to the sign-in, which shows the local library
        await link.signOut();
        return;
      }
      const why = error instanceof Error ? error.message : String(error);
      const notice = `The server's library cannot be read: ${why} This is this browser's library.`;
      stopBoard = await mountBoard(root, withNotice(local, notice), { ...boardOptions, openSettings });
    }
    shown = wanted;
  };

  let turn = Promise.resolve();
  /** One mount at a time, each on the stage the link is in when it runs. */
  const remount = (): Promise<void> => {
    turn = turn.then(mount).catch((error: unknown) => {
      console.error('H-Board: the board could not be shown', error);
    });
    return turn;
  };

  const stopLink = link?.onChange(() => void remount());
  await remount();
  return () => {
    stopped = true;
    stopLink?.();
    stopBoard();
  };
}
