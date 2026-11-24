// @vitest-environment happy-dom
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import type { Library } from '@h-board/core';
import { MemoryStore } from '@h-board/store';
import { afterEach, describe, expect, it } from 'vitest';
import { mountBoard } from '../src/index';
import type { BoardOptions } from '../src/index';

const NOW = new Date(2026, 10, 23, 14, 32, 7);
let stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.body.replaceChildren();
});

async function mount(
  library: Library = sampleLibrary(),
  options: BoardOptions = {},
): Promise<{ main: HTMLElement; store: MemoryStore }> {
  const main = document.createElement('main');
  document.body.append(main);
  const store = new MemoryStore({ initial: () => library });
  stops.push(await mountBoard(main, store, { now: () => NOW, viewport: () => ({ w: 1440, h: 900 }), ...options }));
  return { main, store };
}

const text = (root: ParentNode, selector: string): string | null | undefined =>
  root.querySelector(selector)?.textContent;
const part = (root: ParentNode, name: string): HTMLElement => {
  const node = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!node) throw new Error(`no ${name}`);
  return node;
};
const press = (key: string, init: KeyboardEventInit = {}): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
};
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the start page', () => {
  it('shows the active group of the library in the lens and its sites as cards', async () => {
    const { main } = await mount();
    expect(text(main, '[data-part="lens-name"]')).toBe('Development');
    expect(text(main, '[data-part="lens-tag"]')).toBe('[ 02 ]');
    expect(text(main, '[data-part="lens-count"]')).toBe('29 sites');
    expect(text(main, '[data-part="rail-head"]')).toBe('Groups · 8');
    const cards = main.querySelectorAll<HTMLAnchorElement>('[data-part="grid"] a.card');
    expect(cards).toHaveLength(29);
    expect(cards[0]?.getAttribute('href')).toBe('https://github.com');
    expect(text(cards[0] as HTMLElement, '.name')).toBe('github');
    expect(text(cards[0] as HTMLElement, '.host')).toBe('github.com');
    expect(text(cards[0] as HTMLElement, '.desc')).toBe('Repos, pull requests and CI runs in one place.');
    expect(main.querySelector('[data-part="add-site"]')).not.toBeNull();
    expect(text(main, '[data-part="section"]')).toBe('[ 02 ]Development · 29 sites');
    expect(text(main, '[data-part="status-left"]')).toBe('8 groups · 84 sites');
    expect(text(main, '[data-part="keys"]')).toContain('1–8: jump');
    expect(main.querySelector('h1')?.textContent).toBe('H-Board');
  });

  it('places the grid by the layout rules', async () => {
    const { main } = await mount();
    const grid = part(main, 'grid');
    expect([grid.style.left, grid.style.top, grid.style.width, grid.style.height]).toEqual([
      '328px',
      '344px',
      '1064px',
      '504px',
    ]);
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, 200px)');
    expect(part(main, 'rail').style.width).toBe('280px');
    expect(text(main, '[data-part="more"]')).toBe('↓ 15 more');
  });

  it('shows the date, the time and the to-dos', async () => {
    const { main } = await mount();
    expect(text(main, '[data-part="date"]')).toBe('Monday · 23 November 2026 · week 48');
    expect(text(main, '[data-part="time"]')).toBe('14:32');
    expect(text(main, '[data-part="seconds"]')).toBe(':07');
    expect(text(main, '[data-part="todo-head"]')).toBe('[ ✓ ]To do · 1 / 3');
    const todos = main.querySelectorAll('[data-part="todo"] li');
    expect([...todos].map((item) => [item.textContent, item.hasAttribute('data-done')])).toEqual([
      ['Client: review the quote', false],
      ['Code review: PR #41', false],
      ['Brand repo v2.3 tag', true],
    ]);
  });

  it('treats a site name as text and drops an address that is not http or https', async () => {
    const site = { description: '<b>bold</b>', glyph: 'globe', brand: null, icon: null };
    const { main } = await mount({
      ...emptyLibrary(),
      groups: [
        {
          id: 'g1',
          name: '<i>Work</i>',
          iconMode: 'initial',
          sites: [
            { ...site, id: 's1', name: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' },
            { ...site, id: 's2', name: 'Broken', url: 'not an address' },
          ],
        },
      ],
    });
    expect([...main.querySelectorAll('img')].map((img) => img.alt)).toEqual(['Qubernetic']);
    expect(main.querySelector('b, i')).toBeNull();
    const cards = main.querySelectorAll('[data-part="grid"] .card:not([data-part="add-site"])');
    expect(cards[0]?.querySelector('.name')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(cards[0]?.hasAttribute('href')).toBe(false);
    expect(cards[1]?.hasAttribute('href')).toBe(false);
    expect(cards[0]?.querySelector('.host')?.textContent).toBe('javascript:alert(1)');
    // the initial icon mode draws the name's first letter
    expect(cards[1]?.querySelector('.tile')?.textContent).toBe('b');
    expect(text(main, '[data-part="lens-name"]')).toBe('<i>Work</i>');
  });

  it('switches groups with the number keys and the arrows, round the list', async () => {
    const { main } = await mount();
    press('3');
    expect(text(main, '[data-part="lens-name"]')).toBe('Qubernetic');
    expect(main.querySelectorAll('[data-part="grid"] a.card')).toHaveLength(7);
    press('ArrowDown');
    expect(text(main, '[data-part="lens-name"]')).toBe('Automation');
    press('1');
    press('ArrowUp');
    expect(text(main, '[data-part="lens-name"]')).toBe('Tools');
    press('ArrowDown');
    expect(text(main, '[data-part="lens-name"]')).toBe('Start');
    press('2', { ctrlKey: true });
    expect(text(main, '[data-part="lens-name"]')).toBe('Start');
  });

  it('leaves the keys alone while the user types', async () => {
    const { main } = await mount();
    const input = main.querySelector('input');
    input?.focus();
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(text(main, '[data-part="lens-name"]')).toBe('Development');
  });

  it('switches groups with the mouse wheel outside the grid', async () => {
    const { main } = await mount();
    const rail = part(main, 'rail');
    rail.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(text(main, '[data-part="lens-name"]')).toBe('Qubernetic');
    rail.dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, bubbles: true, cancelable: true }));
    expect(text(main, '[data-part="lens-name"]')).toBe('Development');
    // a touchpad's small steps add up
    for (let i = 0; i < 4; i++) rail.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, bubbles: true }));
    expect(text(main, '[data-part="lens-name"]')).toBe('Qubernetic');
    rail.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 0, bubbles: true }));
    part(main, 'grid').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(text(main, '[data-part="lens-name"]')).toBe('Qubernetic');
  });

  it('jumps to a group from the drum and from the ruler', async () => {
    const { main } = await mount();
    main.querySelector<HTMLButtonElement>('.drum-row[data-index="0"]')?.click();
    expect(text(main, '[data-part="lens-name"]')).toBe('Start');
    main.querySelector<HTMLButtonElement>('.ruler-mark[data-index="6"]')?.click();
    expect(text(main, '[data-part="lens-name"]')).toBe('Reading');
    expect(main.querySelector('.ruler-mark[data-index="6"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('shows the empty group with its own message', async () => {
    const { main } = await mount();
    press('5');
    expect(text(main, '[data-part="lens-name"]')).toBe('Media');
    expect(part(main, 'empty').hidden).toBe(false);
    expect(text(main, '[data-part="empty"] h2')).toBe('This group is still empty.');
    expect(part(main, 'grid').hidden).toBe(true);
    expect(part(main, 'section-row').hidden).toBe(true);
  });

  it('says so when there are no groups at all', async () => {
    const { main } = await mount(emptyLibrary());
    expect(text(main, '[data-part="lens-name"]')).toBe('');
    expect(text(main, '[data-part="empty"] h2')).toBe('No groups yet.');
    expect(text(main, '[data-part="status-left"]')).toBe('0 groups · 0 sites');
  });

  it('switches the theme through the settings command', async () => {
    const { main, store } = await mount(sampleLibrary(), { systemDark: () => true });
    const button = part(main, 'theme');
    expect(button.textContent).toContain('Light');
    expect(part(main, 'page').dataset['theme']).toBe('dark');
    button.click();
    await flush();
    expect((await store.load()).library.settings.theme).toBe('light');
    expect(part(main, 'page').dataset['theme']).toBe('light');
    expect(button.textContent).toContain('Dark');
  });

  it('follows the system theme until the user picks one', async () => {
    const { main } = await mount(sampleLibrary(), { systemDark: () => false });
    expect(part(main, 'page').dataset['theme']).toBe('light');
    expect(main.querySelector<HTMLImageElement>('[data-part="logo"] img')?.dataset['theme']).toBe('light');
  });

  it('changes the density and the card layout through the settings command', async () => {
    const { main, store } = await mount();
    press(']');
    await flush();
    expect((await store.load()).library.settings.density).toBe('spacious');
    expect(text(main, '[data-part="density"]')).toBe('density: spacious');
    expect(part(main, 'grid').style.gridTemplateColumns).toBe('repeat(4, 248px)');
    press(']');
    await flush();
    expect((await store.load()).library.settings.density).toBe('dense');
    part(main, 'density').click();
    await flush();
    expect((await store.load()).library.settings.density).toBe('normal');
    main.querySelector<HTMLButtonElement>('[data-layout="compact"]')?.click();
    await flush();
    expect((await store.load()).library.settings.layout).toBe('compact');
    expect(part(main, 'grid').dataset['layout']).toBe('compact');
    expect(main.querySelector('[data-layout="compact"]')?.getAttribute('aria-pressed')).toBe('true');
    main.querySelector<HTMLButtonElement>('[data-layout="simple"]')?.click();
    await flush();
    expect(part(main, 'grid').dataset['layout']).toBe('simple');
  });

  it('opens the settings with the density, the column count and the theme', async () => {
    const { main, store } = await mount();
    const button = part(main, 'settings');
    const panel = part(main, 'settings-panel');
    expect(panel.hidden).toBe(true);
    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    panel.querySelector<HTMLButtonElement>('[data-density="dense"]')?.click();
    await flush();
    expect((await store.load()).library.settings.density).toBe('dense');
    panel.querySelector<HTMLButtonElement>('[data-part="columns-up"]')?.click();
    await flush();
    expect((await store.load()).library.settings.columns).toBe(4);
    expect(text(panel, '[data-part="columns"]')).toBe('4');
    panel.querySelector<HTMLButtonElement>('[data-part="columns-down"]')?.click();
    await flush();
    expect((await store.load()).library.settings.columns).toBe(0);
    expect(text(panel, '[data-part="columns"]')).toBe('auto · 6');
    panel.querySelector<HTMLButtonElement>('[data-part="theme-system"]')?.click();
    await flush();
    expect((await store.load()).library.settings.theme).toBe('system');
    press('Escape');
    expect(panel.hidden).toBe(true);
  });

  it('follows a change made elsewhere and keeps the group in view', async () => {
    const { main, store } = await mount();
    press('3');
    await store.apply('group.rename', { group: 'g3', name: 'Company' });
    expect(text(main, '[data-part="lens-name"]')).toBe('Company');
    await store.apply('group.remove', { group: 'g3' });
    expect(text(main, '[data-part="lens-name"]')).toBe('Automation');
  });

  it('stops following the store and the keys when unmounted', async () => {
    const { main, store } = await mount();
    const stop = stops.pop();
    stop?.();
    press('3');
    await store.apply('group.rename', { group: 'g2', name: 'Dev' });
    expect(text(main, '[data-part="lens-name"]')).toBe('Development');
  });

  it('draws three densities and the tall spacious card', async () => {
    for (const [density, h, size] of [
      ['dense', 900, 'dense'],
      ['spacious', 900, 'compact'],
      ['spacious', 1360, 'large'],
    ] as const) {
      const library = sampleLibrary();
      const { main } = await mount(
        { ...library, settings: { ...library.settings, density } },
        { viewport: () => ({ w: 2560, h }) },
      );
      expect(part(main, 'grid').dataset['size']).toBe(size);
      main.remove();
    }
  });
});
