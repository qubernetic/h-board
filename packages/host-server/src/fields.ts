/** The problems found in a request body, each one naming its field: `name: must not be empty`. */
export class Problems {
  readonly list: string[] = [];

  add(path: string, message: string): void {
    this.list.push(`${path}: ${message}`);
  }

  /** One problem per line. */
  get message(): string {
    return this.list.join('\n');
  }
}

export type Body = Readonly<Record<string, unknown>>;

const MAX_NAME = 64;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 1024;
const MAX_CODE = 64;
// eslint-disable-next-line no-control-regex -- the point is to find control characters
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function textOf(body: Body, field: string, problems: Problems): string | undefined {
  const value = body[field];
  if (typeof value === 'string') return value;
  problems.add(field, 'must be text');
  return undefined;
}

/** An account name: trimmed, 1 to 64 characters, no control characters. */
export function accountName(body: Body, field: string, problems: Problems): string {
  const value = textOf(body, field, problems)?.trim();
  if (value === undefined) return '';
  if (value === '') problems.add(field, 'must not be empty');
  else if (value.length > MAX_NAME) problems.add(field, `must be at most ${MAX_NAME} characters`);
  else if (CONTROL.test(value)) problems.add(field, 'must not contain control characters');
  return value;
}

/** A name typed to sign in: trimmed text of at most 64 characters, since no account has a longer one. */
export function typedName(body: Body, field: string, problems: Problems): string {
  const value = textOf(body, field, problems)?.trim();
  if (value === undefined) return '';
  if (value.length > MAX_NAME) problems.add(field, `must be at most ${MAX_NAME} characters`);
  return value;
}

/** A new password: 10 to 1024 characters, kept as typed. */
export function newPassword(body: Body, field: string, problems: Problems): string {
  const value = textOf(body, field, problems);
  if (value === undefined) return '';
  if (value.length < MIN_PASSWORD) problems.add(field, `must be at least ${MIN_PASSWORD} characters`);
  else if (value.length > MAX_PASSWORD) problems.add(field, `must be at most ${MAX_PASSWORD} characters`);
  return value;
}

/** A typed secret (a password to check, a setup code): text of at most `max` characters. */
export function secret(body: Body, field: string, problems: Problems, max: number = MAX_PASSWORD): string {
  const value = textOf(body, field, problems);
  if (value === undefined) return '';
  if (value.length > max) problems.add(field, `must be at most ${max} characters`);
  return value;
}

/** A setup code: text of at most 64 characters. */
export function setupCode(body: Body, field: string, problems: Problems): string {
  return secret(body, field, problems, MAX_CODE);
}
