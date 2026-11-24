import { describe, expect, it } from 'vitest';
import { CommandError, checkLibraryFile, createCommands, emptyLibrary } from '../src/index';
import type { Actor, Library } from '../src/index';

const user: Actor = { kind: 'user' };
const commands = createCommands();

const github = {
  id: 's1',
  name: 'github',
  url: 'https://github.com',
  description: 'Repos, pull requests and CI runs in one place.',
  glyph: 'github-logo',
  brand: 'github',
  icon: null,
};
const development = { id: 'g1', name: 'Development', iconMode: 'brand', sites: [github] } as const;
const media = { id: 'g2', name: 'Media', iconMode: 'initial', sites: [] } as const;
const todo = { id: 't1', text: 'Code review: PR #41', done: true };
const settings = { ...emptyLibrary().settings, theme: 'dark', activeGroup: 'g1' } as const;
const library: Library = { schema: 1, groups: [development, media], todos: [todo], settings };

function exported(lib: Library): string {
  return commands.run('library.export', lib, {}, user).value as string;
}

/** An exported file with some of its top-level fields replaced. */
function file(fields: object): string {
  return JSON.stringify({ app: 'h-board', ...library, ...fields });
}

function importError(text: string): CommandError {
  try {
    commands.run('library.import', emptyLibrary(), { text }, user);
  } catch (error) {
    if (error instanceof CommandError) return error;
    throw error;
  }
  throw new Error('the import did not fail');
}

describe('library.export and library.import', () => {
  it('writes a readable JSON file marked as H-Board', () => {
    const data = JSON.parse(exported(library)) as Record<string, unknown>;
    expect(data.app).toBe('h-board');
    expect(data.schema).toBe(1);
    expect(exported(library)).toContain('\n  "groups"');
  });

  it('leaves the library as it is on export', () => {
    expect(commands.run('library.export', library, {}, user).library).toBe(library);
  });

  it('reads back what it wrote', () => {
    const outcome = commands.run('library.import', emptyLibrary(), { text: exported(library) }, user);
    expect(outcome.library).toEqual(library);
    expect(outcome.value).toEqual({ groups: 2, sites: 1, todos: 1 });
  });

  it('drops fields it does not know', () => {
    const text = file({ extra: 'x', groups: [{ ...development, colour: 'red' }, media] });
    expect(commands.run('library.import', emptyLibrary(), { text }, user).library).toEqual(library);
  });

  it('refuses a file that is not JSON', () => {
    expect(importError('{"app": ').message).toMatch(/^file: is not JSON/);
  });

  it('refuses a file of another app', () => {
    const error = importError(file({ app: 'other' }));
    expect(error.code).toBe('invalid');
    expect(error.message).toBe('app: must be "h-board"');
  });

  it('refuses a newer schema', () => {
    expect(importError(file({ schema: 2 })).message).toBe('schema: must be 1');
  });

  it('names every field that is wrong, one problem per line', () => {
    const text = file({
      groups: [
        { ...development, sites: [{ ...github, name: '  ', url: 'javascript:alert(1)' }] },
        { ...media, iconMode: 'favicon' },
      ],
      todos: [{ ...todo, done: 'yes' }],
      settings: { ...settings, columns: 3 },
    });
    expect(importError(text).message.split('\n')).toEqual([
      'groups[0].sites[0].name: must not be empty',
      'groups[0].sites[0].url: must be an http or https address',
      'groups[1].iconMode: must be one of brand, phosphor, initial',
      'todos[0].done: must be true or false',
      'settings.columns: must be 0 or a whole number from 4 to 12',
    ]);
  });

  it('names a missing list and a wrong type', () => {
    const text = file({ groups: undefined, todos: 'none', settings: null });
    expect(importError(text).message.split('\n')).toEqual([
      'groups: must be a list',
      'todos: must be a list',
      'settings: must be an object',
    ]);
  });

  it('refuses ids used twice and an active group that is not there', () => {
    const text = file({
      groups: [development, { ...media, id: 'g1' }],
      todos: [{ ...todo, id: 's1' }],
      settings: { ...settings, activeGroup: 'g7' },
    });
    expect(importError(text).message.split('\n')).toEqual([
      'groups[1].id: g1 is used twice',
      'todos[0].id: s1 is used twice',
      'settings.activeGroup: no group g7',
    ]);
  });

  it('checks a file for the page without running a command', () => {
    expect(checkLibraryFile(exported(library))).toEqual([]);
    expect(checkLibraryFile('[]')).toEqual(['file: must be an object']);
  });

  it('wants the text of the file', () => {
    const error = (() => {
      try {
        commands.run('library.import', library, {}, user);
      } catch (e) {
        return e as CommandError;
      }
    })();
    expect(error?.message).toBe('text: must be text');
  });
});
