// @vitest-environment happy-dom
import { emptyHistory, emptyLibrary, record } from '@h-board/core';
import type { History } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { RestorePanel } from '../src/restore';
import { click, flush, mount, names, part, press } from './mount';

const rows = (main: HTMLElement): HTMLButtonElement[] => [
  ...part(main, 'restore-list').querySelectorAll<HTMLButtonElement>('button'),
];
const rowText = (row: HTMLElement | undefined): string[] =>
  [...(row?.querySelectorAll('span') ?? [])].map((span) => span.textContent ?? '');

/** Deletes the first site of the group in view in edit mode, and leaves edit mode. */
async function deleteFirst(main: HTMLElement): Promise<void> {
  press('e');
  click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
  await flush();
  press('Escape');
}

describe('the snapshot sign in the status bar', () => {
  it('says when the library was saved and how many snapshots are kept', async () => {
    const { main } = await mount();
    const sign = part(main, 'saved');
    expect(sign.textContent).toMatch(/^saved · \d\d:\d\d · 1 snapshot$/);
    expect(part(main, 'status-left').textContent).toBe('8 groups · 84 sites');
    await deleteFirst(main);
    expect(sign.textContent).toMatch(/^saved · \d\d:\d\d · 2 snapshots$/);
  });

  it('opens and closes the restore panel', async () => {
    const { main } = await mount();
    const sign = part(main, 'saved');
    const panel = part(main, 'restore');
    expect(panel.hidden).toBe(true);
    click(sign);
    expect(panel.hidden).toBe(false);
    expect(sign.getAttribute('aria-expanded')).toBe('true');
    click(sign);
    expect(panel.hidden).toBe(true);
    expect(sign.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the restore panel', () => {
  it('opens with v and lists the snapshots, newest first, with what changed and how many sites', async () => {
    const { main } = await mount();
    await deleteFirst(main);
    press('v');
    const panel = part(main, 'restore');
    expect(panel.hidden).toBe(false);
    expect(part(main, 'restore-title').textContent).toBe('Restore · 2 snapshots');
    const [newest, oldest] = rows(main);
    expect(rowText(newest)).toEqual([expect.stringMatching(/ \d\d:\d\d$/), '-github in Development', '83 sites']);
    expect(rowText(oldest)).toEqual([expect.stringMatching(/ \d\d:\d\d$/), 'starting point', '84 sites']);
    // the row in focus is the chosen one: the newest, which is the library as it is
    expect(main.ownerDocument.activeElement).toBe(newest);
    expect(newest?.getAttribute('aria-pressed')).toBe('true');
    expect(part(main, 'restore-preview').textContent).toBe('This is the library as it is now.');
    expect(part(main, 'restore-go')).toHaveProperty('disabled', true);
    press('Escape');
    expect(panel.hidden).toBe(true);
    press('v');
    expect(panel.hidden).toBe(false);
    press('v');
    expect(panel.hidden).toBe(true);
  });

  it('previews a snapshot, restores it, and undo takes the restore back', async () => {
    const { main, store } = await mount();
    await deleteFirst(main);
    press('v');
    const [newest, oldest] = rows(main);
    click(newest);
    expect(part(main, 'restore-preview').textContent).toBe('This is the library as it is now.');
    expect(part(main, 'restore-go')).toHaveProperty('disabled', true);
    click(oldest);
    expect(oldest?.getAttribute('aria-pressed')).toBe('true');
    expect(newest?.getAttribute('aria-pressed')).toBe('false');
    expect(part(main, 'restore-preview').textContent).toBe('If you restore it: +github in Development.');
    click(part(main, 'restore-go'));
    await flush();
    expect(part(main, 'restore').hidden).toBe(true);
    expect(names(main)).toHaveLength(29);
    expect(names(main)[0]).toBe('github');
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('restored: +github in Development');
    const { history } = await store.load();
    expect(history.snapshots[0]?.cause).toBe('restore');
    click(part(main, 'toast').querySelector('button'));
    await flush();
    expect(names(main)).toHaveLength(28);
  });

  it('walks the list with the arrows, the preview following, and restores the row in focus with Enter', async () => {
    const { main } = await mount();
    await deleteFirst(main);
    press('v');
    const [newest, oldest] = rows(main);
    press('ArrowDown', {}, newest);
    expect(main.ownerDocument.activeElement).toBe(oldest);
    // the arrows walk the list and leave the group in view alone
    expect(part(main, 'lens-name').textContent).toBe('Development');
    oldest?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(part(main, 'restore-preview').textContent).toBe('If you restore it: +github in Development.');
    press('ArrowDown', {}, oldest);
    expect(main.ownerDocument.activeElement).toBe(oldest);
    press('ArrowUp', {}, oldest);
    expect(main.ownerDocument.activeElement).toBe(newest);
    oldest?.focus();
    oldest?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    press('Enter', {}, oldest);
    await flush();
    expect(names(main)).toHaveLength(29);
  });

  it('closes on a click outside it, and keeps the chosen row when the library changes elsewhere', async () => {
    const { main, store } = await mount();
    await deleteFirst(main);
    press('v');
    rows(main)[1]?.focus();
    await store.apply('todo.add', { text: 'water the plants' }, { alone: true });
    await flush();
    expect(rows(main)).toHaveLength(3);
    expect(rows(main)[2]?.getAttribute('aria-pressed')).toBe('true');
    expect(part(main, 'restore-preview').textContent).toBe(
      'If you restore it: +github in Development, -todo water the plants.',
    );
    part(main, 'grid').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(part(main, 'restore').hidden).toBe(true);
  });

  it('opens from the settings, which close', async () => {
    const { main } = await mount();
    click(part(main, 'settings'));
    const entry = part(main, 'restore-open');
    expect(entry.textContent).toBe('Restore… (v)');
    click(entry);
    expect(part(main, 'settings-panel').hidden).toBe(true);
    expect(part(main, 'restore').hidden).toBe(false);
  });

  it('says when a snapshot is no longer kept', async () => {
    const { main, store } = await mount();
    await deleteFirst(main);
    press('v');
    click(rows(main)[1]);
    store.restore = () => Promise.reject(new Error('snapshot: no snapshot 1'));
    click(part(main, 'restore-go'));
    await flush();
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('not restored: snapshot: no snapshot 1');
  });
});

describe('the restore panel on its own', () => {
  const NOW = new Date(2026, 10, 23, 14, 32, 7);

  /** Two snapshots: the starting point and, newest, the library with one to-do more. */
  function twoSnapshots(): History {
    const library = emptyLibrary();
    const first = record(emptyHistory(), library, { source: { kind: 'user' }, at: NOW.getTime() - 60_000, alone: true });
    const todos = [{ id: 't1', text: 'water the plants', done: false }];
    return record(first, { ...library, todos }, { source: { kind: 'user' }, at: NOW.getTime(), alone: true });
  }

  function panel(history: History): { node: HTMLElement; restored: number[]; rows: HTMLButtonElement[] } {
    const restored: number[] = [];
    const restore = new RestorePanel(document, (id) => restored.push(id));
    document.body.append(restore.node);
    restore.show(history, NOW);
    return { node: restore.node, restored, rows: [...restore.node.querySelectorAll<HTMLButtonElement>('.list button')] };
  }

  it('opens without rows when no snapshot is kept, and restores nothing', () => {
    const { node, restored, rows } = panel(emptyHistory());
    const go = part(node, 'restore-go') as HTMLButtonElement;
    expect(node.hidden).toBe(false);
    expect(part(node, 'restore-title').textContent).toBe('Restore · 0 snapshots');
    expect(rows).toEqual([]);
    expect(go.disabled).toBe(true);
    expect(part(node, 'restore-preview').textContent).toBe('Choose a snapshot to see what a restore would change.');
    click(go);
    expect(restored).toEqual([]);
  });

  it('keeps the chosen row for a click, a focus or a key on the list beside its rows', () => {
    const { node, restored, rows } = panel(twoSnapshots());
    const list = part(node, 'restore-list');
    click(rows[1]);
    click(list);
    list.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    press('Enter', {}, list);
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(part(node, 'restore-preview').textContent).toBe('If you restore it: -todo water the plants.');
    expect(restored).toEqual([]);
  });

  it('takes no key on a row other than the arrows and Enter', () => {
    const { restored, rows } = panel(twoSnapshots());
    const [newest, oldest] = rows;
    click(oldest);
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    oldest?.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(newest);
    expect(oldest?.getAttribute('aria-pressed')).toBe('true');
    expect(restored).toEqual([]);
  });

  it('ignores an event that does not come from an element', () => {
    const { node, rows } = panel(twoSnapshots());
    const text = rows[1]?.querySelector('.l')?.firstChild as Text;
    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // the newest row has the focus, so it stays the chosen one
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(part(node, 'restore-preview').textContent).toBe('This is the library as it is now.');
  });

  it('restores the chosen snapshot with the Restore button, and not the library as it is', () => {
    const { node, restored, rows } = panel(twoSnapshots());
    const [newest, oldest] = rows;
    press('Enter', {}, newest);
    expect(restored).toEqual([]);
    click(oldest);
    expect(part(node, 'restore-preview').textContent).toBe('If you restore it: -todo water the plants.');
    click(part(node, 'restore-go'));
    expect(restored).toEqual([Number(oldest?.dataset['id'])]);
  });
});
