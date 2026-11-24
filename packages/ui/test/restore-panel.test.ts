// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
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
