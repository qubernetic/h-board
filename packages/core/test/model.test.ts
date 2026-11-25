import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, emptyLibrary } from '../src/index';
import { nextId } from '../src/model';
import type { Library } from '../src/index';

describe('emptyLibrary', () => {
  it('starts with no groups, no todos and the default settings', () => {
    expect(emptyLibrary()).toEqual({ schema: 1, groups: [], todos: [], settings: DEFAULT_SETTINGS });
  });

  it('moves reduced by default and opens on the first group', () => {
    expect(DEFAULT_SETTINGS.motion).toBe('reduced');
    expect(DEFAULT_SETTINGS.activeGroup).toBeNull();
  });
});

describe('nextId', () => {
  const site = { name: 'a', url: 'https://a.example.com', description: '', glyph: 'globe', brand: null, icon: null };
  const library: Library = {
    ...emptyLibrary(),
    groups: [{ id: 'g2', name: 'A', iconMode: 'brand', sites: [{ ...site, id: 's9' }, { ...site, id: 'sx' }] }],
    todos: [{ id: 't1', text: 'x', done: false }],
  };

  it('counts on from the highest id with the prefix', () => {
    expect(nextId(library, 'g')).toBe('g3');
    expect(nextId(library, 's')).toBe('s10');
    expect(nextId(library, 't')).toBe('t2');
  });

  it('starts at 1 in an empty library', () => {
    expect(nextId(emptyLibrary(), 's')).toBe('s1');
  });
});
