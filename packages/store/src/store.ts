import type { CommandRegistry, History, Library, Outcome } from '@h-board/core';

/** The library as it is now, with every snapshot kept of it. */
export interface State {
  readonly library: Library;
  readonly history: History;
  /**
   * Set once, on the load that had to recover: what was wrong with the stored library and what took
   * its place. The page shows it as text.
   */
  readonly notice?: string;
  /**
   * Set by a store on the user's own server: when the library was last read from it, and whether the server can be
   * reached now. Offline the library is the copy kept on this computer, and it can be read, not changed.
   */
  readonly synced?: Synced;
}

/** When the library was last read from the server, in milliseconds since the epoch, and whether it is offline now. */
export interface Synced {
  readonly at: number;
  readonly offline: boolean;
}

/** Who asks for a command: the user, or an agent by the name of its key and its scope. */
export type By =
  | { readonly kind: 'user' }
  | { readonly kind: 'agent'; readonly key: string; readonly ownerScope: boolean };

/** Who asks for an undo, a redo or a restore. */
export interface StepBy {
  /** The user when left out. */
  readonly by?: By;
}

export interface ApplyOptions extends StepBy {
  /** Keeps the change in a snapshot of its own, so that undo takes back only this change. */
  readonly alone?: boolean;
}

/** How a store is made: what it starts with, its clock and its commands. */
export interface StoreOptions {
  /** The library of a store that holds nothing yet. The empty library when left out. */
  readonly initial?: () => Library;
  /** Milliseconds since the epoch. `Date.now` when left out. */
  readonly now?: () => number;
  /** The commands `apply` runs. Every library command of core when left out. */
  readonly commands?: CommandRegistry;
}

/**
 * Where a library is kept. The page and the hosts change it only through `apply`, `undo`, `redo` and
 * `restore`; each change keeps a snapshot. The hosts choose the implementation: the extension's
 * storage, the browser's IndexedDB, or the user's own server.
 */
export interface Store {
  load(): Promise<State>;
  /**
   * Runs the command `id` of core on the library, keeps the result and a snapshot, and returns the
   * command's outcome. Rejects with the command's `CommandError` and keeps the library as it was.
   */
  apply(id: string, params?: unknown, options?: ApplyOptions): Promise<Outcome>;
  /** Takes the last change back. `undefined` when there is nothing to take back. */
  undo(options?: StepBy): Promise<State | undefined>;
  /** Brings back what the last undo took. `undefined` when there is nothing to bring back. */
  redo(options?: StepBy): Promise<State | undefined>;
  /**
   * Goes back to snapshot `id`; the restore can be undone. `undefined` when the snapshot is the
   * library as it is. Rejects with a `CommandError` (`missing`) when the snapshot is not kept.
   */
  restore(id: number, options?: StepBy): Promise<State | undefined>;
  /** Calls `listener` after every change, also one made in another page. Returns the function that stops it. */
  subscribe(listener: (state: State) => void): () => void;
}
