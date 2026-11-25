import { timingSafeEqual } from 'node:crypto';
import type { Database } from './db';
import { PASSWORD_COST, hashPassword, hashSecret, newSetupCode, newToken, normaliseSetupCode, verifyPassword } from './secrets';

/** An account as the API shows it. */
export interface User {
  readonly id: number;
  readonly name: string;
  readonly admin: boolean;
}

/** A signed-in user and the session their token belongs to. */
export interface Session {
  readonly id: number;
  readonly user: User;
}

/** What a setup or a sign-in gives: the user and a new session token, shown this once. */
export interface SignedIn {
  readonly user: User;
  readonly token: string;
}

function userOf(row: Record<string, unknown>): User {
  return { id: Number(row['id']), name: String(row['name']), admin: row['admin'] === 1 };
}

/**
 * The accounts, their sessions and the setup code, in the database. Passwords are kept as scrypt
 * hashes, tokens and the setup code as SHA-256 hashes; none of them is kept in clear.
 */
export class Accounts {
  readonly #db: Database;
  readonly #cost: number;
  #dummy: Promise<string> | undefined;

  constructor(db: Database, cost: number = PASSWORD_COST) {
    this.#db = db;
    this.#cost = cost;
  }

  /** Whether any account exists. */
  hasUsers(): boolean {
    return this.#db.get('select 1 from users limit 1') !== undefined;
  }

  /** Makes a new setup code and keeps its hash in place of any earlier one. */
  newSetupCode(): string {
    const code = newSetupCode();
    this.#db.run(
      'insert into setup (id, code_hash) values (1, ?) on conflict (id) do update set code_hash = excluded.code_hash',
      hashSecret(normaliseSetupCode(code)),
    );
    return code;
  }

  /**
   * Makes the first account, an admin, when `code` is the setup code, and burns the code. Answers
   * undefined for a wrong or used code.
   */
  async setup(code: string, name: string, password: string, now: number): Promise<SignedIn | undefined> {
    const hash = await hashPassword(password, this.#cost);
    const given = Buffer.from(hashSecret(normaliseSetupCode(code)));
    return this.#db.transaction(() => {
      const row = this.#db.get('select code_hash from setup where id = 1');
      if (row === undefined || this.hasUsers()) return undefined;
      const kept = Buffer.from(String(row['code_hash']));
      if (kept.length !== given.length || !timingSafeEqual(kept, given)) return undefined;
      this.#db.run('delete from setup');
      const { lastId } = this.#db.run(
        'insert into users (name, password_hash, admin, created_at) values (?, ?, 1, ?)',
        name,
        hash,
        now,
      );
      const user: User = { id: lastId, name, admin: true };
      return { user, token: this.#startSession(user.id, now) };
    });
  }

  /** Signs in by name (in any case) and password; undefined when either is wrong. */
  async signIn(name: string, password: string, now: number): Promise<SignedIn | undefined> {
    const row = this.#db.get('select id, name, admin, password_hash from users where name = ?', name);
    if (row === undefined) {
      // Hash anyway, so an unknown name takes as long as a wrong password.
      this.#dummy ??= hashPassword('no account has this password', this.#cost);
      await verifyPassword(password, await this.#dummy);
      return undefined;
    }
    if (!(await verifyPassword(password, String(row['password_hash'])))) return undefined;
    const user = userOf(row);
    return { user, token: this.#startSession(user.id, now) };
  }

  /** The session of a bearer token, noting its use; undefined for an unknown or revoked token. */
  session(token: string, now: number): Session | undefined {
    const row = this.#db.get(
      `select sessions.id as session, users.id, users.name, users.admin
         from sessions join users on users.id = sessions.user_id
        where sessions.token_hash = ?`,
      hashSecret(token),
    );
    if (row === undefined) return undefined;
    const id = Number(row['session']);
    this.#db.run('update sessions set used_at = ? where id = ?', now, id);
    return { id, user: userOf(row) };
  }

  /** Revokes one session. */
  signOut(sessionId: number): void {
    this.#db.run('delete from sessions where id = ?', sessionId);
  }

  /** Whether `password` is the user's password. */
  async isPassword(userId: number, password: string): Promise<boolean> {
    const row = this.#db.get('select password_hash from users where id = ?', userId);
    return row !== undefined && verifyPassword(password, String(row['password_hash']));
  }

  /** Sets a new password and revokes every other session of the user. */
  async changePassword(session: Session, password: string): Promise<void> {
    const hash = await hashPassword(password, this.#cost);
    this.#db.transaction(() => {
      this.#db.run('update users set password_hash = ? where id = ?', hash, session.user.id);
      this.#db.run('delete from sessions where user_id = ? and id != ?', session.user.id, session.id);
    });
  }

  #startSession(userId: number, now: number): string {
    const token = newToken();
    this.#db.run(
      'insert into sessions (user_id, token_hash, created_at, used_at) values (?, ?, ?, ?)',
      userId,
      hashSecret(token),
      now,
      now,
    );
    return token;
  }
}
