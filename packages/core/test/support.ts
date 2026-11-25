import { CommandError, createCommands, emptyLibrary } from '../src/index';
import type { Library, Outcome, Site } from '../src/index';

const commands = createCommands();

/** Runs a command as the user. */
export function run(id: string, library: Library, params: unknown = {}): Outcome {
  return commands.run(id, library, params, { kind: 'user' });
}

/** The `CommandError` a command throws. */
export function errorOf(id: string, library: Library, params: unknown = {}): CommandError {
  try {
    run(id, library, params);
  } catch (error) {
    if (error instanceof CommandError) return error;
    throw error;
  }
  throw new Error(`${id} did not fail`);
}

export function site(id: string, name = id): Site {
  return { id, name, url: `https://${id}.example.com`, description: '', glyph: 'globe', brand: null, icon: null };
}

/** Two groups with two sites each, a todo, and the second group active. */
export const library: Library = {
  ...emptyLibrary(),
  groups: [
    { id: 'g1', name: 'Start', iconMode: 'brand', sites: [site('s1'), site('s2')] },
    { id: 'g2', name: 'Development', iconMode: 'phosphor', sites: [site('s3'), site('s4')] },
  ],
  todos: [{ id: 't1', text: 'Code review: PR #41', done: false }],
  settings: { ...emptyLibrary().settings, activeGroup: 'g2' },
};

export function groupIds(lib: Library): string[] {
  return lib.groups.map((group) => group.id);
}

export function siteIds(lib: Library): string[][] {
  return lib.groups.map((group) => group.sites.map((s) => s.id));
}
