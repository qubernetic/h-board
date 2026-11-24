import { KeptStore } from './kept-store';
import type { Kept } from './kept-store';
import type { StoreOptions } from './store';

/** Keeps the library in memory. For tests and the dev server; it is gone with the page. */
export class MemoryStore extends KeptStore {
  constructor(options: StoreOptions = {}) {
    let kept: Kept | undefined;
    super(
      {
        read: () => Promise.resolve(kept),
        write: (state) => {
          kept = { library: state.library, history: state.history };
          return Promise.resolve();
        },
      },
      options,
    );
  }
}
