// @vitest-environment happy-dom
import { emptyLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { describe, expect, it } from 'vitest';
import { mountBoard, renderBoard } from '../src/index';

function root(): HTMLElement {
  return document.createElement('main');
}

const library: Library = {
  schema: 1,
  groups: [
    {
      id: 'g1',
      name: 'Work',
      sites: [
        { id: 's1', name: 'Docs', url: 'https://docs.example.com/' },
        { id: 's2', name: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' },
        { id: 's3', name: 'Broken', url: 'not an address' },
      ],
    },
  ],
};

describe('renderBoard', () => {
  it('says so when there are no groups', () => {
    const main = root();
    renderBoard(main, emptyLibrary());
    expect(main.querySelector('h1')?.textContent).toBe('H-Board');
    expect(main.querySelector('[data-empty]')).not.toBeNull();
  });

  it('draws a group with its sites', () => {
    const main = root();
    renderBoard(main, library);
    expect(main.querySelector('h2')?.textContent).toBe('Work');
    expect(main.querySelector('a')?.getAttribute('href')).toBe('https://docs.example.com/');
    expect(main.querySelector('[data-empty]')).toBeNull();
  });

  it('treats a site name as text and drops an address that is not http or https', () => {
    const main = root();
    renderBoard(main, library);
    const hostile = main.querySelectorAll('a')[1];
    expect(main.querySelector('img')).toBeNull();
    expect(hostile?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(hostile?.hasAttribute('href')).toBe(false);
    expect(main.querySelectorAll('a')[2]?.hasAttribute('href')).toBe(false);
  });

  it('replaces the earlier drawing', () => {
    const main = root();
    renderBoard(main, library);
    renderBoard(main, emptyLibrary());
    expect(main.querySelectorAll('h1')).toHaveLength(1);
    expect(main.querySelector('h2')).toBeNull();
  });
});

describe('mountBoard', () => {
  it('draws the stored library and follows later saves until stopped', async () => {
    const main = root();
    const store = new MemoryStore();
    const stop = await mountBoard(main, store);
    expect(main.querySelector('[data-empty]')).not.toBeNull();
    await store.save(library);
    expect(main.querySelector('h2')?.textContent).toBe('Work');
    stop();
    await store.save(emptyLibrary());
    expect(main.querySelector('h2')?.textContent).toBe('Work');
  });
});
