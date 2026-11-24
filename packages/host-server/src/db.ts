import BetterSqlite3 from 'better-sqlite3';

/**
 * The small part of SQLite the server uses. Everything goes through this wrapper, so the driver
 * (better-sqlite3) can be swapped in one file.
 */
export interface Database {
  exec(sql: string): void;
  get(sql: string, ...params: readonly SqlValue[]): Record<string, unknown> | undefined;
  close(): void;
}

export type SqlValue = string | number | bigint | Uint8Array | null;

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
    close: () => {
      db.close();
    },
  };
}
