import { Problems, SETTING_KEYS, SETTING_READERS, address, flag, id, index, name, oneOf, record, slug, text } from './check';
import type { Fields } from './check';
import { CommandError, CommandRegistry } from './commands';
import type { Command } from './commands';
import { readLibraryFile, writeLibraryFile } from './library-file';
import { ICON_MODES, nextId } from './model';
import type { Group, IconMode, Library, Settings, Site, Todo } from './model';

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

/** Throws a `CommandError` (`invalid`) unless `to` is from 0 to `last`. */
function checkPlace(to: number, last: number, field: string): void {
  const problems = new Problems();
  index(to, 0, last, field, problems);
  problems.throwIfAny();
}

/** A list with the item at `from` moved to `to`; `to` is checked against the list. */
function moved<T>(items: readonly T[], from: number, to: number): T[] {
  checkPlace(to, items.length - 1, 'to');
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

function inserted<T>(items: readonly T[], item: T, at: number): T[] {
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** A field that may be left out: `fallback` then, otherwise what `read` makes of it. */
function optional<T>(value: unknown, fallback: T, read: (value: unknown) => T): T {
  return value === undefined ? fallback : read(value);
}

function siteIcon(value: unknown, path: string, problems: Problems): IconMode | null {
  return value === null ? null : oneOf(value, ICON_MODES, path, problems);
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

/** Where a site is: the index of its group and its index there, or a `CommandError` (`missing`). */
function siteAt(library: Library, site: string): { group: number; site: number } {
  for (const [g, group] of library.groups.entries()) {
    const s = group.sites.findIndex((x) => x.id === site);
    if (s >= 0) return { group: g, site: s };
  }
  throw new CommandError('missing', `site: no site ${site}`);
}

function withSites(library: Library, g: number, change: (sites: readonly Site[]) => readonly Site[]): Library {
  return {
    ...library,
    groups: library.groups.map((group, j) => (j === g ? { ...group, sites: change(group.sites) } : group)),
  };
}

type SiteFields = Omit<Site, 'id'>;
const SITE_FIELDS = ['name', 'url', 'description', 'glyph', 'brand', 'icon'] as const;

/** Reads the site fields that are there; `name` and `url` are the ones a new site cannot do without. */
function siteFields(fields: Fields, problems: Problems): Partial<SiteFields> {
  const readers: { [K in keyof SiteFields]: (value: unknown, path: string, problems: Problems) => SiteFields[K] } = {
    name,
    url: address,
    description: text,
    glyph: name,
    brand: slug,
    icon: siteIcon,
  };
  const read: Partial<Record<keyof SiteFields, unknown>> = {};
  for (const key of SITE_FIELDS) {
    if (fields[key] !== undefined) read[key] = readers[key](fields[key], key, problems);
  }
  return read as Partial<SiteFields>;
}

const siteAdd = define<{ group: string; at: number | null } & SiteFields, string>({
  id: 'site.add',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    group: id(fields.group, 'group', problems),
    name: fields.name === undefined ? name(undefined, 'name', problems) : '',
    url: fields.url === undefined ? address(undefined, 'url', problems) : '',
    description: '',
    glyph: 'globe',
    brand: null,
    icon: null,
    ...siteFields(fields, problems),
    at: optional(fields.at, null, (value) => place(value, 'at', problems)),
  })),
  run: (library, { group, at, ...fields }) => {
    const g = groupIndex(library, group);
    const sites = library.groups[g]?.sites ?? [];
    const to = at ?? sites.length;
    checkPlace(to, sites.length, 'at');
    const site: Site = { id: nextId(library, 's'), ...fields };
    return { library: withSites(library, g, (list) => inserted(list, site, to)), value: site.id };
  },
});

const siteUpdate = define<{ site: string } & Partial<SiteFields>, null>({
  id: 'site.update',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => {
    const change = siteFields(fields, problems);
    if (Object.keys(change).length === 0) problems.add('site.update', `give at least one of ${SITE_FIELDS.join(', ')}`);
    return { site: id(fields.site, 'site', problems), ...change };
  }),
  run: (library, { site, ...change }) => {
    const at = siteAt(library, site);
    return {
      library: withSites(library, at.group, (sites) => sites.map((x, j) => (j === at.site ? { ...x, ...change } : x))),
      value: null,
    };
  },
});

const siteMove = define<{ site: string; group: string | null; to: number }, null>({
  id: 'site.move',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    site: id(fields.site, 'site', problems),
    group: optional(fields.group, null, (value) => id(value, 'group', problems)),
    to: place(fields.to, 'to', problems),
  })),
  run: (library, params) => {
    const from = siteAt(library, params.site);
    const target = params.group === null ? from.group : groupIndex(library, params.group);
    if (target === from.group) {
      return { library: withSites(library, from.group, (sites) => moved(sites, from.site, params.to)), value: null };
    }
    const site = library.groups[from.group]?.sites[from.site] as Site;
    checkPlace(params.to, library.groups[target]?.sites.length ?? 0, 'to');
    const without = withSites(library, from.group, (sites) => sites.filter((_, j) => j !== from.site));
    return { library: withSites(without, target, (sites) => inserted(sites, site, params.to)), value: null };
  },
});

const siteRemove = define<{ site: string }, null>({
  id: 'site.remove',
  agentClass: 'owner',
  parse: fieldsOf((fields, problems) => ({ site: id(fields.site, 'site', problems) })),
  run: (library, params) => {
    const at = siteAt(library, params.site);
    return { library: withSites(library, at.group, (sites) => sites.filter((_, j) => j !== at.site)), value: null };
  },
});

/** The index of a todo, or a `CommandError` (`missing`). */
function todoIndex(library: Library, todo: string): number {
  const i = library.todos.findIndex((t) => t.id === todo);
  if (i < 0) throw new CommandError('missing', `todo: no todo ${todo}`);
  return i;
}

const todoAdd = define<{ text: string }, string>({
  id: 'todo.add',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({ text: name(fields.text, 'text', problems) })),
  run: (library, params) => {
    const todo: Todo = { id: nextId(library, 't'), text: params.text, done: false };
    return { library: { ...library, todos: [...library.todos, todo] }, value: todo.id };
  },
});

const todoToggle = define<{ todo: string; done: boolean | null }, boolean>({
  id: 'todo.toggle',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => ({
    todo: id(fields.todo, 'todo', problems),
    done: optional(fields.done, null, (value) => flag(value, 'done', problems)),
  })),
  run: (library, params) => {
    const i = todoIndex(library, params.todo);
    const done = params.done ?? !library.todos[i]?.done;
    const todos = library.todos.map((t, j) => (j === i ? { ...t, done } : t));
    return { library: { ...library, todos }, value: done };
  },
});

const todoRemove = define<{ todo: string }, null>({
  id: 'todo.remove',
  agentClass: 'owner',
  parse: fieldsOf((fields, problems) => ({ todo: id(fields.todo, 'todo', problems) })),
  run: (library, params) => {
    const i = todoIndex(library, params.todo);
    return { library: { ...library, todos: library.todos.filter((_, j) => j !== i) }, value: null };
  },
});

const settingsSet = define<Partial<Settings>, null>({
  id: 'settings.set',
  agentClass: 'safe',
  parse: fieldsOf((fields, problems) => {
    const change: Partial<Record<keyof Settings, unknown>> = {};
    for (const key of SETTING_KEYS) {
      if (fields[key] !== undefined) change[key] = SETTING_READERS[key](fields[key], key, problems);
    }
    for (const key of Object.keys(fields)) {
      if (!(SETTING_KEYS as string[]).includes(key)) problems.add(key, 'is not a setting');
    }
    if (Object.keys(fields).length === 0) problems.add('settings.set', `give at least one of ${SETTING_KEYS.join(', ')}`);
    return change as Partial<Settings>;
  }),
  run: (library, change) => {
    const group = change.activeGroup;
    if (group && !library.groups.some((g) => g.id === group)) {
      throw new CommandError('missing', `activeGroup: no group ${group}`);
    }
    return { library: { ...library, settings: { ...library.settings, ...change } }, value: null };
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
  siteAdd,
  siteUpdate,
  siteMove,
  siteRemove,
  todoAdd,
  todoToggle,
  todoRemove,
  settingsSet,
  libraryExport,
  libraryImport,
];

/** A registry with every library command in it. */
export function createCommands(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const command of LIBRARY_COMMANDS) registry.register(command);
  return registry;
}
