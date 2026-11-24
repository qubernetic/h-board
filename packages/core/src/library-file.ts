import { Problems, SETTING_KEYS, SETTING_READERS, address, flag, id, list, name, oneOf, record, slug, text } from './check';
import type { Fields } from './check';
import { ICON_MODES, emptyLibrary } from './model';
import type { Group, Library, Settings, Site, Todo } from './model';

/** The `app` field that marks an exported file as H-Board's. */
export const FILE_APP = 'h-board';

/** The library as a readable JSON file. */
export function writeLibraryFile(library: Library): string {
  return JSON.stringify({ app: FILE_APP, ...library }, null, 2);
}

/**
 * Reads an exported file. Fields it does not know are dropped. Every problem is listed, each one
 * naming its field; the library is only usable when there is none.
 */
export function readLibraryFile(content: string): { library: Library; problems: string[] } {
  const problems = new Problems();
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    problems.add('file', `is not JSON (${(error as Error).message})`);
  }
  const library = problems.list.length > 0 ? undefined : readLibrary(data, problems);
  return { library: library ?? emptyResult, problems: problems.list };
}

/** The problems of an exported file, for the page to show before it imports. */
export function checkLibraryFile(content: string): string[] {
  return readLibraryFile(content).problems;
}

const emptyResult = emptyLibrary();

function readLibrary(data: unknown, problems: Problems): Library | undefined {
  const file = record(data, 'file', problems);
  if (!file) return undefined;
  if (file.app !== FILE_APP) problems.add('app', `must be "${FILE_APP}"`);
  if (file.schema !== 1) problems.add('schema', 'must be 1');
  if (problems.list.length > 0) return undefined;

  const seen = new Set<string>();
  const unique = (value: unknown, path: string): string => {
    const checked = id(value, path, problems);
    if (checked && seen.has(checked)) problems.add(path, `${checked} is used twice`);
    seen.add(checked);
    return checked;
  };
  const groups = list(file.groups, 'groups', problems).map((value, i) => readGroup(value, `groups[${i}]`, unique, problems));
  const todos = list(file.todos, 'todos', problems).map((value, i) => readTodo(value, `todos[${i}]`, unique, problems));
  const settings = readSettings(file.settings, groups, problems);
  return { schema: 1, groups, todos, settings };
}

type Unique = (value: unknown, path: string) => string;

function readGroup(value: unknown, path: string, unique: Unique, problems: Problems): Group {
  const fields = record(value, path, problems) ?? {};
  return {
    id: unique(fields.id, `${path}.id`),
    name: name(fields.name, `${path}.name`, problems),
    iconMode: oneOf(fields.iconMode, ICON_MODES, `${path}.iconMode`, problems),
    sites: list(fields.sites, `${path}.sites`, problems).map((site, i) =>
      readSite(site, `${path}.sites[${i}]`, unique, problems),
    ),
  };
}

function readSite(value: unknown, path: string, unique: Unique, problems: Problems): Site {
  const fields: Fields = record(value, path, problems) ?? {};
  return {
    id: unique(fields.id, `${path}.id`),
    name: name(fields.name, `${path}.name`, problems),
    url: address(fields.url, `${path}.url`, problems),
    description: text(fields.description, `${path}.description`, problems),
    glyph: name(fields.glyph, `${path}.glyph`, problems),
    brand: slug(fields.brand, `${path}.brand`, problems),
    icon: fields.icon === null ? null : oneOf(fields.icon, ICON_MODES, `${path}.icon`, problems),
  };
}

function readTodo(value: unknown, path: string, unique: Unique, problems: Problems): Todo {
  const fields = record(value, path, problems) ?? {};
  return {
    id: unique(fields.id, `${path}.id`),
    text: name(fields.text, `${path}.text`, problems),
    done: flag(fields.done, `${path}.done`, problems),
  };
}

function readSettings(value: unknown, groups: readonly Group[], problems: Problems): Settings {
  const fields = record(value, 'settings', problems);
  if (!fields) return emptyResult.settings;
  const read: Partial<Record<keyof Settings, unknown>> = {};
  for (const key of SETTING_KEYS) {
    // A file without an active group opens on the first one.
    const field = key === 'activeGroup' ? (fields.activeGroup ?? null) : fields[key];
    read[key] = SETTING_READERS[key](field, `settings.${key}`, problems);
  }
  const settings = read as Settings;
  if (settings.activeGroup !== null && !groups.some((group) => group.id === settings.activeGroup)) {
    problems.add('settings.activeGroup', `no group ${settings.activeGroup}`);
  }
  return settings;
}
