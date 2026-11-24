import { emptyLibrary } from '@h-board/core';
import type { Store } from '@h-board/store';
import { renderBoard } from './board';

/** Shows the store's library in `root` and keeps it up to date. Returns the function that stops it. */
export async function mountBoard(root: HTMLElement, store: Store): Promise<() => void> {
  renderBoard(root, (await store.load()) ?? emptyLibrary());
  return store.subscribe((library) => renderBoard(root, library));
}
