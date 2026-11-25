import type { Group, Library, Settings, Site } from './model';
import { SEARCH_ENGINES } from './search';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** `+GitLab in Development` for one site, `+2 sites in Development` for more. */
function sitesPhrase(sign: '+' | '-', sites: readonly Site[], group: string): string {
  const what = sites.length === 1 ? (sites[0] as Site).name : `${sites.length} sites`;
  return `${sign}${what} in ${group}`;
}

/** `Reading`, or `Reading (3 sites)` when it has any. */
function groupPhrase(group: Group): string {
  return group.sites.length === 0 ? group.name : `${group.name} (${group.sites.length} sites)`;
}

/** The ids two lists share, in the order of the first. */
function sharedOrder<T extends { id: string }>(items: readonly T[], others: ReadonlySet<string>): string[] {
  return items.filter((item) => others.has(item.id)).map((item) => item.id);
}

/** Where each site is: the group that holds it. */
function homes(library: Library): Map<string, Group> {
  const home = new Map<string, Group>();
  for (const group of library.groups) for (const site of group.sites) home.set(site.id, group);
  return home;
}

function groupChanges(a: Library, b: Library): string[] {
  const out: string[] = [];
  const before = new Map(a.groups.map((group) => [group.id, group]));
  const after = new Map(b.groups.map((group) => [group.id, group]));
  const homeBefore = homes(a);
  const homeAfter = homes(b);
  for (const group of b.groups) {
    const old = before.get(group.id);
    if (!old) {
      out.push(`+group ${groupPhrase(group)}`);
      continue;
    }
    if (old.name !== group.name) out.push(`renamed ${old.name} to ${group.name}`);
    if (old.iconMode !== group.iconMode) out.push(`icons: ${group.iconMode} in ${group.name}`);
    const oldSites = new Map(old.sites.map((site) => [site.id, site]));
    const newIds = new Set(group.sites.map((site) => site.id));
    const removed = old.sites.filter((site) => !newIds.has(site.id) && !homeAfter.has(site.id));
    const added = group.sites.filter((site) => !homeBefore.has(site.id));
    if (removed.length > 0) out.push(sitesPhrase('-', removed, group.name));
    if (added.length > 0) out.push(sitesPhrase('+', added, group.name));
    for (const site of group.sites) {
      const from = homeBefore.get(site.id);
      if (from && from.id !== group.id) out.push(`moved ${site.name} from ${from.name} to ${group.name}`);
    }
    for (const site of group.sites) {
      const was = homeBefore.get(site.id)?.sites.find((s) => s.id === site.id);
      if (was && !same(was, site)) out.push(`edited ${site.name} in ${group.name}`);
    }
    if (!same(sharedOrder(old.sites, newIds), sharedOrder(group.sites, new Set(oldSites.keys())))) {
      out.push(`reordered ${group.name}`);
    }
  }
  for (const group of a.groups) {
    if (!after.has(group.id)) out.push(`-group ${groupPhrase(group)}`);
  }
  if (!same(sharedOrder(a.groups, new Set(after.keys())), sharedOrder(b.groups, new Set(before.keys())))) {
    out.push('groups reordered');
  }
  return out;
}

function todoChanges(a: Library, b: Library): string[] {
  const out: string[] = [];
  const before = new Map(a.todos.map((todo) => [todo.id, todo]));
  const after = new Set(b.todos.map((todo) => todo.id));
  for (const todo of a.todos) if (!after.has(todo.id)) out.push(`-todo ${todo.text}`);
  for (const todo of b.todos) {
    const old = before.get(todo.id);
    if (!old) out.push(`+todo ${todo.text}`);
    else if (old.text !== todo.text) out.push(`edited todo ${todo.text}`);
    if (old && old.done !== todo.done) out.push(`${todo.done ? 'done' : 'reopened'}: ${todo.text}`);
  }
  if (!same(sharedOrder(a.todos, after), sharedOrder(b.todos, new Set(before.keys())))) out.push('todos reordered');
  return out;
}

/** How each setting reads in a change: its label and its new value. */
const SETTING_PHRASES: { [K in keyof Settings]: (value: Settings[K], library: Library) => string } = {
  theme: (value) => `theme: ${value}`,
  density: (value) => `density: ${value}`,
  columns: (value) => `columns: ${value === 0 ? 'as many as fit' : value}`,
  layout: (value) => `layout: ${value}`,
  engine: (value) => `search engine: ${SEARCH_ENGINES[value].name}`,
  motion: (value) => `motion: ${value}`,
  activeGroup: (value, library) =>
    `opens on: ${value === null ? 'the first group' : (library.groups.find((g) => g.id === value)?.name ?? value)}`,
};

function settingChanges(a: Library, b: Library): string[] {
  const out: string[] = [];
  for (const key of Object.keys(SETTING_PHRASES) as (keyof Settings)[]) {
    if (a.settings[key] !== b.settings[key]) {
      const phrase = SETTING_PHRASES[key] as (value: unknown, library: Library) => string;
      out.push(phrase(b.settings[key], b));
    }
  }
  return out;
}

/**
 * Everything that changes on the way from library `a` to library `b`, as short phrases: the groups
 * in the order of `b` with their sites, the removed groups, the todos, then the settings. Empty when
 * nothing changes. Names in the phrases are data the user typed: show them as text.
 */
export function diffLibraries(a: Library, b: Library): string[] {
  return [...groupChanges(a, b), ...todoChanges(a, b), ...settingChanges(a, b)];
}

/** Up to three changes on one line, and how many more there are. */
export function summarise(changes: readonly string[]): string {
  if (changes.length === 0) return 'no change';
  const shown = changes.slice(0, 3).join(', ');
  return changes.length > 3 ? `${shown} and ${changes.length - 3} more` : shown;
}
