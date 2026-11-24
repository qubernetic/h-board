import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { describe, expect, it, vi } from 'vitest';
import { ExtStore, SCHEMA } from '../src/index';
import type { Migration, State } from '../src/index';
import { FakeLocalArea } from './chrome-storage';
import { clock, storeContract } from './contract';

storeContract('ExtStore', (options) => new ExtStore(new FakeLocalArea(), options));

const names = (library: Library | undefined): string[] => (library?.groups ?? []).map((group) => group.name);

/** An area with one library kept: `Work` first, then `Home` added, as two snapshots. */
async function twoChanges(): Promise<{ area: FakeLocalArea; time: ReturnType<typeof clock> }> {
  const area = new FakeLocalArea();
  const time = clock();
  const store = new ExtStore(area, { now: time.now });
  await store.apply('group.add', { name: 'Work' });
  time.pass(60_000);
  await store.apply('group.add', { name: 'Home' });
  return { area, time };
}

describe('ExtStore', () => {
  it('keeps the schema, the library and the snapshots in the storage it is given', async () => {
    const { area } = await twoChanges();
    expect([...area.items.keys()].sort()).toEqual(['history', 'library', 'schema']);
    expect(area.read('schema')).toBe(SCHEMA);
    expect(names(area.read('library') as Library)).toEqual(['Work', 'Home']);
  });

  it('finds what an earlier page kept', async () => {
    const { area, time } = await twoChanges();
    const state = await new ExtStore(area, { now: time.now }).load();
    expect(names(state.library)).toEqual(['Work', 'Home']);
    expect(state.history.snapshots).toHaveLength(3);
    expect(names((await new ExtStore(area, { now: time.now }).undo())?.library)).toEqual(['Work']);
  });

  it('tells a page about a change made in another page, and a page about its own change once', async () => {
    const area = new FakeLocalArea();
    const here = new ExtStore(area);
    const there = new ExtStore(area);
    const seenHere: State[] = [];
    const seenThere: State[] = [];
    here.subscribe((state) => seenHere.push(state));
    there.subscribe((state) => seenThere.push(state));
    await here.load();
    await there.load();
    await there.apply('group.add', { name: 'Work' });
    await vi.waitFor(() => expect(seenHere).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(names(seenHere[0]?.library)).toEqual(['Work']);
    expect(seenThere).toHaveLength(1);
  });

  it('runs a change on what another page kept, not on what it saw last', async () => {
    const area = new FakeLocalArea();
    const here = new ExtStore(area);
    const there = new ExtStore(area);
    await here.load();
    await there.apply('group.add', { name: 'Work' });
    await here.apply('group.add', { name: 'Home' });
    expect(names((await there.load()).library)).toEqual(['Work', 'Home']);
  });

  it('keeps the library as it was when the storage refuses the write', async () => {
    const area = new FakeLocalArea();
    const store = new ExtStore(area);
    await store.apply('group.add', { name: 'Work' });
    area.failNext = new Error('QUOTA_BYTES quota exceeded');
    await expect(store.apply('group.add', { name: 'Home' })).rejects.toThrow('QUOTA_BYTES');
    expect(names((await store.load()).library)).toEqual(['Work']);
  });

  describe('a stored library that cannot be read', () => {
    it('falls back to the newest valid snapshot and says so, once', async () => {
      const { area, time } = await twoChanges();
      const broken = { ...(area.read('library') as object), groups: 'lost' };
      area.put('library', broken);
      const store = new ExtStore(area, { now: time.now });
      const state = await store.load();
      expect(names(state.library)).toEqual(['Work', 'Home']);
      expect(state.notice).toContain('The stored library could not be read (groups:');
      expect(state.notice).toContain('restored from the snapshot of 2026-11-24 09:01 UTC');
      expect(area.read('corrupt')).toEqual(broken);
      expect(names(area.read('library') as Library)).toEqual(['Work', 'Home']);
      expect((await store.load()).notice).toBeUndefined();
    });

    it('skips a snapshot that cannot be read either', async () => {
      const { area, time } = await twoChanges();
      const history = area.read('history') as { snapshots: { library: unknown }[] };
      history.snapshots[0] = { ...history.snapshots[0], library: null };
      area.put('history', history);
      area.put('library', 'garbage');
      const state = await new ExtStore(area, { now: time.now }).load();
      expect(names(state.library)).toEqual(['Work']);
      expect(state.notice).toContain('09:00 UTC');
      expect(state.history.snapshots).toHaveLength(2);
    });

    it('starts again when no snapshot can be read, and says so', async () => {
      const area = new FakeLocalArea();
      area.put('schema', SCHEMA);
      area.put('library', { schema: 1 });
      area.put('history', 'garbage');
      const state = await new ExtStore(area, { initial: sampleLibrary }).load();
      expect(state.library).toEqual(sampleLibrary());
      expect(state.notice).toContain('No snapshot could be read either');
      expect(state.history.snapshots.map((s) => s.cause)).toEqual(['start']);
    });
  });

  it('keeps the readable snapshots of a damaged history and forgets steps to the others', async () => {
    const { area, time } = await twoChanges();
    const history = area.read('history') as { snapshots: object[]; undo: number[] };
    history.snapshots[1] = { ...history.snapshots[1], cause: 'magic' };
    history.snapshots.push(7 as unknown as object);
    area.put('history', history);
    const store = new ExtStore(area, { now: time.now });
    const state = await store.load();
    expect(names(state.library)).toEqual(['Work', 'Home']);
    expect(state.history.snapshots.map((s) => s.cause)).toEqual(['change', 'start']);
    expect(state.history.undo).toEqual([]);
    expect(state.history.next).toBe(4);
    expect(await store.undo()).toBeUndefined();
  });

  it('refuses storage from a newer version and leaves it as it is', async () => {
    const area = new FakeLocalArea();
    area.put('schema', SCHEMA + 1);
    area.put('library', { future: true });
    const store = new ExtStore(area);
    await expect(store.load()).rejects.toThrow(`schema ${SCHEMA + 1}`);
    await expect(store.apply('group.add', { name: 'Work' })).rejects.toThrow('newer');
    expect(area.read('library')).toEqual({ future: true });
  });

  it('migrates storage from an older schema step by step and keeps the result', async () => {
    const area = new FakeLocalArea();
    area.put('schema', 1);
    area.put('library', { ...emptyLibrary(), groups: [{ id: 'g1', title: 'Work', iconMode: 'brand', sites: [] }] });
    const migrations: Migration[] = [
      (items) => {
        const library = items.library as { groups: { title: string }[] };
        return { ...items, library: { ...library, groups: library.groups.map(({ title, ...group }) => ({ ...group, name: title })) } };
      },
    ];
    const state = await new ExtStore(area, { migrations }).load();
    expect(names(state.library)).toEqual(['Work']);
    expect(area.read('schema')).toBe(2);
    expect(names(area.read('library') as Library)).toEqual(['Work']);
  });

  it('reads storage without a schema as schema 1', async () => {
    const area = new FakeLocalArea();
    area.put('library', { ...emptyLibrary(), groups: [{ id: 'g1', name: 'Work', iconMode: 'brand', sites: [] }] });
    expect(names((await new ExtStore(area).load()).library)).toEqual(['Work']);
  });
});

describe('privacy', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : sources(path);
      return /\.(ts|js|mjs|json|html)$/.test(name) ? [path] : [];
    });

  it('nothing in the packages uses chrome.storage.sync', () => {
    const root = new URL('../..', import.meta.url).pathname;
    const files = sources(root).filter((path) => !path.endsWith('ext.test.ts'));
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((path) => /storage\s*\.\s*sync|\bsync\s*:\s*\{|\['sync'\]/.test(readFileSync(path, 'utf8')))).toEqual([]);
  });
});
