import { CommandError } from './commands';
import { DENSITIES, ENGINES, LAYOUTS, MOTIONS, THEMES } from './model';
import type { Settings } from './model';
import { MAX_FILE } from './size';

export { MAX_FILE };

/** The problems found in some data, each one naming its field: `groups[0].name: must not be empty`. */
export class Problems {
  readonly list: string[] = [];

  add(path: string, message: string): void {
    this.list.push(`${path}: ${message}`);
  }

  /** Throws a `CommandError` (`invalid`) with one problem per line, if there is any. */
  throwIfAny(): void {
    if (this.list.length > 0) throw new CommandError('invalid', this.list.join('\n'));
  }
}

export type Fields = Readonly<Record<string, unknown>>;

const MAX_NAME = 200;
const MAX_TEXT = 2000;
const MAX_ADDRESS = 2048;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ADDRESS = /^https?:\/\/[^\s/?#]+[^\s]*$/i;
const SLUG = /^[a-z0-9]{1,64}$/;

export function record(value: unknown, path: string, problems: Problems): Fields | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Fields;
  problems.add(path, 'must be an object');
  return undefined;
}

export function list(value: unknown, path: string, problems: Problems): readonly unknown[] {
  if (Array.isArray(value)) return value;
  problems.add(path, 'must be a list');
  return [];
}

/** A name: text that is not empty, trimmed. */
export function name(value: unknown, path: string, problems: Problems): string {
  if (typeof value !== 'string') {
    problems.add(path, 'must be text');
    return '';
  }
  const trimmed = value.trim();
  if (trimmed === '') problems.add(path, 'must not be empty');
  else if (trimmed.length > MAX_NAME) problems.add(path, `must be at most ${MAX_NAME} characters`);
  return trimmed;
}

/** Free text, may be empty, at most `max` characters. */
export function text(value: unknown, path: string, problems: Problems, max = MAX_TEXT): string {
  if (typeof value !== 'string') {
    problems.add(path, 'must be text');
    return '';
  }
  if (value.length > max) problems.add(path, `must be at most ${max} characters`);
  return value;
}

export function id(value: unknown, path: string, problems: Problems): string {
  if (typeof value === 'string' && ID.test(value)) return value;
  problems.add(path, 'must be an id of letters, digits, - and _');
  return '';
}

/** An http or https address of at most 2048 characters. Any other scheme (`javascript:`, `file:`) is refused. */
export function address(value: unknown, path: string, problems: Problems): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!ADDRESS.test(trimmed)) problems.add(path, 'must be an http or https address');
  else if (trimmed.length > MAX_ADDRESS) problems.add(path, `must be at most ${MAX_ADDRESS} characters`);
  else return trimmed;
  return '';
}

/** A Simple Icons slug, or `null`. */
export function slug(value: unknown, path: string, problems: Problems): string | null {
  if (value === null || (typeof value === 'string' && SLUG.test(value))) return value;
  problems.add(path, 'must be null or a slug of lower-case letters and digits');
  return null;
}

export function flag(value: unknown, path: string, problems: Problems): boolean {
  if (typeof value === 'boolean') return value;
  problems.add(path, 'must be true or false');
  return false;
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], path: string, problems: Problems): T {
  if ((options as readonly unknown[]).includes(value)) return value as T;
  problems.add(path, `must be one of ${options.join(', ')}`);
  return options[0] as T;
}

/** A whole number from `min` to `max`. */
export function index(value: unknown, min: number, max: number, path: string, problems: Problems): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value;
  problems.add(path, `must be a whole number from ${min} to ${max}`);
  return min;
}

type Reader<T> = (value: unknown, path: string, problems: Problems) => T;

/** One reader per setting. Whether the active group is there is the caller's to check. */
export const SETTING_READERS: { readonly [K in keyof Settings]: Reader<Settings[K]> } = {
  theme: (value, path, problems) => oneOf(value, THEMES, path, problems),
  density: (value, path, problems) => oneOf(value, DENSITIES, path, problems),
  columns: (value, path, problems) => columns(value, path, problems),
  layout: (value, path, problems) => oneOf(value, LAYOUTS, path, problems),
  engine: (value, path, problems) => oneOf(value, ENGINES, path, problems),
  motion: (value, path, problems) => oneOf(value, MOTIONS, path, problems),
  activeGroup: (value, path, problems) => (value === null ? null : id(value, path, problems)),
};

export const SETTING_KEYS = Object.keys(SETTING_READERS) as (keyof Settings)[];

export function columns(value: unknown, path: string, problems: Problems): number {
  if (value === 0 || (typeof value === 'number' && Number.isInteger(value) && value >= 4 && value <= 12)) {
    return value;
  }
  problems.add(path, 'must be 0 or a whole number from 4 to 12');
  return 0;
}
