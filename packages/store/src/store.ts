import type { Library } from '@h-board/core';

/**
 * Where a library is kept. The hosts choose the implementation: the extension's storage, the
 * browser's IndexedDB, or the user's own server.
 */
export interface Store {
  /** The stored library, or `undefined` when nothing was saved yet. */
  load(): Promise<Library | undefined>;
  save(library: Library): Promise<void>;
  /** Calls `listener` after every save. Returns the function that stops it. */
  subscribe(listener: (library: Library) => void): () => void;
}
