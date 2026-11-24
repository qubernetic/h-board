// @vitest-environment happy-dom
import { emptyLibrary, readLibraryFile, sampleLibrary, writeLibraryFile } from '@h-board/core';
import type { Group, Library } from '@h-board/core';
import { describe, expect, it, vi } from 'vitest';
import { downloadFile, exportName } from '../src/files';
import { click, flush, mount, part } from './mount';

/** Hands `content` to the import's file field, as a pick in the browser's file dialog would. */
function pick(main: HTMLElement, content: string, name = 'h-board.json'): void {
  const input = part(main, 'import-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Waits until the file is read and the store has answered. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flush();
};

const toastText = (main: HTMLElement): string | null | undefined =>
  part(main, 'toast').querySelector('.msg')?.textContent;

describe('export in the settings', () => {
  it('saves the library as a readable JSON file named by the day', async () => {
    const save = vi.fn();
    const { main } = await mount(sampleLibrary(), { save });
    click(part(main, 'settings'));
    click(part(main, 'export'));
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    const [name, text] = save.mock.calls[0] as [string, string];
    expect(name).toBe('h-board-2026-11-23.json');
    const { library, problems } = readLibraryFile(text);
    expect(problems).toEqual([]);
    expect(library).toEqual(sampleLibrary());
    expect(toastText(main)).toBe('exported: h-board-2026-11-23.json');
  });

  it('names the file by the local day', () => {
    expect(exportName(new Date(2026, 0, 5, 23, 59))).toBe('h-board-2026-01-05.json');
  });

  it('downloads the file through a link to a blob when the host gives no other way', () => {
    const made = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:h-board');
    const freed = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let clicked: HTMLAnchorElement | undefined;
    const onClick = (event: Event): void => {
      clicked = event.target as HTMLAnchorElement;
      event.preventDefault();
    };
    document.addEventListener('click', onClick);
    vi.useFakeTimers();
    downloadFile(document, 'h-board.json', '{}');
    expect(freed).not.toHaveBeenCalled();
    vi.runAllTimers();
    vi.useRealTimers();
    document.removeEventListener('click', onClick);
    expect(made).toHaveBeenCalledTimes(1);
    expect(clicked?.download).toBe('h-board.json');
    expect(clicked?.href).toBe('blob:h-board');
    expect(clicked?.isConnected).toBe(false);
    expect(freed).toHaveBeenCalledWith('blob:h-board');
    made.mockRestore();
    freed.mockRestore();
  });
});

describe('import in the settings', () => {
  it('opens the file dialog from the Import button', async () => {
    const { main } = await mount();
    click(part(main, 'settings'));
    const input = part(main, 'import-file') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('application/json,.json');
    const opened = vi.fn();
    input.addEventListener('click', opened);
    click(part(main, 'import'));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('replaces the library with an exported file, says what came in, and undo takes it back', async () => {
    const { main, store } = await mount();
    const other: Library = { ...emptyLibrary(), groups: [sampleLibrary().groups[0] as Group] };
    click(part(main, 'settings'));
    pick(main, writeLibraryFile(other), 'backup.json');
    await settle();
    expect((await store.load()).library).toEqual(other);
    expect(part(main, 'settings-panel').hidden).toBe(true);
    expect(toastText(main)).toBe('imported: backup.json · 1 group · 9 sites');
    expect((await store.load()).history.snapshots).toHaveLength(2);
    click(part(main, 'toast').querySelector('button'));
    await settle();
    expect((await store.load()).library).toEqual(sampleLibrary());
  });

  it('shows a wrong file inline in the settings, one problem per line, and keeps the library', async () => {
    const { main, store } = await mount();
    click(part(main, 'settings'));
    pick(main, '{"app":"something else"}', 'notes.json');
    await settle();
    const error = part(main, 'import-error');
    expect(error.hidden).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe('notes.json cannot be imported:\napp: must be "h-board"\nschema: must be 1');
    expect((await store.load()).library).toEqual(sampleLibrary());
    expect(part(main, 'settings-panel').hidden).toBe(false);
    // the error stays while the page draws again, and goes when the settings close
    click(part(main, 'settings-panel').querySelector('[data-density="dense"]'));
    await flush();
    expect(part(main, 'import-error').textContent).toContain('app: must be "h-board"');
    click(part(main, 'settings'));
    click(part(main, 'settings'));
    expect(part(main, 'import-error').hidden).toBe(true);
  });

  it('names a file that is no JSON at all', async () => {
    const { main } = await mount();
    click(part(main, 'settings'));
    pick(main, 'not a backup', 'photo.png');
    await settle();
    expect(part(main, 'import-error').textContent).toMatch(/^photo\.png cannot be imported:\nfile: is not JSON/);
  });

  it('does nothing when the dialog closes without a file', async () => {
    const { main, store } = await mount();
    click(part(main, 'settings'));
    const input = part(main, 'import-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(part(main, 'import-error').hidden).toBe(true);
    expect((await store.load()).history.snapshots).toHaveLength(1);
  });
});

describe('the settings page', () => {
  it('opens with the settings shown when the host asks for it', async () => {
    const { main } = await mount(sampleLibrary(), { openSettings: true });
    expect(part(main, 'settings-panel').hidden).toBe(false);
    expect(part(main, 'settings').getAttribute('aria-expanded')).toBe('true');
  });
});
