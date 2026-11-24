// @vitest-environment happy-dom
import { sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryHistory, mountBoard } from '../src/index';
import type { BoardOptions } from '../src/index';

let stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.body.replaceChildren();
});

interface Mounted {
  main: HTMLElement;
  store: MemoryStore;
  opened: string[];
  input: HTMLInputElement;
}

async function mount(history: string[] = [], options: BoardOptions = {}, library: Library = sampleLibrary()): Promise<Mounted> {
  const main = document.createElement('main');
  document.body.append(main);
  const store = new MemoryStore({ initial: () => library });
  const opened: string[] = [];
  stops.push(
    await mountBoard(main, store, {
      viewport: () => ({ w: 1440, h: 900 }),
      open: (url) => opened.push(url),
      searchHistory: memoryHistory(history),
      ...options,
    }),
  );
  const input = main.querySelector<HTMLInputElement>('[data-part="search-input"]');
  if (!input) throw new Error('no search input');
  return { main, store, opened, input };
}

const part = (root: ParentNode, name: string): HTMLElement => {
  const node = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!node) throw new Error(`no ${name}`);
  return node;
};
const rows = (main: HTMLElement): string[] =>
  [...main.querySelectorAll('[data-part="suggestions"] .row')].map(
    (row) => `${row.querySelector('.t')?.textContent ?? ''} | ${row.querySelector('.m')?.textContent ?? ''}`,
  );
const selected = (main: HTMLElement): string | null | undefined =>
  main.querySelector('[data-part="suggestions"] .row[aria-selected="true"] .t')?.textContent;
const key = (target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the search line', () => {
  it('takes the focus on / and shows the history, and leaves / to a text field', async () => {
    const { main, input } = await mount(['rust tokio select', 'ethercat distributed clocks']);
    const list = part(main, 'suggestions');
    expect(list.hidden).toBe(true);
    expect(key(document.body, '/').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(list.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(part(main, 'search').classList.contains('open')).toBe(true);
    expect(part(main, 'scrim').classList.contains('on')).toBe(true);
    expect(rows(main)).toEqual(['rust tokio select | history', 'ethercat distributed clocks | history']);
    expect(selected(main)).toBeUndefined();
    expect(key(input, '/').defaultPrevented).toBe(false);
    key(input, 'ArrowUp');
    expect(selected(main)).toBe('ethercat distributed clocks');
  });

  it('says so when there is no history yet', async () => {
    const { main, input } = await mount();
    input.focus();
    expect(part(main, 'suggestions').textContent).toBe('no history · type a search or an address');
    key(input, 'Enter');
    expect(part(main, 'suggestions').hidden).toBe(false);
  });

  it("lists the user's own sites first, then the history, and selects the first row", async () => {
    const { main, input } = await mount(['twincat 3.1.4026 release notes']);
    input.focus();
    type(input, 'twincat ads');
    expect(rows(main)).toEqual([
      'beckhoff infosys | Development · own site',
      'crates.io | Development · own site',
      'pypi | Development · own site',
      'twincat 3.1.4026 release notes | history',
    ]);
    expect(selected(main)).toBe('beckhoff infosys');
    expect(input.getAttribute('aria-activedescendant')).toBe('hb-sugg-0');
    const first = main.querySelector('[data-part="suggestions"] .row');
    expect(first?.classList.contains('hit')).toBe(true);
    expect(first?.querySelector('.tabk')?.textContent).toBe('tab: search here');
  });

  it('moves the selection with the arrows, round the ends', async () => {
    const { main, input } = await mount(['twincat 3.1.4026 release notes']);
    input.focus();
    type(input, 'twincat ads');
    key(input, 'ArrowDown');
    expect(selected(main)).toBe('crates.io');
    key(input, 'ArrowUp');
    key(input, 'ArrowUp');
    expect(selected(main)).toBe('twincat 3.1.4026 release notes');
    key(input, 'ArrowDown');
    expect(selected(main)).toBe('beckhoff infosys');
  });

  it('opens the selected site with Enter and empties the line', async () => {
    const { main, input, opened } = await mount();
    input.focus();
    type(input, 'twincat ads');
    key(input, 'Enter');
    expect(opened).toEqual(['https://infosys.beckhoff.com']);
    expect(input.value).toBe('');
    expect(part(main, 'suggestions').hidden).toBe(true);
  });

  it('sends words to the engine and remembers them, the newest first', async () => {
    const { main, input, opened } = await mount(['older']);
    input.focus();
    type(input, 'lorem ipsum');
    expect(selected(main)).toBeUndefined();
    key(input, 'Enter');
    expect(opened).toEqual(['https://duckduckgo.com/?q=lorem%20ipsum']);
    type(input, '');
    expect(rows(main)).toEqual(['lorem ipsum | history', 'older | history']);
  });

  it('runs a row of the history again with the engine', async () => {
    const { input, opened } = await mount(['docs.rs tokio', 'docs.rs']);
    input.focus();
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(opened).toEqual(['https://duckduckgo.com/?q=docs.rs']);
  });

  it('opens an address as it is', async () => {
    const { input, opened } = await mount();
    input.focus();
    type(input, 'example.org/a');
    key(input, 'ArrowUp');
    // nothing matches, so no row is selected and Enter takes the line
    key(input, 'Enter');
    expect(opened).toEqual(['https://example.org/a']);
  });

  it('turns the engine with Tab and with a click, and keeps it in the settings', async () => {
    const { main, input, store } = await mount();
    input.focus();
    const engine = part(main, 'engine');
    expect(engine.textContent).toBe('ddg');
    expect(key(input, 'Tab').defaultPrevented).toBe(true);
    await flush();
    expect(engine.textContent).toBe('google');
    expect((await store.load()).library.settings.engine).toBe('google');
    engine.click();
    await flush();
    expect(part(main, 'engine').textContent).toBe('startpage');
    expect(key(input, 'Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    type(input, 'rust');
    key(input, 'Enter');
  });

  it('searches inside a site after its alias and a space, and lifts the scope with Escape', async () => {
    const { main, input, opened } = await mount();
    input.focus();
    type(input, 'gh ');
    const engine = part(main, 'engine');
    expect(input.value).toBe('');
    expect(engine.textContent).toBe('github');
    expect(engine.classList.contains('scoped')).toBe(true);
    expect(input.placeholder).toBe('search here');
    expect(part(main, 'suggestions').textContent).toBe('type what you are looking for on github.com');
    type(input, 'tokio select');
    expect(rows(main)).toEqual(['tokio select | search on github.com']);
    key(input, 'Escape');
    expect(engine.textContent).toBe('ddg');
    expect(input.value).toBe('tokio select');
    expect(part(main, 'suggestions').hidden).toBe(false);
    type(input, 'gh ');
    type(input, 'tokio');
    key(input, 'Enter');
    expect(opened).toEqual(['https://github.com/search?q=tokio']);
    expect(engine.textContent).toBe('ddg');
  });

  it("searches inside a site with Tab on the site's row, and Backspace on an empty line lifts it", async () => {
    const { main, input } = await mount();
    input.focus();
    type(input, 'docs.rs');
    expect(selected(main)).toBe('docs.rs');
    key(input, 'Tab');
    const engine = part(main, 'engine');
    expect(engine.textContent).toBe('docs.rs');
    expect(input.value).toBe('');
    // Tab inside a site does nothing more
    key(input, 'Tab');
    expect(engine.textContent).toBe('docs.rs');
    expect(key(input, 'Backspace').defaultPrevented).toBe(true);
    expect(engine.textContent).toBe('ddg');
    expect(key(input, 'Backspace').defaultPrevented).toBe(false);
  });

  it('lifts the scope with a click on the site chip and keeps the focus', async () => {
    const { main, input } = await mount();
    input.focus();
    type(input, 'inf ');
    const engine = part(main, 'engine');
    expect(engine.textContent).toBe('beckhoff infosys');
    expect(engine.getAttribute('aria-label')).toBe('Search on beckhoff infosys. Back to the general search');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    engine.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    engine.click();
    expect(engine.textContent).toBe('ddg');
    expect(engine.getAttribute('aria-label')).toBe('Next search engine');
  });

  it('closes with Escape, then gives the focus back with a second Escape', async () => {
    const { main, input } = await mount(['a b']);
    input.focus();
    key(input, 'Escape');
    expect(part(main, 'suggestions').hidden).toBe(true);
    expect(document.activeElement).toBe(input);
    key(input, 'ArrowDown');
    expect(part(main, 'suggestions').hidden).toBe(false);
    key(input, 'Escape');
    key(input, 'Escape');
    expect(document.activeElement).not.toBe(input);
  });

  it('lifts the scope and closes when the focus leaves', async () => {
    const { main, input } = await mount();
    input.focus();
    type(input, 'so ');
    input.blur();
    expect(part(main, 'engine').textContent).toBe('ddg');
    expect(part(main, 'suggestions').hidden).toBe(true);
    expect(part(main, 'scrim').classList.contains('on')).toBe(false);
  });

  it('opens a row with the mouse, and selects the row under the pointer', async () => {
    const { main, input, opened } = await mount();
    input.focus();
    type(input, 'crates');
    const list = part(main, 'suggestions');
    const second = list.querySelectorAll('.row')[1] as HTMLElement | undefined;
    if (second) {
      second.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      expect(second.getAttribute('aria-selected')).toBe('true');
    }
    const row = list.querySelector('.row .t') as HTMLElement;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(opened).toEqual(['https://crates.io']);
    list.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    list.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(opened).toHaveLength(1);
  });

  it('puts the focus into the line on a click anywhere in the box, and closes on a click on the scrim', async () => {
    const { main, input } = await mount();
    const box = part(main, 'search');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    part(main, 'search-kbd').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(box.classList.contains('open')).toBe(true);
    part(main, 'scrim').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps the engine chip in step with the settings, and the site while it searches inside one', async () => {
    const { main, store, input } = await mount();
    await store.apply('settings.set', { engine: 'startpage' });
    expect(part(main, 'engine').textContent).toBe('startpage');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    part(main, 'engine').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    input.focus();
    type(input, 'gh ');
    await store.apply('settings.set', { engine: 'google' });
    expect(part(main, 'engine').textContent).toBe('github');
  });

  it('opens a new tab without access to the page by default', async () => {
    const calls: unknown[][] = [];
    const original = window.open;
    window.open = ((...args: unknown[]) => {
      calls.push(args);
      return null;
    }) as typeof window.open;
    try {
      const main = document.createElement('main');
      document.body.append(main);
      stops.push(await mountBoard(main, new MemoryStore({ initial: sampleLibrary })));
      const input = main.querySelector<HTMLInputElement>('[data-part="search-input"]') as HTMLInputElement;
      input.focus();
      type(input, 'example.org');
      key(input, 'Enter');
      expect(calls).toEqual([['https://example.org', '_blank', 'noopener']]);
    } finally {
      window.open = original;
    }
  });
});

describe('the history in memory', () => {
  it('gives back what it was given and keeps what it is told', () => {
    const history = memoryHistory(['a']);
    expect(history.load()).toEqual(['a']);
    history.save(['b', 'a']);
    expect(history.load()).toEqual(['b', 'a']);
    expect(memoryHistory().load()).toEqual([]);
  });
});
