import { describe, expect, it } from 'vitest';
import { CommandError, diffLibraries, emptyHistory, previewRestore, record, redo, restore, undo } from '../src/index';
import type { History, Library, SnapshotSource } from '../src/index';
import { library, run } from './support';

const user: SnapshotSource = { kind: 'user' };
const agent: SnapshotSource = { kind: 'agent', key: 'calendar-bot' };
const MINUTE = 60_000;
const T0 = Date.UTC(2026, 10, 24, 9, 0);
const at = (minutes: number) => ({ source: user, at: T0 + minutes * MINUTE });

/** The sample library, then two more sites in Development, then the light theme, a minute apart. */
const twoSites = run('site.add', run('site.add', library, { group: 'g2', name: 'GitLab', url: 'https://gitlab.com' }).library, {
  group: 'g2',
  name: 'Codeberg',
  url: 'https://codeberg.org',
}).library;
const light = run('settings.set', twoSites, { theme: 'light' }).library;
const history = [library, twoSites, light].reduce<History>((h, lib, i) => record(h, lib, at(i)), emptyHistory());

/** The library a step leads to, or a failure when there is none. */
function libraryOf(step: { library: Library } | undefined): Library {
  if (!step) throw new Error('no step');
  return step.library;
}

describe('undo', () => {
  it('takes back one change at a time and keeps each step as a snapshot', () => {
    const first = undo(history, at(5));
    expect(first?.library).toEqual(twoSites);
    expect(first?.history.snapshots[0]).toMatchObject({ id: 4, cause: 'undo', summary: 'undone: theme: system', source: user });
    const second = first && undo(first.history, at(6));
    expect(second?.library).toEqual(library);
    expect(second?.history.snapshots[0]?.summary).toBe('undone: -2 sites in Development');
    expect(second && undo(second.history, at(7))).toBeUndefined();
  });

  it('takes back a whole burst', () => {
    const one = run('todo.add', library, { text: 'one' }).library;
    const two = run('todo.add', one, { text: 'two' }).library;
    let h = record(emptyHistory(), library, at(0));
    h = record(record(h, one, { source: user, at: T0 + MINUTE }), two, { source: user, at: T0 + MINUTE + 500 });
    expect(undo(h, at(2))?.library).toEqual(library);
  });

  it('has nothing to take back in an empty history or behind a lost snapshot', () => {
    expect(undo(emptyHistory(), at(0))).toBeUndefined();
    expect(undo({ ...history, undo: [99] }, at(5))).toBeUndefined();
  });
});

describe('redo', () => {
  it('brings back what undo took, step by step', () => {
    const back = undo(historyOf(undo(history, at(5))), at(6));
    const again = redo(historyOf(back), at(7));
    expect(again?.library).toEqual(twoSites);
    expect(again?.history.snapshots[0]).toMatchObject({ cause: 'redo', summary: 'redone: +2 sites in Development' });
    const twice = redo(historyOf(again), at(8));
    expect(twice?.library).toEqual(light);
    expect(redo(historyOf(twice), at(9))).toBeUndefined();
    expect(undo(historyOf(twice), at(9))?.library).toEqual(twoSites);
  });

  it('has nothing to bring back after a new change', () => {
    const back = historyOf(undo(history, at(5)));
    const changed = record(back, run('todo.add', twoSites, { text: 'new' }).library, at(6));
    expect(redo(changed, at(7))).toBeUndefined();
  });

  it('does not let a change join the snapshot of an undo', () => {
    const back = historyOf(undo(history, at(5)));
    const changed = record(back, run('todo.add', twoSites, { text: 'new' }).library, { source: user, at: T0 + 5 * MINUTE + 1 });
    expect(changed.snapshots.map((s) => s.cause).slice(0, 2)).toEqual(['change', 'undo']);
    expect(undo(changed, at(6))?.library).toEqual(twoSites);
  });
});

describe('restore', () => {
  it('goes back to any snapshot and can itself be undone and redone', () => {
    const restored = restore(history, 1, { source: agent, at: T0 + 5 * MINUTE });
    expect(restored?.library).toEqual(library);
    expect(restored?.history.snapshots[0]).toMatchObject({
      id: 4,
      cause: 'restore',
      source: agent,
      summary: 'restored: -2 sites in Development, theme: system',
    });
    const undone = undo(historyOf(restored), at(6));
    expect(undone?.library).toEqual(light);
    expect(redo(historyOf(undone), at(7))?.library).toEqual(library);
  });

  it('forgets what could be redone', () => {
    const back = historyOf(undo(history, at(5)));
    expect(back.redo).not.toEqual([]);
    expect(restore(back, 1, at(6))?.history.redo).toEqual([]);
  });

  it('does nothing when the snapshot is the library as it is', () => {
    expect(restore(history, 3, at(5))).toBeUndefined();
  });

  it('names a snapshot that is not kept', () => {
    expect(() => restore(history, 99, at(5))).toThrow(new CommandError('missing', 'snapshot: no snapshot 99'));
  });
});

describe('previewRestore', () => {
  it('lists exactly what a restore changes', () => {
    expect(previewRestore(history, 1)).toEqual(['-2 sites in Development', 'theme: system']);
    expect(previewRestore(history, 2)).toEqual(['theme: system']);
    expect(previewRestore(history, 3)).toEqual([]);
    for (const id of [1, 2]) {
      const after = libraryOf(restore(history, id, at(5)));
      expect(previewRestore(history, id)).toEqual(diffLibraries(light, after));
      expect(diffLibraries(after, history.snapshots.find((s) => s.id === id)?.library ?? light)).toEqual([]);
    }
  });

  it('names a snapshot that is not kept', () => {
    expect(() => previewRestore(history, 99)).toThrow(new CommandError('missing', 'snapshot: no snapshot 99'));
    expect(() => previewRestore(emptyHistory(), 1)).toThrow(new CommandError('missing', 'snapshot: no snapshot 1'));
  });
});

/** The history a step leads to, or a failure when there is none. */
function historyOf(step: { history: History } | undefined): History {
  if (!step) throw new Error('no step');
  return step.history;
}
