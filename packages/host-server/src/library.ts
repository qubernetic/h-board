import { KeptStore, readStoredHistory, readStoredLibrary } from '@h-board/store';
import type { Kept, StoreOptions } from '@h-board/store';
import type { Database } from './db';

function parsed(text: unknown): unknown {
  try {
    return JSON.parse(String(text));
  } catch {
    return undefined;
  }
}

/** What a user keeps, checked by the same rules as an imported file; the newest snapshot stands in for an unreadable library. */
function readRow(row: Record<string, unknown>): Kept {
  const history = readStoredHistory(parsed(row['history']));
  const { library, problems } = readStoredLibrary(parsed(row['library']));
  if (library) return { library, history };
  const [newest] = history.snapshots;
  const unread = `The library on the server could not be read (${String(problems[0])}).`;
  return newest
    ? { library: newest.library, history, notice: `${unread} It was restored from the newest snapshot.` }
    : { library: undefined, history, notice: `${unread} It started again; no snapshot could be read either.` };
}

/**
 * Keeps one user's library and its snapshots in the server's database, one row per user. The row
 * goes with its user.
 */
export class SqliteStore extends KeptStore {
  constructor(db: Database, userId: number, options: StoreOptions = {}) {
    const now = options.now ?? Date.now;
    super(
      {
        read: () => {
          const row = db.get('select library, history from libraries where user_id = ?', userId);
          return Promise.resolve(row === undefined ? undefined : readRow(row));
        },
        write: (state) => {
          db.run(
            `insert into libraries (user_id, library, history, changed_at) values (?, ?, ?, ?)
               on conflict (user_id) do update
                 set library = excluded.library, history = excluded.history, changed_at = excluded.changed_at`,
            userId,
            JSON.stringify(state.library),
            JSON.stringify(state.history),
            now(),
          );
          return Promise.resolve();
        },
      },
      options,
    );
  }
}

/**
 * The store of each user, one per user, so that the changes of one user's requests run one after
 * another and none of them is lost to another made at the same time.
 */
export class Libraries {
  readonly #db: Database;
  readonly #options: StoreOptions;
  readonly #stores = new Map<number, SqliteStore>();

  constructor(db: Database, options: StoreOptions = {}) {
    this.#db = db;
    this.#options = options;
  }

  of(userId: number): SqliteStore {
    let store = this.#stores.get(userId);
    if (store === undefined) {
      store = new SqliteStore(this.#db, userId, this.#options);
      this.#stores.set(userId, store);
    }
    return store;
  }

  /** Lets go of a removed user's store; a new user who gets the same id starts afresh. */
  forget(userId: number): void {
    this.#stores.delete(userId);
  }
}
