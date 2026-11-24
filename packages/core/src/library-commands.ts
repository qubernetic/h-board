import { Problems, id, index, name, oneOf, record, text } from './check';
import type { Fields } from './check';
import { CommandError, CommandRegistry } from './commands';
import type { Command } from './commands';
import { readLibraryFile, writeLibraryFile } from './library-file';
import { ICON_MODES, nextId } from './model';
import type { Group, IconMode, Library } from './model';

/** Checks the parameters of a command as an object, then lets `read` take its fields. */
function fieldsOf<P>(read: (fields: Fields, problems: Problems) => P): (params: unknown) => P {
  return (params) => {
    const problems = new Problems();
    const fields = record(params ?? {}, 'params', problems);
    problems.throwIfAny();
    const parsed = read(fields ?? {}, problems);
    problems.throwIfAny();
    return parsed;
  };
}

const none = fieldsOf(() => ({}));

/** Keeps a command's own types where it is written, and lets the registry hold it with the others. */
function define<P, R>(command: Command<P, R>): Command {
  return command as unknown as Command;
}

/** A place in a list: a whole number from 0; the command checks the upper end. */
function place(value: unknown, path: string, problems: Problems): number {
  return index(value, 0, Number.MAX_SAFE_INTEGER, path, problems);
}

/** A list with the item at `from` moved to `to`; `to` is checked against the list. */
function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const problems = new Problems();
  index(to, 0, items.length - 1, 'to', problems);
  problems.throwIfAny();
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** The index of a group, or a `CommandError` (`missing`). */
function groupIndex(library: Library, group: string): number {
  const i = library.groups.findIndex((g) => g.id === group);
  if (i < 0) throw new CommandError('missing', `group: no group ${group}`);
  return i;
}

function withGroup(library: Library, group: string, change: (g: Group) => Group): Library {
  const i = groupIndex(library, group);
  return { ...library, groups: library.groups.map((g, j) => (j === i ? change(g) : g)) };
}

const groupAdd = define<{ name: string; iconMode: IconMode }, string>({
  id: 'group.add',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    name: name(fields.name, 'name', problems),
    iconMode: fields.iconMode === undefined ? 'brand' : oneOf(fields.iconMode, ICON_MODES, 'iconMode', problems),
  })),
  run: (library, params) => {
    const group: Group = { id: nextId(library, 'g'), name: params.name, iconMode: params.iconMode, sites: [] };
    return { library: { ...library, groups: [...library.groups, group] }, value: group.id };
  },
});

const groupRename = define<{ group: string; name: string }, null>({
  id: 'group.rename',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    group: id(fields.group, 'group', problems),
    name: name(fields.name, 'name', problems),
  })),
  run: (library, params) => ({
    library: withGroup(library, params.group, (g) => ({ ...g, name: params.name })),
    value: null,
  }),
});

const groupSetIconMode = define<{ group: string; iconMode: IconMode }, null>({
  id: 'group.setIconMode',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    group: id(fields.group, 'group', problems),
    iconMode: oneOf(fields.iconMode, ICON_MODES, 'iconMode', problems),
  })),
  run: (library, params) => ({
    library: withGroup(library, params.group, (g) => ({ ...g, iconMode: params.iconMode })),
    value: null,
  }),
});

const groupMove = define<{ group: string; to: number }, null>({
  id: 'group.move',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    group: id(fields.group, 'group', problems),
    to: place(fields.to, 'to', problems),
  })),
  run: (library, params) => ({
    library: { ...library, groups: moved(library.groups, groupIndex(library, params.group), params.to) },
    value: null,
  }),
});

const groupRemove = define<{ group: string }, null>({
  id: 'group.remove',
  agentClass: 'owner',
  parse: fieldsOf((fields, problems) => ({ group: id(fields.group, 'group', problems) })),
  run: (library, params) => {
    const i = groupIndex(library, params.group);
    const groups = library.groups.filter((_, j) => j !== i);
    let activeGroup = library.settings.activeGroup;
    if (activeGroup === params.group) activeGroup = (groups[i] ?? groups[i - 1])?.id ?? null;
    return { library: { ...library, groups, settings: { ...library.settings, activeGroup } }, value: null };
  },
});

const libraryExport = define<object, string>({
  id: 'library.export',
  agentClass: 'safe',
  parse: none,
  run: (library) => ({ library, value: writeLibraryFile(library) }),
});

const libraryImport = define<{ text: string }, { groups: number; sites: number; todos: number }>({
  id: 'library.import',
  agentClass: 'owner',
  parse: fieldsOf((fields, problems) => ({ text: text(fields.text, 'text', problems) })),
  run: (_library, params) => {
    const { library, problems } = readLibraryFile(params.text);
    if (problems.length > 0) throw new CommandError('invalid', problems.join('\n'));
    const sites = library.groups.reduce((sum, group) => sum + group.sites.length, 0);
    return { library, value: { groups: library.groups.length, sites, todos: library.todos.length } };
  },
});

/** Every library command, in the order the documentation lists them. */
export const LIBRARY_COMMANDS: readonly Command[] = [
  groupAdd,
  groupRename,
  groupSetIconMode,
  groupMove,
  groupRemove,
  libraryExport,
  libraryImport,
];

/** A registry with every library command in it. */
export function createCommands(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const command of LIBRARY_COMMANDS) registry.register(command);
  return registry;
}
