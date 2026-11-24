// @vitest-environment happy-dom
import { emptyLibrary, sampleLibrary } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { click, flush, mount, names, part, press } from './mount';

const dialogOf = (main: HTMLElement): HTMLDialogElement => part(main, 'site-dialog') as HTMLDialogElement;
const field = (main: HTMLElement, name: string): HTMLInputElement =>
  dialogOf(main).querySelector(`[name="${name}"]`) as HTMLInputElement;
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const choose = (main: HTMLElement, mode: string): void => {
  const radio = dialogOf(main).querySelector(`input[name="icon"][value="${mode}"]`) as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
};
const submit = (main: HTMLElement): void => {
  dialogOf(main).querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

describe('the site dialog', () => {
  it('opens from the new-site tile with the group in view, and adds a site through the command', async () => {
    const { main, store } = await mount();
    click(part(main, 'add-site'));
    const dialog = dialogOf(main);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[data-part="dialog-title"]')?.textContent).toBe('[ + ]New site · Development');
    expect(dialog.querySelector('[data-part="dialog-ok"]')?.textContent).toBe('Add');
    expect((dialog.querySelector('select') as HTMLSelectElement).value).toBe('1');
    expect(dialog.querySelector('select option')?.textContent).toBe('01  Start');
    type(field(main, 'url'), 'grafana.example.local');
    expect(field(main, 'name').value).toBe('grafana');
    type(dialog.querySelector('textarea') as HTMLTextAreaElement, '  Cameras and error rate.  ');
    submit(main);
    await flush();
    expect(dialog.open).toBe(false);
    expect(names(main).at(-1)).toBe('grafana');
    const site = (await store.load()).library.groups[1]?.sites.at(-1);
    expect(site).toMatchObject({
      name: 'grafana',
      url: 'https://grafana.example.local',
      description: 'Cameras and error rate.',
      glyph: 'globe',
      // grafana.example.local: the host names a bundled mark
      brand: 'grafana',
      icon: null,
    });
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('added: grafana');
    press('z');
    await flush();
    expect(names(main)).toHaveLength(29);
  });

  it('refuses an address that is not one, and keeps the dialog open', async () => {
    const { main } = await mount();
    click(part(main, 'add-site'));
    type(field(main, 'url'), 'not an address');
    submit(main);
    await flush();
    expect(dialogOf(main).open).toBe(true);
    expect(dialogOf(main).querySelector('[data-part="url-field"]')?.hasAttribute('data-bad')).toBe(true);
    expect(names(main)).toHaveLength(29);
    type(field(main, 'url'), 'example.com');
    expect(dialogOf(main).querySelector('[data-part="url-field"]')?.hasAttribute('data-bad')).toBe(false);
  });

  it('edits a site in edit mode, with its icon choice, and moves it to another group', async () => {
    const { main, store } = await mount();
    press('e');
    click(part(main, 'grid').querySelector('.card.ed [data-act="edit"]'));
    const dialog = dialogOf(main);
    expect(dialog.querySelector('[data-part="dialog-title"]')?.textContent).toBe('[ ✎ ]Edit site · Development');
    expect(dialog.querySelector('[data-part="dialog-ok"]')?.textContent).toBe('Save');
    expect(field(main, 'url').value).toBe('https://github.com');
    expect(field(main, 'name').value).toBe('github');
    expect((dialog.querySelector('input[name="icon"][value="brand"]') as HTMLInputElement).checked).toBe(true);
    // github.com has a bundled mark: the brand option shows it
    expect(dialog.querySelector('[data-part="preview-brand"] svg')).not.toBeNull();
    type(field(main, 'name'), 'GitHub');
    choose(main, 'phosphor');
    const picker = dialog.querySelector('[data-part="glyph-picker"]') as HTMLElement;
    expect(picker.hidden).toBe(false);
    type(picker.querySelector('input') as HTMLInputElement, 'rocket');
    click(picker.querySelector('button[data-name="rocket-launch"]'));
    expect(picker.querySelector('button[aria-pressed="true"]')?.getAttribute('data-name')).toBe('rocket-launch');
    (dialog.querySelector('select') as HTMLSelectElement).value = '2';
    submit(main);
    await flush();
    expect(names(main)).not.toContain('GitHub');
    const library = (await store.load()).library;
    expect(library.groups[2]?.sites.at(-1)).toMatchObject({
      name: 'GitHub',
      glyph: 'rocket-launch',
      brand: 'github',
      icon: 'phosphor',
    });
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('saved: GitHub → Qubernetic');
    press('z');
    await flush();
    expect(names(main)[0]).toBe('github');
  });

  it('picks a brand mark by name, and keeps the group icon mode by leaving the site on it', async () => {
    const { main, store } = await mount();
    click(part(main, 'add-site'));
    const dialog = dialogOf(main);
    type(field(main, 'url'), 'https://tube.example.com');
    expect(dialog.querySelector('[data-part="preview-brand"] svg')).toBeNull();
    const picker = dialog.querySelector('[data-part="brand-picker"]') as HTMLElement;
    expect(picker.hidden).toBe(false);
    type(picker.querySelector('input') as HTMLInputElement, 'you');
    expect([...picker.querySelectorAll('button')].map((b) => b.dataset['name'])).toEqual(['youtube', 'youtubemusic']);
    click(picker.querySelector('button[data-name="youtube"]'));
    type(picker.querySelector('input') as HTMLInputElement, 'zzz');
    expect(picker.querySelector('.none')?.textContent).toBe('no such mark');
    submit(main);
    await flush();
    expect((await store.load()).library.groups[1]?.sites.at(-1)).toMatchObject({ name: 'tube', brand: 'youtube', icon: null });
  });

  it('shows the initial, and closes with Cancel, the cross and Escape without a change', async () => {
    const { main, store } = await mount();
    click(part(main, 'add-site'));
    type(field(main, 'name'), 'Zebra');
    expect(dialogOf(main).querySelector('[data-part="preview-initial"]')?.textContent).toBe('z');
    choose(main, 'initial');
    expect((dialogOf(main).querySelector('[data-part="glyph-picker"]') as HTMLElement).hidden).toBe(true);
    click(dialogOf(main).querySelector('[data-part="dialog-cancel"]'));
    expect(dialogOf(main).open).toBe(false);
    click(part(main, 'add-site'));
    expect(field(main, 'name').value).toBe('');
    click(dialogOf(main).querySelector('[data-part="dialog-close"]'));
    expect(dialogOf(main).open).toBe(false);
    click(part(main, 'add-site'));
    press('e', {}, dialogOf(main));
    expect(part(main, 'page').dataset['editing']).toBeUndefined();
    expect((await store.load()).history.snapshots).toHaveLength(1);
  });

  it('opens from the empty group, and not at all without a group', async () => {
    const library = sampleLibrary();
    const { main } = await mount({ ...library, groups: [{ ...library.groups[0], sites: [] } as never] });
    click(part(main, 'empty').querySelector('.btn.primary'));
    expect(dialogOf(main).open).toBe(true);
    expect(dialogOf(main).querySelector('[data-part="dialog-title"]')?.textContent).toBe('[ + ]New site · Start');
    const none = await mount(emptyLibrary());
    expect((none.main.querySelector('.hb-empty .btn.primary') as HTMLButtonElement).disabled).toBe(true);
  });
});
