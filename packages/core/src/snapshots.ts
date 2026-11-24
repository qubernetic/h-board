import { diffLibraries, summarise } from './diff';
import type { Library } from './model';

/** Snapshots kept whatever their age. */
export const KEEP_NEWEST = 20;
/** Beyond the newest, one snapshot a day is kept for this many days. */
export const KEEP_DAYS = 7;
/** Changes from one source less than this many milliseconds apart make one burst, and one snapshot. */
export const BURST_MS = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Who made a change: the user, or an agent by the name of its key. */
export type SnapshotSource = { readonly kind: 'user' } | { readonly kind: 'agent'; readonly key: string };

/** What made a snapshot: the first library, a change, an undo, a redo or a restore. */
export type SnapshotCause = 'start' | 'change' | 'undo' | 'redo' | 'restore';

/** The library as it was at one moment, with what led to it. */
export interface Snapshot {
  readonly id: number;
  /** Milliseconds since the epoch. */
  readonly at: number;
  readonly source: SnapshotSource;
  readonly cause: SnapshotCause;
  /** What changed since the snapshot before, on one line. Names in it are user data: show it as text. */
  readonly summary: string;
  /** How many sites the library holds. */
  readonly sites: number;
  readonly library: Library;
}

/**
 * Every snapshot kept, newest first; the newest is the library as it is now. `undo` and `redo` are
 * stacks of snapshot ids, the next step last.
 */
export interface History {
  readonly snapshots: readonly Snapshot[];
  readonly undo: readonly number[];
  readonly redo: readonly number[];
  /** The id of the next snapshot. */
  readonly next: number;
}

/** When a change happens, who made it, and whether it must stay out of a running burst. */
export interface RecordOptions {
  readonly source: SnapshotSource;
  readonly at: number;
  /** Starts a snapshot of its own even inside a burst, so that undo takes back only this change. */
  readonly alone?: boolean;
}

export function emptyHistory(): History {
  return { snapshots: [], undo: [], redo: [], next: 1 };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const sameSource = (a: SnapshotSource, b: SnapshotSource): boolean =>
  a.kind === b.kind && (a.kind === 'user' || (b.kind === 'agent' && a.key === b.key));

const siteCount = (library: Library): number => library.groups.reduce((sum, group) => sum + group.sites.length, 0);

/** The top of an id stack, down to the first id that is no longer kept. */
function reachable(stack: readonly number[], kept: ReadonlySet<number>): readonly number[] {
  let from = stack.length;
  while (from > 0 && kept.has(stack[from - 1] as number)) from -= 1;
  return from === 0 ? stack : stack.slice(from);
}

/**
 * The retention rule: the newest `KEEP_NEWEST` snapshots, and beyond them the newest of each day
 * (counted back from `now`) for `KEEP_DAYS` days. Undo and redo steps to a snapshot let go are
 * forgotten.
 */
export function retain(history: History, now: number): History {
  const kept = history.snapshots.slice(0, KEEP_NEWEST);
  const days = new Set<number>();
  for (const snapshot of history.snapshots.slice(KEEP_NEWEST)) {
    const day = Math.floor((now - snapshot.at) / DAY_MS);
    if (day >= KEEP_DAYS || days.has(day)) continue;
    days.add(day);
    kept.push(snapshot);
  }
  if (kept.length === history.snapshots.length) return history;
  const ids = new Set(kept.map((snapshot) => snapshot.id));
  return { ...history, snapshots: kept, undo: reachable(history.undo, ids), redo: reachable(history.redo, ids) };
}

function snapshotOf(id: number, library: Library, cause: SnapshotCause, summary: string, options: RecordOptions): Snapshot {
  return { id, at: options.at, source: options.source, cause, summary, sites: siteCount(library), library };
}

/** A new snapshot of `library` on top of the history, then the retention rule. */
function push(history: History, library: Library, cause: SnapshotCause, summary: string, options: RecordOptions): History {
  const snapshot = snapshotOf(history.next, library, cause, summary, options);
  return retain({ ...history, snapshots: [snapshot, ...history.snapshots], next: history.next + 1 }, options.at);
}

/** Whether a change joins the burst of the newest snapshot. */
function joins(newest: Snapshot, options: RecordOptions): boolean {
  return !options.alone && newest.cause === 'change' && options.at - newest.at < BURST_MS && sameSource(newest.source, options.source);
}

/**
 * Keeps a library after a change. A change from the same source less than `BURST_MS` after the
 * last one joins its snapshot, unless `alone` is set; a burst that ends where it began leaves no
 * snapshot. A new change forgets what could be redone.
 */
export function record(history: History, library: Library, options: RecordOptions): History {
  const [newest, before] = history.snapshots;
  if (!newest) return push(history, library, 'start', 'starting point', options);
  if (same(newest.library, library)) return history;
  if (before && joins(newest, options)) {
    const older = history.snapshots.slice(1);
    if (same(before.library, library)) return { ...history, snapshots: older, undo: history.undo.slice(0, -1) };
    const burst = snapshotOf(newest.id, library, 'change', summarise(diffLibraries(before.library, library)), options);
    return { ...history, snapshots: [burst, ...older] };
  }
  const next = { ...history, undo: [...history.undo, newest.id], redo: [] };
  return push(next, library, 'change', summarise(diffLibraries(newest.library, library)), options);
}
