import { describe, expect, it } from 'vitest';
import { BURST_MS, KEEP_DAYS, KEEP_NEWEST, MAX_HISTORY, emptyHistory, emptyLibrary, record, retain } from '../src/index';
import type { History, Library, Site, Snapshot, SnapshotSource } from '../src/index';
import { library, run, site } from './support';

const user: SnapshotSource = { kind: 'user' };
const agent: SnapshotSource = { kind: 'agent', key: 'calendar-bot' };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 24, 9, 0);

function todo(lib: Library, text: string): Library {
  return run('todo.add', lib, { text }).library;
}

/** The history after the sample library was recorded at T0. */
const started = record(emptyHistory(), library, { source: user, at: T0 });

describe('record', () => {
  it('keeps the first library as the starting point', () => {
    expect(started.snapshots).toEqual([
      { id: 1, at: T0, source: user, cause: 'start', summary: 'starting point', sites: 4, library },
    ]);
    expect(started.undo).toEqual([]);
  });

  it('keeps nothing new when the library did not change', () => {
    expect(record(started, structuredClone(library), { source: user, at: T0 + HOUR })).toBe(started);
  });

  it('keeps each change with its source and what it changed, and remembers the state before it', () => {
    const next = todo(library, 'Call the client');
    const history = record(started, next, { source: agent, at: T0 + MINUTE });
    expect(history.snapshots[0]).toEqual({
      id: 2,
      at: T0 + MINUTE,
      source: agent,
      cause: 'change',
      summary: '+todo Call the client',
      sites: 4,
      library: next,
    });
    expect(history.snapshots).toHaveLength(2);
    expect(history.undo).toEqual([1]);
  });

  it('keeps one snapshot for a burst of changes from one source', () => {
    const one = todo(library, 'one');
    const two = todo(one, 'two');
    let history = record(started, one, { source: user, at: T0 + MINUTE });
    history = record(history, two, { source: user, at: T0 + MINUTE + BURST_MS - 1 });
    expect(history.snapshots.map((s) => s.id)).toEqual([2, 1]);
    expect(history.snapshots[0]).toMatchObject({ at: T0 + MINUTE + BURST_MS - 1, summary: '+todo one, +todo two', library: two });
    expect(history.undo).toEqual([1]);
  });

  it('starts a new snapshot after a pause, for another source, or when asked to', () => {
    const one = todo(library, 'one');
    const two = todo(one, 'two');
    const first = record(started, one, { source: user, at: T0 + MINUTE });
    const later = record(first, two, { source: user, at: T0 + MINUTE + BURST_MS });
    const other = record(first, two, { source: agent, at: T0 + MINUTE + 1 });
    const otherKey = record(record(started, one, { source: agent, at: T0 }), two, {
      source: { kind: 'agent', key: 'mail-bot' },
      at: T0 + 1,
    });
    const alone = record(first, two, { source: user, at: T0 + MINUTE + 1, alone: true });
    for (const history of [later, other, otherKey, alone]) {
      expect(history.snapshots.map((s) => s.summary)).toEqual(['+todo two', '+todo one', 'starting point']);
      expect(history.undo).toEqual([1, 2]);
    }
  });

  it('never folds a change into the starting point', () => {
    const history = record(started, todo(library, 'one'), { source: user, at: T0 + 1 });
    expect(history.snapshots.map((s) => s.cause)).toEqual(['change', 'start']);
  });

  it('drops a burst that ends where it began', () => {
    const one = todo(library, 'one');
    const history = record(record(started, one, { source: user, at: T0 + 1 }), library, { source: user, at: T0 + 2 });
    expect(history.snapshots.map((s) => s.id)).toEqual([1]);
    expect(history.undo).toEqual([]);
  });

  it('applies the retention rule', () => {
    let history = started;
    let lib = library;
    for (let i = 1; i <= KEEP_NEWEST + 5; i += 1) {
      lib = todo(lib, `todo ${i}`);
      history = record(history, lib, { source: user, at: T0 + i * MINUTE });
    }
    // the newest twenty, and the newest one of today beyond them
    expect(history.snapshots).toHaveLength(KEEP_NEWEST + 1);
    expect(history.snapshots.slice(-2).map((s) => s.summary)).toEqual(['+todo todo 6', '+todo todo 5']);
  });
});

describe('the size of the history', () => {
  const bytesOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
  /** A site of about 4 MB; the summary of a change does not repeat its description. */
  const heavy = (id: string): Site => ({ ...site(id), description: 'é'.repeat(2_000_000) });
  /** A library of about 4 MB, a different one for each `n`. */
  const large = (n: number, sites = [heavy('s1')]): Library => ({
    ...emptyLibrary(),
    groups: [{ id: 'g1', name: `Group ${n}`, iconMode: 'brand', sites }],
  });

  it('lets go of the oldest snapshots until the history fits MAX_HISTORY bytes as JSON', () => {
    let history = emptyHistory();
    for (let n = 0; n < 14; n += 1) {
      history = record(history, large(n), { source: user, at: T0 + n * MINUTE });
      expect(bytesOf(history)).toBeLessThanOrEqual(MAX_HISTORY);
    }
    expect(history.snapshots.length).toBe(11);
    expect(history.snapshots.map((s) => s.library.groups[0]?.name)).toEqual(Array.from({ length: 11 }, (_, i) => `Group ${13 - i}`));
    const ids = new Set(history.snapshots.map((s) => s.id));
    expect(history.undo).toHaveLength(history.snapshots.length - 1);
    expect(history.undo.every((id) => ids.has(id))).toBe(true);
  }, 60_000);

  it('lets go of the oldest when a burst grows the newest', () => {
    let history = emptyHistory();
    for (let n = 0; n < 22; n += 2) history = record(history, large(n), { source: user, at: T0 + n * MINUTE });
    const before = history.snapshots.length;
    expect(before).toBe(11);
    const grown = large(20, [heavy('s1'), heavy('s2')]);
    history = record(history, grown, { source: user, at: T0 + 20 * MINUTE + 1 });
    expect(bytesOf(history)).toBeLessThanOrEqual(MAX_HISTORY);
    expect(history.snapshots.length).toBeLessThan(before);
    expect(history.snapshots[0]?.library).toEqual(grown);
  }, 60_000);

  it('keeps the newest snapshot even when it alone is larger', () => {
    const huge: Library = { ...emptyLibrary(), todos: [{ id: 't1', text: 'x'.repeat(MAX_HISTORY), done: false }] };
    const history = record(emptyHistory(), huge, { source: user, at: T0 });
    expect(history.snapshots.map((s) => s.library)).toEqual([huge]);
  });
});

/** A snapshot of the sample library at a time, for the retention rule. */
function snap(id: number, at: number): Snapshot {
  return { id, at, source: user, cause: 'change', summary: `${id}`, sites: 4, library };
}

describe('retain', () => {
  it('keeps the newest twenty, then the newest of each day for a week', () => {
    const now = T0;
    const old: Snapshot[] = [];
    let id = 100;
    // three snapshots on each of the nine days before the newest twenty, an hour apart
    for (let day = 1; day <= 9; day += 1) {
      for (const hours of [1, 2, 3]) old.push(snap((id -= 1), now - day * DAY - hours * HOUR));
    }
    const newest = Array.from({ length: KEEP_NEWEST }, (_, i) => snap(200 - i, now - i * MINUTE));
    const history: History = { snapshots: [...newest, ...old], undo: [], redo: [], next: 201 };
    const kept = retain(history, now).snapshots;
    expect(kept.slice(0, KEEP_NEWEST)).toEqual(newest);
    expect(kept.slice(KEEP_NEWEST).map((s) => Math.floor((now - s.at) / DAY))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(kept.slice(KEEP_NEWEST).map((s) => (now - s.at) % DAY)).toEqual(Array(KEEP_DAYS - 1).fill(HOUR));
  });

  it('keeps the newest twenty however old they are', () => {
    const history: History = { snapshots: [snap(2, T0 - 30 * DAY), snap(1, T0 - 31 * DAY)], undo: [1], redo: [], next: 3 };
    expect(retain(history, T0)).toBe(history);
  });

  it('forgets undo and redo steps that lead to a snapshot it let go', () => {
    const snapshots = [
      ...Array.from({ length: KEEP_NEWEST }, (_, i) => snap(30 - i, T0 - i * MINUTE)),
      snap(5, T0 - 8 * DAY),
      snap(4, T0 - 9 * DAY),
    ];
    const history: History = { snapshots, undo: [4, 5, 11, 12], redo: [5, 29], next: 31 };
    const kept = retain(history, T0);
    expect(kept.snapshots.map((s) => s.id)).not.toContain(5);
    expect(kept.undo).toEqual([11, 12]);
    expect(kept.redo).toEqual([29]);
  });
});
