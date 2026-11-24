// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Toast } from '../src/toast';

describe('the toast', () => {
  it('does nothing when a toast without an action is clicked', () => {
    const toast = new Toast(document, window);
    toast.show('saved');
    toast.node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toast.node.dataset['on']).toBe('');
    toast.hide();
  });

  it('runs its action only from its button', () => {
    const toast = new Toast(document, window);
    let runs = 0;
    toast.show('deleted: github', { label: 'undo · z', run: () => (runs += 1) });
    toast.node.querySelector('.msg')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(runs).toBe(0);
    expect(toast.node.dataset['on']).toBe('');
    toast.node.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(runs).toBe(1);
    expect(toast.node.dataset['on']).toBeUndefined();
  });
});
