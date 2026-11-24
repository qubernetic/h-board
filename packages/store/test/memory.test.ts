import { emptyLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/index';
import type { Store } from '../src/index';

describe('MemoryStore', () => {
  it('has nothing before the first save', async () => {
    const store: Store = new MemoryStore();
    expect(await store.load()).toBeUndefined();
  });

  it('returns what was saved', async () => {
    const store: Store = new MemoryStore();
    const library: Library = { schema: 1, groups: [{ id: 'g1', name: 'Work', sites: [] }] };
    await store.save(library);
    expect(await store.load()).toEqual(library);
  });

  it('tells a listener about a save until it unsubscribes', async () => {
    const store: Store = new MemoryStore();
    const seen: Library[] = [];
    const stop = store.subscribe((library) => seen.push(library));
    await store.save(emptyLibrary());
    stop();
    await store.save(emptyLibrary());
    expect(seen).toHaveLength(1);
  });
});
