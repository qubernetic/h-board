import { FILE_APP, emptyHistory, readLibraryFile } from '@h-board/core';
import type { History, Library, Snapshot, SnapshotCause, SnapshotSource } from '@h-board/core';

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const CAUSES: readonly SnapshotCause[] = ['start', 'change', 'undo', 'redo', 'restore'];

/**
 * A library read back from storage, checked by the same rules as an imported file: the library, or
 * every problem, each naming its field.
 */
export function readStoredLibrary(value: unknown): { library?: Library; problems: string[] } {
  if (!isRecord(value)) return { problems: ['library: is missing or not an object'] };
  const { library, problems } = readLibraryFile(JSON.stringify({ ...value, app: FILE_APP }));
  return problems.length > 0 ? { problems } : { library, problems };
}

function readSource(value: unknown): SnapshotSource | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'user') return { kind: 'user' };
  if (value.kind === 'agent' && typeof value.key === 'string') return { kind: 'agent', key: value.key };
  return undefined;
}

function readSnapshot(value: unknown): Snapshot | undefined {
  if (!isRecord(value)) return undefined;
  const { id, at, cause, summary, sites } = value;
  const source = readSource(value.source);
  const { library } = readStoredLibrary(value.library);
  if (!isCount(id) || !isCount(at) || !isCount(sites) || typeof summary !== 'string') return undefined;
  if (!CAUSES.includes(cause as SnapshotCause) || !source || !library) return undefined;
  return { id, at, source, cause: cause as SnapshotCause, summary, sites, library };
}

/** The top of an id stack, down to the first id that was not kept, as core's retention does. */
function reachable(value: unknown, kept: ReadonlySet<number>): number[] {
  const stack = Array.isArray(value) ? value : [];
  let from = stack.length;
  while (from > 0 && kept.has(stack[from - 1] as number)) from -= 1;
  return stack.slice(from) as number[];
}

/**
 * The snapshots read back from storage. A snapshot that cannot be read is left out, and undo and
 * redo steps to it are forgotten; what cannot be read at all is an empty history.
 */
export function readStoredHistory(value: unknown): History {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) return emptyHistory();
  const snapshots = value.snapshots.map(readSnapshot).filter((snapshot) => snapshot !== undefined);
  const ids = new Set(snapshots.map((snapshot) => snapshot.id));
  const next = Math.max(isCount(value.next) ? value.next : 1, ...snapshots.map((snapshot) => snapshot.id + 1));
  return { snapshots, undo: reachable(value.undo, ids), redo: reachable(value.redo, ids), next };
}
