import type { Store } from '@h-board/store';
import { Board } from './board';
import type { BoardOptions } from './board';

// Shows the store's library in `root` and keeps it up to date. Returns the function that stops it.
export async function mountBoard(root: HTMLElement, store: Store, options: BoardOptions = {}): Promise<() => void> {
  const board = new Board(root, store, await store.load(), options);
  const unsubscribe = store.subscribe((state) => board.update(state));
  return () => {
    unsubscribe();
    board.stop();
  };
}
