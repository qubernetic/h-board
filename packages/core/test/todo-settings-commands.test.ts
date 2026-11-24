import { describe, expect, it } from 'vitest';
import { errorOf, library, run } from './support';

describe('todo.add', () => {
  it('appends a todo that is not done', () => {
    const outcome = run('todo.add', library, { text: ' Client: review the quote ' });
    expect(outcome.value).toBe('t2');
    expect(outcome.library.todos[1]).toEqual({ id: 't2', text: 'Client: review the quote', done: false });
  });

  it('wants text', () => {
    expect(errorOf('todo.add', library, { text: '' }).message).toBe('text: must not be empty');
  });
});

describe('todo.toggle', () => {
  it('turns a todo done and back', () => {
    const done = run('todo.toggle', library, { todo: 't1' });
    expect(done.value).toBe(true);
    expect(run('todo.toggle', done.library, { todo: 't1' }).library.todos[0]?.done).toBe(false);
  });

  it('sets a todo to what it gets', () => {
    expect(run('todo.toggle', library, { todo: 't1', done: false }).library.todos[0]?.done).toBe(false);
  });

  it('names a todo that is not there', () => {
    expect(errorOf('todo.toggle', library, { todo: 't9' }).message).toBe('todo: no todo t9');
  });
});

describe('todo.remove', () => {
  it('removes a todo', () => {
    expect(run('todo.remove', library, { todo: 't1' }).library.todos).toEqual([]);
  });

  it('names a todo that is not there', () => {
    expect(errorOf('todo.remove', library, { todo: 't9' }).code).toBe('missing');
  });
});

describe('settings.set', () => {
  it('changes only the settings it gets', () => {
    const outcome = run('settings.set', library, { theme: 'light', columns: 6, motion: 'none', activeGroup: 'g1' });
    expect(outcome.library.settings).toEqual({
      ...library.settings,
      theme: 'light',
      columns: 6,
      motion: 'none',
      activeGroup: 'g1',
    });
  });

  it('opens on the first group again with null', () => {
    expect(run('settings.set', library, { activeGroup: null }).library.settings.activeGroup).toBeNull();
  });

  it('names every wrong setting and every unknown one', () => {
    expect(
      errorOf('settings.set', library, { density: 'roomy', columns: 13, engine: 'bing', wallpaper: 'x' }).message,
    ).toBe(
      [
        'density: must be one of dense, normal, spacious',
        'columns: must be 0 or a whole number from 4 to 12',
        'engine: must be one of ddg, google, startpage',
        'wallpaper: is not a setting',
      ].join('\n'),
    );
  });

  it('wants at least one setting', () => {
    expect(errorOf('settings.set', library, {}).message).toBe(
      'settings.set: give at least one of theme, density, columns, layout, engine, motion, activeGroup',
    );
  });

  it('names a group that is not there', () => {
    expect(errorOf('settings.set', library, { activeGroup: 'g9' }).message).toBe('activeGroup: no group g9');
  });
});
