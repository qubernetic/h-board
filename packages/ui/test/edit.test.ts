// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { click, flush, mount, names, part, press } from './mount';

describe('edit mode', () => {
  it('turns on and off with e and Escape, and turns the cards into editable ones', async () => {
    const { main } = await mount();
    const grid = part(main, 'grid');
    expect(grid.querySelectorAll('a.card')).toHaveLength(29);
    press('e');
    expect(part(main, 'page').dataset['editing']).toBe('');
    expect(grid.querySelectorAll('a.card')).toHaveLength(0);
    const cards = grid.querySelectorAll<HTMLElement>('.card.ed');
    expect(cards).toHaveLength(29);
    expect(cards[0]?.draggable).toBe(true);
    expect(cards[0]?.getAttribute('aria-label')).toBe('github');
    expect(cards[0]?.querySelector('[data-act="edit"]')?.getAttribute('aria-label')).toBe('Edit: github');
    expect(cards[0]?.querySelector('[data-act="delete"]')?.getAttribute('aria-label')).toBe('Delete: github');
    expect(part(main, 'edit-note').hidden).toBe(false);
    press('Escape');
    expect(part(main, 'page').dataset['editing']).toBeUndefined();
    expect(grid.querySelectorAll('a.card')).toHaveLength(29);
    press('e');
    press('e');
    expect(part(main, 'edit-note').hidden).toBe(true);
  });

  it('deletes a site through the command, says so in a toast, and z brings it back', async () => {
    const { main, store } = await mount();
    press('e');
    click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
    await flush();
    expect(names(main)).not.toContain('github');
    expect(names(main)).toHaveLength(28);
    const toast = part(main, 'toast');
    expect(toast.dataset['on']).toBe('');
    expect(toast.querySelector('.msg')?.textContent).toBe('deleted: github');
    expect(toast.querySelector('button')?.textContent).toBe('undo · z');
    const before = (await store.load()).history.snapshots.length;
    press('z');
    await flush();
    expect(names(main)[0]).toBe('github');
    expect(names(main)).toHaveLength(29);
    expect(toast.querySelector('.msg')?.textContent).toBe('undone: +github in Development');
    expect((await store.load()).history.snapshots.length).toBe(before + 1);
  });

  it('undoes with Ctrl+Z and with the button in the toast', async () => {
    const { main } = await mount();
    press('e');
    click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
    await flush();
    press('z', { ctrlKey: true });
    await flush();
    expect(names(main)).toHaveLength(29);
    click(part(main, 'grid').querySelectorAll('.card.ed [data-act="delete"]')[1]);
    await flush();
    expect(names(main)).not.toContain('claude');
    click(part(main, 'toast').querySelector('button'));
    await flush();
    expect(names(main)[1]).toBe('claude');
  });

  it('says when there is nothing to undo, and leaves z alone while typing', async () => {
    const { main } = await mount();
    press('z');
    await flush();
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('nothing to undo');
    expect(part(main, 'toast').querySelector('button')).toBeNull();
    const input = main.querySelector('input') as HTMLInputElement;
    press('e', {}, input);
    expect(part(main, 'page').dataset['editing']).toBeUndefined();
  });

  it('hides the toast after six seconds with an action, and sooner without', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { main } = await mount();
      press('e');
      click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
      await vi.advanceTimersByTimeAsync(10);
      const toast = part(main, 'toast');
      expect(toast.dataset['on']).toBe('');
      await vi.advanceTimersByTimeAsync(5900);
      expect(toast.dataset['on']).toBe('');
      await vi.advanceTimersByTimeAsync(200);
      expect(toast.dataset['on']).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('names e and z in the status bar', async () => {
    const { main } = await mount();
    expect(part(main, 'keys').textContent).toContain('e: edit');
    expect(part(main, 'keys').textContent).toContain('z: undo');
  });
});

const drag = (type: string, target: Element, clientX = 0): void => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY: 0, dataTransfer: null });
  target.dispatchEvent(event);
};

describe('moving sites', () => {
  it('moves a card with Shift and the arrow keys, and keeps the focus on it', async () => {
    const { main } = await mount();
    press('e');
    const first = part(main, 'grid').querySelector<HTMLElement>('.card.ed') as HTMLElement;
    first.focus();
    press('ArrowRight', { shiftKey: true }, first);
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['claude', 'github', 'copia']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('github');
    press('ArrowDown', { shiftKey: true }, document.activeElement as HTMLElement);
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['claude', 'copia', 'github']);
    expect(part(main, 'lens-name').textContent).toBe('Development');
    press('ArrowLeft', { shiftKey: true }, document.activeElement as HTMLElement);
    press('ArrowUp', { shiftKey: true }, document.activeElement as HTMLElement);
    await flush();
    press('ArrowUp', { shiftKey: true }, document.activeElement as HTMLElement);
    press('ArrowLeft', {}, document.activeElement as HTMLElement);
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['github', 'claude', 'copia']);
  });

  it('takes back a move apart from the delete just before it', async () => {
    const { main } = await mount();
    press('e');
    click(part(main, 'grid').querySelector('.card.ed [data-act="delete"]'));
    await flush();
    const first = part(main, 'grid').querySelector<HTMLElement>('.card.ed') as HTMLElement;
    first.focus();
    press('ArrowRight', { shiftKey: true }, first);
    await flush();
    expect(names(main).slice(0, 2)).toEqual(['copia', 'claude']);
    press('z');
    await flush();
    expect(names(main).slice(0, 2)).toEqual(['claude', 'copia']);
    expect(names(main)).not.toContain('github');
    press('z');
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['github', 'claude', 'copia']);
  });

  it('takes back a quick run of moves in one step', async () => {
    const { main } = await mount();
    press('e');
    const first = part(main, 'grid').querySelector<HTMLElement>('.card.ed') as HTMLElement;
    first.focus();
    press('ArrowRight', { shiftKey: true }, first);
    await flush();
    press('ArrowRight', { shiftKey: true }, document.activeElement as HTMLElement);
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['claude', 'copia', 'github']);
    press('z');
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['github', 'claude', 'copia']);
  });

  it('moves a card by dragging it onto another, before or after it', async () => {
    const { main, store } = await mount();
    press('e');
    const cards = (): HTMLElement[] => [...part(main, 'grid').querySelectorAll<HTMLElement>('.card.ed')];
    drag('dragstart', cards()[0] as HTMLElement);
    drag('dragover', cards()[2] as HTMLElement, 10);
    expect(cards()[2]?.classList.contains('drop-after')).toBe(true);
    drag('dragover', cards()[0] as HTMLElement, 10);
    expect(main.querySelectorAll('.drop-after, .drop-before')).toHaveLength(0);
    drag('drop', cards()[2] as HTMLElement, 10);
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['claude', 'copia', 'github']);
    drag('dragend', cards()[0] as HTMLElement);
    drag('dragstart', cards()[2] as HTMLElement);
    drag('dragover', cards()[0] as HTMLElement, -10);
    expect(cards()[0]?.classList.contains('drop-before')).toBe(true);
    drag('drop', cards()[0] as HTMLElement, -10);
    await flush();
    expect(names(main).slice(0, 3)).toEqual(['github', 'claude', 'copia']);
    drag('dragend', cards()[0] as HTMLElement);
    expect(main.querySelectorAll('.dragging, .drop-before, .drop-after')).toHaveLength(0);
    const kept = (await store.load()).library.groups[1]?.sites.map((site) => site.name).slice(0, 3);
    expect(kept).toEqual(['github', 'claude', 'copia']);
  });

  it('ignores a drag outside edit mode and a drop where nothing was dragged', async () => {
    const { main } = await mount();
    drag('dragstart', part(main, 'grid').querySelector('.card') as HTMLElement);
    press('e');
    const card = part(main, 'grid').querySelectorAll('.card.ed')[3] as HTMLElement;
    drag('dragover', card, 10);
    drag('drop', card, 10);
    await flush();
    expect(names(main).slice(0, 2)).toEqual(['github', 'claude']);
  });
});
