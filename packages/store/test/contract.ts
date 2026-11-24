import { BURST_MS, CommandError, emptyLibrary, sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import type { State, Store, StoreOptions } from '../src/index';

/** A clock the test moves by hand. */
export function clock(start = Date.UTC(2026, 10, 24, 9)): { now: () => number; pass: (ms: number) => void } {
  let at = start;
  return {
    now: () => at,
    pass: (ms) => {
      at += ms;
    },
  };
}

const names = (library: Library): string[] => library.groups.map((group) => group.name);

/**
 * What every `Store` does, whatever keeps the library. Each implementation runs this suite with a
 * factory that makes a fresh, empty store.
 */
export function storeContract(name: string, make: (options: StoreOptions) => Store): void {
  describe(`${name} (the Store contract)`, () => {
    it('starts with the empty library and its starting point', async () => {
      const state = await make({}).load();
      expect(state.library).toEqual(emptyLibrary());
      expect(state.history.snapshots.map((s) => s.cause)).toEqual(['start']);
      expect(state.notice).toBeUndefined();
    });

    it('starts with the library it is given', async () => {
      const state = await make({ initial: sampleLibrary }).load();
      expect(state.library).toEqual(sampleLibrary());
    });

    it('runs a command by id and keeps its library', async () => {
      const store = make({});
      const outcome = await store.apply('group.add', { name: 'Work' });
      expect(outcome.value).toEqual(expect.any(String));
      expect(names((await store.load()).library)).toEqual(['Work']);
    });

    it('refuses an unknown command and keeps the library as it was', async () => {
      const store = make({});
      await expect(store.apply('group.explode', {})).rejects.toBeInstanceOf(CommandError);
      expect((await store.load()).library).toEqual(emptyLibrary());
    });

    it('refuses a command an agent key may not run', async () => {
      const store = make({});
      const by = { kind: 'agent', key: 'helper', ownerScope: false } as const;
      await expect(store.apply('library.import', { text: '{}' }, { by })).rejects.toMatchObject({ code: 'refused' });
    });

    it('keeps a snapshot of each change burst with its source', async () => {
      const time = clock();
      const store = make({ now: time.now });
      await store.apply('group.add', { name: 'Work' });
      time.pass(BURST_MS - 1);
      await store.apply('group.add', { name: 'Home' });
      time.pass(BURST_MS);
      await store.apply('group.add', { name: 'News' }, { by: { kind: 'agent', key: 'helper', ownerScope: false } });
      const { snapshots } = (await store.load()).history;
      expect(snapshots.map((s) => [s.cause, s.source])).toEqual([
        ['change', { kind: 'agent', key: 'helper' }],
        ['change', { kind: 'user' }],
        ['start', { kind: 'user' }],
      ]);
      expect(names(snapshots[1]?.library ?? emptyLibrary())).toEqual(['Work', 'Home']);
    });

    it('keeps a change alone when asked to, even inside a burst', async () => {
      const store = make({ now: clock().now });
      await store.apply('group.add', { name: 'Work' });
      await store.apply('group.add', { name: 'Home' }, { alone: true });
      expect((await store.load()).history.snapshots).toHaveLength(3);
    });

    it('keeps no snapshot for a command that changes nothing', async () => {
      const store = make({});
      const outcome = await store.apply('library.export');
      expect(outcome.value).toEqual(expect.stringContaining('"app": "h-board"'));
      expect((await store.load()).history.snapshots).toHaveLength(1);
    });

    it('takes a change back and brings it again', async () => {
      const store = make({ now: clock().now });
      await store.apply('group.add', { name: 'Work' });
      expect(names((await store.undo())?.library ?? emptyLibrary())).toEqual([]);
      expect(names((await store.load()).library)).toEqual([]);
      expect(names((await store.redo())?.library ?? emptyLibrary())).toEqual(['Work']);
      expect(await store.redo()).toBeUndefined();
    });

    it('has nothing to undo at the start', async () => {
      expect(await make({}).undo()).toBeUndefined();
    });

    it('restores a snapshot, and the restore can be undone', async () => {
      const time = clock();
      const store = make({ now: time.now });
      const start = (await store.load()).history.snapshots[0]?.id ?? 0;
      await store.apply('group.add', { name: 'Work' });
      const restored = await store.restore(start);
      expect(restored?.library).toEqual(emptyLibrary());
      expect(restored?.history.snapshots[0]?.cause).toBe('restore');
      expect(names((await store.undo())?.library ?? emptyLibrary())).toEqual(['Work']);
      expect(await store.restore((await store.load()).history.snapshots[0]?.id ?? 0)).toBeUndefined();
    });

    it('tells a listener about every change until it stops', async () => {
      const store = make({ now: clock().now });
      const seen: State[] = [];
      const stop = store.subscribe((state) => seen.push(state));
      await store.apply('group.add', { name: 'Work' });
      await store.apply('library.export');
      await store.undo();
      stop();
      await store.redo();
      expect(seen.map((state) => names(state.library))).toEqual([['Work'], []]);
    });

    it('runs commands one after another when they are asked for at once', async () => {
      const store = make({});
      await Promise.all(['Work', 'Home', 'News'].map((name) => store.apply('group.add', { name })));
      expect(names((await store.load()).library)).toEqual(['Work', 'Home', 'News']);
    });

    it('goes on after a refused command', async () => {
      const store = make({});
      await store.apply('group.add', { name: '' }).catch(() => undefined);
      await store.apply('group.add', { name: 'Work' });
      expect(names((await store.load()).library)).toEqual(['Work']);
    });
  });
}
