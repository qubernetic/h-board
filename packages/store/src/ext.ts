import { emptyLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { KeptStore } from './kept-store';
import type { Kept, Keeper } from './kept-store';
import type { StoreOptions } from './store';
import { readStoredHistory, readStoredLibrary } from './stored';

/**
 * The part of `chrome.storage.local` that `ExtStore` uses. The host passes `chrome.storage.local`
 * itself; the store never reaches for `chrome` on its own, and never for the area that syncs to the user's account.
 */
export interface LocalArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  readonly onChanged: { addListener(listener: (changes: Record<string, unknown>) => void): void };
}

/** Turns what one schema kept into what the next one keeps: the items under `KEYS`. */
export type Migration = (items: Record<string, unknown>) => Record<string, unknown>;

/** The steps from each older schema to the next: `MIGRATIONS[0]` turns schema 1 into 2. */
export const MIGRATIONS: readonly Migration[] = [];

/** The schema `ExtStore` writes. */
export const SCHEMA = MIGRATIONS.length + 1;

/** Where things are kept: the schema, the library, the snapshots, and a library that could not be read. */
const KEYS = ['schema', 'library', 'history'];
const CORRUPT = 'corrupt';

export interface ExtStoreOptions extends StoreOptions {
  /** The migrations to run; `MIGRATIONS` when left out. For tests. */
  readonly migrations?: readonly Migration[];
}

const minute = (at: number): string => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function oneLine(problems: readonly string[]): string {
  return problems.length > 1 ? `${problems[0]} and ${problems.length - 1} more` : (problems[0] ?? '');
}

/** Reads and migrates what an extension keeps in `area`, without writing anything back. */
async function readItems(
  area: Pick<LocalArea, 'get'>,
  migrations: readonly Migration[],
): Promise<{ items: Record<string, unknown>; migrated: boolean } | undefined> {
  let items = await area.get(KEYS);
  if (items.schema === undefined && items.library === undefined && items.history === undefined) return undefined;
  const schema = items.schema ?? 1;
  const current = migrations.length + 1;
  if (!Number.isSafeInteger(schema) || (schema as number) < 1 || (schema as number) > current) {
    throw new Error(`The stored library has schema ${String(schema)}, newer than this H-Board knows (${current}). Update the extension.`);
  }
  for (const migrate of migrations.slice((schema as number) - 1)) items = migrate(items);
  return { items, migrated: (schema as number) < current };
}

/** Reads, migrates and checks what an extension keeps in `area`. */
async function readArea(area: LocalArea, migrations: readonly Migration[]): Promise<Kept | undefined> {
  const read = await readItems(area, migrations);
  if (!read) return undefined;
  const { items } = read;
  if (read.migrated) await area.set({ ...items, schema: migrations.length + 1 });

  const history = readStoredHistory(items.history);
  const { library, problems } = readStoredLibrary(items.library);
  if (library) return { library, history };

  await area.set({ [CORRUPT]: items.library ?? null });
  const [newest] = history.snapshots;
  const unread = `The stored library could not be read (${oneLine(problems)}). It was kept aside and`;
  return newest
    ? { library: newest.library, history, notice: `${unread} restored from the snapshot of ${minute(newest.at)}.` }
    : { library: undefined, history, notice: `${unread} started again. No snapshot could be read either.` };
}

/**
 * Keeps the library and its snapshots in the extension's local storage, on this computer only.
 * A stored library that cannot be read falls back to the newest snapshot that can, and the next
 * load says so in `notice`; the unreadable one is kept aside under `corrupt`.
 */
export class ExtStore extends KeptStore {
  constructor(area: LocalArea, options: ExtStoreOptions = {}) {
    const migrations = options.migrations ?? MIGRATIONS;
    const keeper: Keeper = {
      read: () => readArea(area, migrations),
      write: (state) => area.set({ schema: migrations.length + 1, library: state.library, history: state.history }),
      watch: (changed) => {
        area.onChanged.addListener((changes) => {
          if (KEYS.some((key) => key in changes)) changed();
        });
      },
    };
    super(keeper, options);
  }
}

/**
 * The library kept in `area`, for a reader that must not change it, such as the service worker: it migrates in
 * memory only and never repairs. The first library when nothing is kept yet; `null` when the kept one cannot be
 * read, so that the board's own `ExtStore` repairs it and says so in `notice`.
 */
export async function peekLibrary(area: Pick<LocalArea, 'get'>, options: ExtStoreOptions = {}): Promise<Library | null> {
  try {
    const read = await readItems(area, options.migrations ?? MIGRATIONS);
    if (!read) return (options.initial ?? emptyLibrary)();
    return readStoredLibrary(read.items.library).library ?? null;
  } catch {
    return null;
  }
}
