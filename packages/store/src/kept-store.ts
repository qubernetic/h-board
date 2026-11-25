import { createCommands, emptyHistory, emptyLibrary, record, redo, restore, undo } from '@h-board/core';
import type { CommandRegistry, History, Library, Outcome, SnapshotSource, Step, StepOptions } from '@h-board/core';
import type { ApplyOptions, By, State, Store, StoreOptions } from './store';

/** What a keeper reads back: the library, unless none of it was usable, and the snapshots. */
export interface Kept {
  readonly library: Library | undefined;
  readonly history: History;
  /** Set when the keeper had to recover; the store keeps the recovered state at once. */
  readonly notice?: string;
}

/** Where a `KeptStore` puts its state: memory, the extension's storage, and so on. */
export interface Keeper {
  /** `undefined` when nothing was kept yet. */
  read(): Promise<Kept | undefined>;
  write(state: Pick<State, 'library' | 'history'>): Promise<void>;
  /** Calls `changed` when another page changed what is kept. */
  watch?(changed: () => void): void;
}

const USER: By = { kind: 'user' };

const sourceOf = (by: By): SnapshotSource => (by.kind === 'user' ? by : { kind: 'agent', key: by.key });

/**
 * A `Store` over a `Keeper`. Every change reads what is kept, runs, and writes back, one after
 * another, so that two pages on one storage do not undo each other's work.
 */
export class KeptStore implements Store {
  readonly #keeper: Keeper;
  readonly #initial: () => Library;
  readonly #now: () => number;
  readonly #commands: CommandRegistry;
  readonly #listeners = new Set<(state: State) => void>();
  #queue: Promise<unknown> = Promise.resolve();
  /**
   * The state the listeners last heard of, as JSON, so that a page's own writes are not told twice.
   * Kept only when the keeper watches; a library may be megabytes.
   */
  #told = '';
  readonly #watched: boolean;

  constructor(keeper: Keeper, options: StoreOptions = {}) {
    this.#keeper = keeper;
    this.#initial = options.initial ?? emptyLibrary;
    this.#now = options.now ?? Date.now;
    this.#commands = options.commands ?? createCommands();
    this.#watched = keeper.watch !== undefined;
    keeper.watch?.(() => void this.#inTurn(() => this.#changedElsewhere()));
  }

  load(): Promise<State> {
    return this.#inTurn(() => this.#current());
  }

  apply(id: string, params?: unknown, options: ApplyOptions = {}): Promise<Outcome> {
    return this.#inTurn(async () => {
      const by = options.by ?? USER;
      const state = await this.#current();
      const outcome = this.#commands.run(id, state.library, params, by);
      const history = record(state.history, outcome.library, { source: sourceOf(by), at: this.#now(), alone: options.alone });
      if (history !== state.history) await this.#keep({ library: outcome.library, history });
      return outcome;
    });
  }

  undo(): Promise<State | undefined> {
    return this.#step((history, options) => undo(history, options));
  }

  redo(): Promise<State | undefined> {
    return this.#step((history, options) => redo(history, options));
  }

  restore(id: number): Promise<State | undefined> {
    return this.#step((history, options) => restore(history, id, options));
  }

  subscribe(listener: (state: State) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Runs `work` after everything asked for before it, whether that worked or not. */
  #inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = this.#queue.then(work);
    this.#queue = turn.catch(() => undefined);
    return turn;
  }

  async #current(): Promise<State> {
    const kept = await this.#keeper.read();
    const library = kept?.library ?? this.#initial();
    const history = kept?.history ?? emptyHistory();
    const state: State = {
      library,
      history: history.snapshots.length > 0 ? history : record(history, library, { source: USER, at: this.#now() }),
    };
    if (kept?.notice === undefined) {
      if (this.#watched) this.#told ||= JSON.stringify(state);
      return state;
    }
    await this.#keeper.write(state);
    this.#remember(state);
    return { ...state, notice: kept.notice };
  }

  async #step(go: (history: History, options: StepOptions) => Step | undefined): Promise<State | undefined> {
    return this.#inTurn(async () => {
      const step = go((await this.#current()).history, { source: USER, at: this.#now() });
      if (!step) return undefined;
      const state: State = { library: step.library, history: step.history };
      await this.#keep(state);
      return state;
    });
  }

  async #keep(state: State): Promise<void> {
    await this.#keeper.write(state);
    this.#tell(state);
  }

  async #changedElsewhere(): Promise<void> {
    const state = await this.#current();
    if (JSON.stringify(state) !== this.#told) this.#tell(state);
  }

  #tell(state: State): void {
    this.#remember(state);
    for (const listener of this.#listeners) listener(state);
  }

  #remember(state: State): void {
    if (this.#watched) this.#told = JSON.stringify(state);
  }
}
