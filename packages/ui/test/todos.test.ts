// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { click, flush, mount, part, press } from './mount';

const items = (main: HTMLElement): string[] =>
  [...part(main, 'todo').querySelectorAll('li')].map((li) => `${li.hasAttribute('data-done') ? 'x' : 'o'} ${li.textContent}`);
const newTodo = (main: HTMLElement): HTMLInputElement => part(main, 'todo-new') as HTMLInputElement;
const add = (main: HTMLElement, text: string): void => {
  newTodo(main).value = text;
  newTodo(main).form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

describe('the to-do list', () => {
  it('ticks a to-do and back through the command, with a checkbox per item', async () => {
    const { main, store } = await mount();
    const check = part(main, 'todo').querySelector<HTMLElement>('li .check') as HTMLElement;
    expect(check.getAttribute('role')).toBe('checkbox');
    expect(check.getAttribute('aria-checked')).toBe('false');
    expect(check.getAttribute('aria-label')).toBe('Client: review the quote');
    click(check);
    await flush();
    expect(items(main)[0]).toBe('x Client: review the quote');
    expect(part(main, 'todo-head').textContent).toBe('[ ✓ ]To do · 2 / 3');
    expect((await store.load()).library.todos[0]?.done).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Client: review the quote');
    press('z');
    await flush();
    expect(items(main)[0]).toBe('o Client: review the quote');
  });

  it('adds a to-do from the field under the list, keeps the focus there, and skips an empty one', async () => {
    const { main, store } = await mount();
    expect(newTodo(main).placeholder).toBe('+ new to-do');
    newTodo(main).focus();
    add(main, '  water the plants ');
    await flush();
    expect(items(main).at(-1)).toBe('o water the plants');
    expect(newTodo(main).value).toBe('');
    expect(document.activeElement).toBe(newTodo(main));
    add(main, '   ');
    await flush();
    expect((await store.load()).library.todos).toHaveLength(4);
    press('Escape', {}, newTodo(main));
    expect(document.activeElement).not.toBe(newTodo(main));
  });

  it('deletes a to-do with an undo toast', async () => {
    const { main } = await mount();
    const remove = part(main, 'todo').querySelectorAll('li .del')[1] as HTMLElement;
    expect(remove.getAttribute('aria-label')).toBe('Delete: Code review: PR #41');
    click(remove);
    await flush();
    expect(items(main)).toEqual(['o Client: review the quote', 'x Brand repo v2.3 tag']);
    expect(part(main, 'toast').querySelector('.msg')?.textContent).toBe('deleted: Code review: PR #41');
    click(part(main, 'toast').querySelector('button'));
    await flush();
    expect(items(main)[1]).toBe('o Code review: PR #41');
  });

  it('leaves the page keys alone while typing a to-do', async () => {
    const { main } = await mount();
    press('e', {}, newTodo(main));
    expect(part(main, 'page').dataset['editing']).toBeUndefined();
  });
});
