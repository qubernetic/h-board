import { describe, expect, it } from 'vitest';
import { storedSearches } from '../src/index';
import { FakeArea } from './area';

describe('storedSearches', () => {
  it('starts empty and keeps every save in the local area', async () => {
    const area = new FakeArea();
    const history = await storedSearches(area);
    expect(history.load()).toEqual([]);
    history.save(['weather', 'trains']);
    expect(history.load()).toEqual(['weather', 'trains']);
    expect(area.read('searches')).toEqual(['weather', 'trains']);
    expect((await storedSearches(area)).load()).toEqual(['weather', 'trains']);
  });

  it('reads only text, and at most five searches', async () => {
    const area = new FakeArea();
    await area.set({ searches: ['a', 2, 'b', null, 'c', 'd', 'e', 'f'] });
    expect((await storedSearches(area)).load()).toEqual(['a', 'b', 'c', 'd', 'e']);
    await area.set({ searches: 'weather' });
    expect((await storedSearches(area)).load()).toEqual([]);
  });
});
