// @vitest-environment happy-dom
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { click, flush, mount, part, press } from './mount';

const groupDialog = (main: HTMLElement): HTMLDialogElement => part(main, 'group-dialog') as HTMLDialogElement;
const fill = (main: HTMLElement, value: string): void => {
  const input = groupDialog(main).querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = (main: HTMLElement): void => {
  groupDialog(main).querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};
const groupNames = async (store: { load(): Promise<{ library: { groups: readonly { name: string }[] } }> }) =>
  (await store.load()).library.groups.map((group) => group.name);

describe('groups', () => {
  it('adds a group from the rail, shows it, and z takes it back', async () => {
    const { main, store } = await mount();
    const add = part(main, 'rail').querySelector<HTMLButtonElement>('.add') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    click(add);
    expect(groupDialog(main).open).toBe(true);
    expect(groupDialog(main).querySelector('[data-part="group-dialog-title"]')?.textContent).toBe('[ + ]New group');
    submit(main);
    expect(groupDialog(main).open).toBe(true);
    fill(main, '  Reading list  ');
    submit(main);
    await flush();
    expect(groupDialog(main).open).toBe(false);
    expect((await groupNames(store)).at(-1)).toBe('Reading list');
    expect(part(main, 'lens-name').textContent).toBe('Reading list');
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('added group: Reading list');
    press('z');
    await flush();
    expect(await groupNames(store)).toHaveLength(8);
  });

  it('renames the group in view from edit mode', async () => {
    const { main, store } = await mount();
    press('e');
    click(part(main, 'edit-note').querySelector('[data-group-act="rename"]'));
    expect(groupDialog(main).querySelector('[data-part="group-dialog-title"]')?.textContent).toBe(
      '[ ✎ ]Rename group · Development',
    );
    expect((groupDialog(main).querySelector('input') as HTMLInputElement).value).toBe('Development');
    fill(main, 'Code');
    submit(main);
    await flush();
    expect((await groupNames(store))[1]).toBe('Code');
    expect(part(main, 'lens-name').textContent).toBe('Code');
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('renamed: Development to Code');
  });

  it('deletes the group in view with an undo toast, and undo brings it and its sites back', async () => {
    const { main, store } = await mount();
    press('e');
    click(part(main, 'edit-note').querySelector('[data-group-act="delete"]'));
    await flush();
    expect(await groupNames(store)).not.toContain('Development');
    expect(part(main, 'lens-name').textContent).toBe('Qubernetic');
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('deleted group: Development · 29 sites');
    click(part(main, 'toast').querySelector('button'));
    await flush();
    expect((await groupNames(store))[1]).toBe('Development');
    expect((await store.load()).library.groups[1]?.sites).toHaveLength(29);
  });

  it('offers rename and delete on an empty group in edit mode, and closes the dialog with Cancel', async () => {
    const library = sampleLibrary();
    const { main, store } = await mount({ ...library, groups: [{ ...library.groups[0], sites: [] } as never] });
    expect(part(main, 'empty').querySelector('[data-group-act]')).toBeNull();
    press('e');
    click(part(main, 'empty').querySelector('[data-group-act="rename"]'));
    expect(groupDialog(main).open).toBe(true);
    click(groupDialog(main).querySelector('[data-part="group-dialog-cancel"]'));
    expect(groupDialog(main).open).toBe(false);
    click(part(main, 'empty').querySelector('[data-group-act="delete"]'));
    await flush();
    expect(await groupNames(store)).toEqual([]);
    expect(part(main, 'empty').querySelector('h2')?.textContent).toBe('No groups yet.');
  });

  it('adds the first group to an empty library', async () => {
    const { main, store } = await mount(emptyLibrary());
    click(part(main, 'rail').querySelector('.add'));
    fill(main, 'Start');
    submit(main);
    await flush();
    expect(await groupNames(store)).toEqual(['Start']);
    expect(part(main, 'lens-name').textContent).toBe('Start');
  });
});

describe('the icon mode of a group', () => {
  it('is set in the settings for the group in view, through the command', async () => {
    const { main, store } = await mount();
    click(part(main, 'settings'));
    const panel = part(main, 'settings-panel');
    expect(panel.querySelector('[data-part="icons-label"]')?.textContent).toBe('icons · Development');
    expect(panel.querySelector('[data-icon-mode="brand"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(panel.querySelector('[data-part="icons-hint"]')?.textContent).toBe(
      'Per group. Brand marks: 0 / 29, the rest show their Phosphor icon.',
    );
    click(panel.querySelector('[data-icon-mode="initial"]'));
    await flush();
    expect((await store.load()).library.groups[1]?.iconMode).toBe('initial');
    expect(part(main, 'grid').querySelector('.card .tile .initial')?.textContent).toBe('g');
    expect(panel.querySelector('[data-icon-mode="initial"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(panel.querySelector('[data-part="icons-hint"]')?.textContent).toBe('Per group. Every site shows its initial.');
    click(panel.querySelector('[data-icon-mode="phosphor"]'));
    await flush();
    expect(panel.querySelector('[data-part="icons-hint"]')?.textContent).toBe(
      'Per group. Every site shows its Phosphor icon.',
    );
    press('z');
    await flush();
    expect((await store.load()).library.groups[1]?.iconMode).toBe('initial');
  });
});
