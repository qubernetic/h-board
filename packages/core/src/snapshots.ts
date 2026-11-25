import { CommandError } from './commands';
import { diffLibraries, summarise } from './diff';
import type { Library } from './model';
import { jsonBytes } from './size';

/**
 * The most a history takes as JSON, in bytes. With a library of at most `MAX_FILE`, the two stay
 * under 50 MB.
 */
export const MAX_HISTORY = 45_000_000;

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

/** The history with only the snapshots of `kept`; undo and redo steps to one let go are forgotten. */
function keeping(history: History, kept: readonly Snapshot[]): History {
  if (kept.length === history.snapshots.length) return history;
  const ids = new Set(kept.map((snapshot) => snapshot.id));
  return { ...history, snapshots: kept, undo: reachable(history.undo, ids), redo: reachable(history.redo, ids) };
}

/** Lets go of the oldest snapshots, never the newest, until the history fits `MAX_HISTORY` bytes as JSON. */
function fit(history: History): History {
  let bytes = jsonBytes(history);
  const kept = [...history.snapshots];
  // Each snapshot let go takes its comma with it; the undo and redo steps to it only shrink the rest.
  while (bytes > MAX_HISTORY && kept.length > 1) bytes -= jsonBytes(kept.pop()) + 1;
  return keeping(history, kept);
}

/**
 * The retention rule: the newest `KEEP_NEWEST` snapshots, and beyond them the newest of each day
 * (counted back from `now`) for `KEEP_DAYS` days, then as many of them, the newest first, as fit
 * `MAX_HISTORY`. Undo and redo steps to a snapshot let go are forgotten.
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
  return fit(keeping(history, kept));
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
    return retain({ ...history, snapshots: [burst, ...older] }, options.at);
  }
  const next = { ...history, undo: [...history.undo, newest.id], redo: [] };
  return push(next, library, 'change', summarise(diffLibraries(newest.library, library)), options);
}

/** What undo, redo and restore lead to: the next history, and the library to show. */
export interface Step {
  readonly history: History;
  readonly library: Library;
}

/** Who asks for an undo, a redo or a restore, and when. */
export type StepOptions = Omit<RecordOptions, 'alone'>;

function snapshotById(history: History, id: number): Snapshot {
  const snapshot = history.snapshots.find((s) => s.id === id);
  if (!snapshot) throw new CommandError('missing', `snapshot: no snapshot ${id}`);
  return snapshot;
}

/** Goes to the snapshot on top of `from`, keeps the step as a snapshot, and lets `to` lead back. */
function travel(history: History, from: 'undo' | 'redo', to: 'undo' | 'redo', cause: SnapshotCause, verb: string, options: StepOptions): Step | undefined {
  const [current] = history.snapshots;
  const id = history[from].at(-1);
  const target = history.snapshots.find((s) => s.id === id);
  if (!current || !target) return undefined;
  const summary = `${verb}: ${summarise(diffLibraries(current.library, target.library))}`;
  const next = { ...history, [from]: history[from].slice(0, -1), [to]: [...history[to], current.id] };
  return { history: push(next, target.library, cause, summary, options), library: target.library };
}

/** The library before the last change, or `undefined` when there is nothing to take back. */
export function undo(history: History, options: StepOptions): Step | undefined {
  return travel(history, 'undo', 'redo', 'undo', 'undone', options);
}

/** The library the last undo took back, or `undefined` when there is nothing to bring back. */
export function redo(history: History, options: StepOptions): Step | undefined {
  return travel(history, 'redo', 'undo', 'redo', 'redone', options);
}

/**
 * Every change a restore of snapshot `id` would make to the library as it is now, as in
 * `diffLibraries`. Throws a `CommandError` (`missing`) when the snapshot is not kept.
 */
export function previewRestore(history: History, id: number): string[] {
  const target = snapshotById(history, id);
  return diffLibraries((history.snapshots[0] as Snapshot).library, target.library);
}

/**
 * Goes back to snapshot `id`. The library as it is now stays the newest step to undo, so a restore
 * can be undone like any change. `undefined` when the snapshot is the library as it is.
 */
export function restore(history: History, id: number, options: StepOptions): Step | undefined {
  const target = snapshotById(history, id);
  const current = history.snapshots[0] as Snapshot;
  const changes = diffLibraries(current.library, target.library);
  if (changes.length === 0) return undefined;
  const next = { ...history, undo: [...history.undo, current.id], redo: [] };
  return { history: push(next, target.library, 'restore', `restored: ${summarise(changes)}`, options), library: target.library };
}
