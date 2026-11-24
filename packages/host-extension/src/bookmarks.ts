import type { ImportGroup } from '@h-board/core';

/** The part of a `chrome.bookmarks` node the import reads: a folder has children, a link an address. */
export interface BookmarkNode {
  readonly title: string;
  readonly url?: string | undefined;
  readonly children?: readonly BookmarkNode[] | undefined;
}

/** What `readBookmarks` needs of the browser: the permission prompt, and the tree once it is granted. */
export interface BookmarksAccess {
  request(permissions: { permissions: string[] }): Promise<boolean>;
  tree(): Promise<readonly BookmarkNode[]>;
}

/** The longest name and address `group.import` takes. */
const MAX_NAME = 200;
const MAX_ADDRESS = 2048;
const WEB = /^https?:\/\/[^\s/?#]+\S*$/i;

const nameOf = (title: string, fallback: string): string => (title.trim() || fallback).slice(0, MAX_NAME);

/** The host of an http or https address core takes, or `undefined` for any other link. */
function hostOf(url: string | undefined): string | undefined {
  if (url === undefined || !WEB.test(url) || url.length > MAX_ADDRESS) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/**
 * One group for every folder that holds an http or https link, in the order of the tree; a folder
 * inside a folder is a group of its own. Other links (`javascript:`, `file:`, the browser's own pages)
 * are left out. Titles are data: they become names, nothing else.
 */
export function bookmarkGroups(tree: readonly BookmarkNode[]): ImportGroup[] {
  const groups: ImportGroup[] = [];
  const walk = (folder: BookmarkNode): void => {
    const sites: { name: string; url: string }[] = [];
    for (const node of folder.children ?? []) {
      const host = hostOf(node.url);
      if (host !== undefined) sites.push({ name: nameOf(node.title, host), url: node.url as string });
    }
    if (sites.length > 0) groups.push({ name: nameOf(folder.title, 'Bookmarks'), sites });
    for (const node of folder.children ?? []) if (node.children) walk(node);
  };
  for (const node of tree) walk(node);
  return groups;
}

/**
 * Asks for the bookmarks permission, at the moment of the import and not before, and reads the
 * groups. `undefined` when the user refuses. The prompt needs the click, so nothing waits before it.
 */
export async function readBookmarks(access: BookmarksAccess): Promise<ImportGroup[] | undefined> {
  if (!(await access.request({ permissions: ['bookmarks'] }))) return undefined;
  return bookmarkGroups(await access.tree());
}
