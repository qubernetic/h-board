import type { Library } from '@h-board/core';
import type { Store } from './store';

/** Keeps the library in memory. For tests and for a page without storage. */
export class MemoryStore implements Store {
  #library: Library | undefined;
  readonly #listeners = new Set<(library: Library) => void>();

  load(): Promise<Library | undefined> {
    return Promise.resolve(this.#library);
  }

  save(library: Library): Promise<void> {
    this.#library = library;
    for (const listener of this.#listeners) listener(library);
    return Promise.resolve();
  }

  subscribe(listener: (library: Library) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
