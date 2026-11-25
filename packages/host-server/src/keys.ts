import { CommandError } from '@h-board/core';
import type { AgentClass } from '@h-board/core';
import type { User } from './accounts';
import type { Database } from './db';
import { hashSecret, newToken } from './secrets';

/** What a key may do: `read` only reads, `edit` also runs `safe` commands, `owner` also `owner` ones. */
export const SCOPES = ['read', 'edit', 'owner'] as const;

export type Scope = (typeof SCOPES)[number];

export function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPES as readonly string[]).includes(value);
}

/** An agent key as the API shows it; the key itself is shown only once, when it is made. */
export interface AgentKey {
  readonly id: number;
  readonly name: string;
  readonly scope: Scope;
  /** When the key was made, in milliseconds. */
  readonly createdAt: number;
  /** When the key was last used, in milliseconds; null when never. */
  readonly usedAt: number | null;
}

/** A key that has just been made, with its secret, shown this once. */
export interface MadeKey {
  readonly key: AgentKey;
  readonly secret: string;
}

/** A key in use: the key and the user it acts for. */
export interface KeyUse {
  readonly key: AgentKey;
  readonly user: User;
}

/**
 * How a use of a key ended. A fixed word, never a message, so the log holds no parameter value and
 * no page text.
 */
export type Outcome =
  | 'done'
  | 'unchanged'
  | 'read-only'
  | 'needs-owner'
  | 'never'
  | 'temporary-password'
  | 'invalid'
  | 'missing'
  | 'unknown'
  | 'error';

/** How a use of a key that failed is logged: the kind of failure, never its message. */
export function outcomeOf(error: unknown): Outcome {
  if (!(error instanceof CommandError)) return 'error';
  return error.code === 'invalid' || error.code === 'missing' ? error.code : 'error';
}

/** One use of a key in the log. `command` is null when the id named no command. */
export interface Entry {
  readonly at: number;
  readonly key: string;
  readonly scope: Scope;
  readonly command: string | null;
  readonly outcome: Outcome;
}

/** How many keys one user may have. */
export const MAX_KEYS = 100;

/** How many uses the log keeps of each user, the newest. */
export const MAX_ENTRIES = 100;

/** What a route of the library needs of a key: to read, or a command's agent class. */
export type Need = 'read' | AgentClass;

/** Why a key of `scope` may not do what needs `need`; undefined when it may. */
export function refusal(scope: Scope, need: Need): 'read-only' | 'needs-owner' | 'never' | undefined {
  if (need === 'read') return undefined;
  if (need === 'never') return 'never';
  if (scope === 'read') return 'read-only';
  return need === 'owner' && scope !== 'owner' ? 'needs-owner' : undefined;
}

const KEY = 'agent_keys.id, agent_keys.name, agent_keys.scope, agent_keys.created_at, agent_keys.used_at';
const USER = 'users.id as user_id, users.name as user_name, users.admin, users.temporary, users.created_at as user_created_at';

function keyOf(row: Record<string, unknown>): AgentKey {
  const usedAt = row['used_at'];
  return {
    id: Number(row['id']),
    name: String(row['name']),
    scope: String(row['scope']) as Scope,
    createdAt: Number(row['created_at']),
    usedAt: usedAt === null ? null : Number(usedAt),
  };
}

function useOf(row: Record<string, unknown>): KeyUse {
  return {
    key: keyOf(row),
    user: {
      id: Number(row['user_id']),
      name: String(row['user_name']),
      admin: row['admin'] === 1,
      mustChangePassword: row['temporary'] === 1,
      createdAt: Number(row['user_created_at']),
    },
  };
}

/** A new key: `hbk_` and 32 random bytes in base64url, so it is easy to tell from a session token. */
export function newKey(): string {
  return `hbk_${newToken()}`;
}

/**
 * The agent keys of each user and the log of their uses, in the database. A key is kept only as its
 * SHA-256 hash; the log keeps the key's name and scope, so it outlives a revoked key.
 */
export class Keys {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  /** Makes a key for the user; 'taken' when the user has a key of that name, 'full' at `MAX_KEYS`. */
  make(userId: number, name: string, scope: Scope, now: number): MadeKey | 'taken' | 'full' {
    return this.#db.transaction(() => {
      if (this.#db.get('select 1 from agent_keys where user_id = ? and name = ?', userId, name) !== undefined) return 'taken';
      const count = Number(this.#db.get('select count(*) as n from agent_keys where user_id = ?', userId)?.['n']);
      if (count >= MAX_KEYS) return 'full';
      const secret = newKey();
      const { lastId } = this.#db.run(
        'insert into agent_keys (user_id, name, scope, key_hash, created_at) values (?, ?, ?, ?, ?)',
        userId,
        name,
        scope,
        hashSecret(secret),
        now,
      );
      return { key: { id: lastId, name, scope, createdAt: now, usedAt: null }, secret };
    });
  }

  /** The user's keys, the oldest first. */
  list(userId: number): AgentKey[] {
    return this.#db.all(`select ${KEY} from agent_keys where user_id = ? order by id`, userId).map(keyOf);
  }

  /** Revokes one of the user's keys; false when the user has no key of that id. */
  revoke(userId: number, keyId: number): boolean {
    return this.#db.run('delete from agent_keys where id = ? and user_id = ?', keyId, userId).changes === 1;
  }

  /** The key of a bearer token and its user, noting the use; undefined for an unknown or revoked key. */
  use(secret: string, now: number): KeyUse | undefined {
    const found = this.#find(secret);
    if (found === undefined) return undefined;
    this.#db.run('update agent_keys set used_at = ? where id = ?', now, found.key.id);
    return { ...found, key: { ...found.key, usedAt: now } };
  }

  /** The key of a bearer token and its user as they are now, without noting a use. */
  stands(secret: string, keyId: number): KeyUse | undefined {
    const found = this.#find(secret);
    return found?.key.id === keyId ? found : undefined;
  }

  /** Notes one use of a key in its user's log, and lets the oldest go past `MAX_ENTRIES`. */
  note(use: KeyUse, command: string | null, outcome: Outcome, now: number): void {
    this.#db.transaction(() => {
      this.#db.run(
        `insert into key_log (user_id, at, key_name, scope, command, outcome)
           select id, ?, ?, ?, ?, ? from users where id = ? and created_at = ?`,
        now,
        use.key.name,
        use.key.scope,
        command,
        outcome,
        use.user.id,
        use.user.createdAt,
      );
      this.#db.run(
        `delete from key_log where user_id = ? and id not in
           (select id from key_log where user_id = ? order by id desc limit ?)`,
        use.user.id,
        use.user.id,
        MAX_ENTRIES,
      );
    });
  }

  /** The user's log, the newest use first. */
  log(userId: number): Entry[] {
    return this.#db
      .all('select at, key_name, scope, command, outcome from key_log where user_id = ? order by id desc', userId)
      .map((row) => ({
        at: Number(row['at']),
        key: String(row['key_name']),
        scope: String(row['scope']) as Scope,
        command: row['command'] === null ? null : String(row['command']),
        outcome: String(row['outcome']) as Outcome,
      }));
  }

  #find(secret: string): KeyUse | undefined {
    const row = this.#db.get(
      `select ${KEY}, ${USER}
         from agent_keys join users on users.id = agent_keys.user_id
        where agent_keys.key_hash = ?`,
      hashSecret(secret),
    );
    return row === undefined ? undefined : useOf(row);
  }
}
