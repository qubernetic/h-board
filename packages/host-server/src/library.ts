import { KeptStore, readStoredHistory, readStoredLibrary } from '@h-board/store';
import type { Kept, StoreOptions } from '@h-board/store';
import type { User } from './accounts';
import type { Database } from './db';

/** Thrown when the store's user is no longer there: removed, perhaps with the id given to a new user. */
export class UserRemoved extends Error {
  constructor() {
    super('the user of this library was removed');
    this.name = 'UserRemoved';
  }
}

/** The user a store belongs to: the id, and when the account was made, since a removed user's id is given again. */
export type Owner = Pick<User, 'id' | 'createdAt'>;

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
 * goes with its user. Once the user is removed, every read and write throws `UserRemoved`, also
 * when a new user has the same id.
 */
export class SqliteStore extends KeptStore {
  constructor(db: Database, owner: Owner, options: StoreOptions = {}) {
    const now = options.now ?? Date.now;
    super(
      {
        read: () => {
          const row = db.get(
            `select libraries.library, libraries.history
               from users left join libraries on libraries.user_id = users.id
              where users.id = ? and users.created_at = ?`,
            owner.id,
            owner.createdAt,
          );
          if (row === undefined) return Promise.reject(new UserRemoved());
          return Promise.resolve(row['library'] === null ? undefined : readRow(row));
        },
        write: (state) => {
          const { changes } = db.run(
            `insert into libraries (user_id, library, history, changed_at)
               select id, ?, ?, ? from users where id = ? and created_at = ?
               on conflict (user_id) do update
                 set library = excluded.library, history = excluded.history, changed_at = excluded.changed_at`,
            JSON.stringify(state.library),
            JSON.stringify(state.history),
            now(),
            owner.id,
            owner.createdAt,
          );
          return changes === 0 ? Promise.reject(new UserRemoved()) : Promise.resolve();
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
  readonly #stores = new Map<number, { readonly owner: Owner; readonly store: SqliteStore }>();

  constructor(db: Database, options: StoreOptions = {}) {
    this.#db = db;
    this.#options = options;
  }

  of(owner: Owner): SqliteStore {
    const kept = this.#stores.get(owner.id);
    if (kept?.owner.createdAt === owner.createdAt) return kept.store;
    const store = new SqliteStore(this.#db, { id: owner.id, createdAt: owner.createdAt }, this.#options);
    this.#stores.set(owner.id, { owner, store });
    return store;
  }

  /** Lets go of a removed user's store; a new user who gets the same id starts afresh. */
  forget(userId: number): void {
    this.#stores.delete(userId);
  }
}
