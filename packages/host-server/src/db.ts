import BetterSqlite3 from 'better-sqlite3';

/**
 * The small part of SQLite the server uses. Everything goes through this wrapper, so the driver
 * (better-sqlite3) can be swapped in one file.
 */
export interface Database {
  exec(sql: string): void;
  get(sql: string, ...params: readonly SqlValue[]): Record<string, unknown> | undefined;
  all(sql: string, ...params: readonly SqlValue[]): Record<string, unknown>[];
  run(sql: string, ...params: readonly SqlValue[]): RunResult;
  /** Runs `body` in one transaction: all of it is kept, or none of it when it throws. */
  transaction<T>(body: () => T): T;
  close(): void;
}

export type SqlValue = string | number | bigint | Uint8Array | null;

export interface RunResult {
  /** How many rows the statement changed. */
  readonly changes: number;
  /** The row id of the last row inserted. */
  readonly lastId: number;
}

/** Opens the database file, or a database in memory for `:memory:`. */
export function openDatabase(path: string): Database {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    get: (sql, ...params) => db.prepare<SqlValue[], Record<string, unknown>>(sql).get(...params),
    all: (sql, ...params) => db.prepare<SqlValue[], Record<string, unknown>>(sql).all(...params),
    run: (sql, ...params) => {
      const result = db.prepare<SqlValue[]>(sql).run(...params);
      return { changes: result.changes, lastId: Number(result.lastInsertRowid) };
    },
    transaction: (body) => db.transaction(body)(),
    close: () => {
      db.close();
    },
  };
}

/**
 * The server's schema, one step per version. A step is never changed once it is released; a
 * change to the schema is a new step at the end.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: accounts, their sessions and the one-time setup code. Secrets are kept only as hashes.
  `create table users (
     id integer primary key,
     name text not null unique collate nocase,
     password_hash text not null,
     admin integer not null default 0,
     created_at integer not null
   );
   create table sessions (
     id integer primary key,
     user_id integer not null references users (id) on delete cascade,
     token_hash text not null unique,
     created_at integer not null,
     used_at integer not null
   );
   create index sessions_user on sessions (user_id);
   create table setup (
     id integer primary key check (id = 1),
     code_hash text not null
   );`,
  // 2: temporary passwords an admin gives. `temporary_used` is 1 once one has signed in; it then
  // works for nothing but its own change.
  `alter table users add column temporary integer not null default 0;
   alter table users add column temporary_used integer not null default 0;`,
];

/**
 * Brings the database up to the newest step of `steps` and answers its version. Each step runs in
 * its own transaction with the new version, so a failed step leaves the version before it.
 */
export function migrate(db: Database, steps: readonly string[] = MIGRATIONS): number {
  const version = Number(db.get('pragma user_version')?.['user_version'] ?? 0);
  if (version > steps.length) {
    throw new Error(`the database has schema version ${version}, this server knows ${steps.length}`);
  }
  for (const [offset, step] of steps.slice(version).entries()) {
    db.transaction(() => {
      db.exec(step);
      db.exec(`pragma user_version = ${version + offset + 1}`);
    });
  }
  return steps.length;
}
