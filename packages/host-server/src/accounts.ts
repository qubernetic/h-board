import { timingSafeEqual } from 'node:crypto';
import type { Database } from './db';
import {
  hashPassword,
  hashSecret,
  newSetupCode,
  newTemporaryPassword,
  newToken,
  normaliseSetupCode,
  verifyPassword,
} from './secrets';

/** An account as the API shows it. */
export interface User {
  readonly id: number;
  readonly name: string;
  readonly admin: boolean;
  /** Whether the password is a temporary one an admin gave; the user must change it first. */
  readonly mustChangePassword: boolean;
  /** When the account was made, in milliseconds. */
  readonly createdAt: number;
}

/** A user an admin has just added, with the temporary password, shown this once. */
export interface Added {
  readonly user: User;
  readonly password: string;
}

const USER = 'users.id, users.name, users.admin, users.temporary, users.created_at';

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
  return {
    id: Number(row['id']),
    name: String(row['name']),
    admin: row['admin'] === 1,
    mustChangePassword: row['temporary'] === 1,
    createdAt: Number(row['created_at']),
  };
}

/**
 * The accounts, their sessions and the setup code, in the database. Passwords are kept as scrypt
 * hashes, tokens and the setup code as SHA-256 hashes; none of them is kept in clear.
 */
export class Accounts {
  readonly #db: Database;
  readonly #hash: (password: string) => Promise<string>;
  #dummy: Promise<string> | undefined;

  /** `hash` makes the hash of a new password; only tests change it. */
  constructor(db: Database, hash: (password: string) => Promise<string> = hashPassword) {
    this.#db = db;
    this.#hash = hash;
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
   * undefined for a wrong or used code, without hashing the password.
   */
  async setup(code: string, name: string, password: string, now: number): Promise<SignedIn | undefined> {
    const given = Buffer.from(hashSecret(normaliseSetupCode(code)));
    if (!this.#isSetupCode(given)) return undefined;
    const hash = await this.#hash(password);
    return this.#db.transaction(() => {
      // Again, since another setup may have used the code while the password was hashed.
      if (!this.#isSetupCode(given)) return undefined;
      this.#db.run('delete from setup');
      const { lastId } = this.#db.run(
        'insert into users (name, password_hash, admin, created_at) values (?, ?, 1, ?)',
        name,
        hash,
        now,
      );
      const user: User = { id: lastId, name, admin: true, mustChangePassword: false, createdAt: now };
      return { user, token: this.#startSession(user.id, now) };
    });
  }

  /**
   * Signs in by name (in any case) and password; undefined when either is wrong. A temporary
   * password signs in once: its session may only change it, and a second sign-in with it fails.
   */
  async signIn(name: string, password: string, now: number): Promise<SignedIn | undefined> {
    const row = this.#db.get(`select ${USER}, users.password_hash from users where name = ?`, name);
    if (row === undefined) {
      // Hash anyway, so an unknown name takes as long as a wrong password.
      this.#dummy ??= this.#hash('no account has this password');
      await verifyPassword(password, await this.#dummy);
      return undefined;
    }
    const hash = String(row['password_hash']);
    if (!(await verifyPassword(password, hash))) return undefined;
    const user = userOf(row);
    return this.#db.transaction(() => {
      if (user.mustChangePassword) {
        // The hash too, since a reset or a change may have come while the password was checked.
        const used = this.#db.run(
          'update users set temporary_used = 1 where id = ? and password_hash = ? and temporary = 1 and temporary_used = 0',
          user.id,
          hash,
        );
        if (used.changes === 0) return undefined;
      }
      return { user, token: this.#startSession(user.id, now) };
    });
  }

  /** Every account, the oldest first. */
  users(): User[] {
    return this.#db.all(`select ${USER} from users order by id`).map(userOf);
  }

  /** Adds a user who is not an admin, with a temporary password; undefined when the name is taken. */
  async addUser(name: string, now: number): Promise<Added | undefined> {
    if (this.#idOf(name) !== undefined) return undefined;
    const password = newTemporaryPassword();
    const hash = await this.#hash(password);
    return this.#db.transaction(() => {
      // Again, since another add may have taken the name while the password was hashed.
      if (this.#idOf(name) !== undefined) return undefined;
      const { lastId } = this.#db.run(
        'insert into users (name, password_hash, admin, temporary, created_at) values (?, ?, 0, 1, ?)',
        name,
        hash,
        now,
      );
      const user: User = { id: lastId, name, admin: false, mustChangePassword: true, createdAt: now };
      return { user, password };
    });
  }

  /**
   * Gives a user a new temporary password and revokes all their sessions; undefined when there is
   * no such user.
   */
  async resetPassword(userId: number): Promise<Added | undefined> {
    const user = this.user(userId);
    if (user === undefined) return undefined;
    const password = newTemporaryPassword();
    const hash = await this.#hash(password);
    return this.#db.transaction(() => {
      const { changes } = this.#db.run(
        'update users set password_hash = ?, temporary = 1, temporary_used = 0 where id = ?',
        hash,
        userId,
      );
      // The user may have been removed while the password was hashed.
      if (changes === 0) return undefined;
      this.#db.run('delete from sessions where user_id = ?', userId);
      return { user: { ...user, mustChangePassword: true }, password };
    });
  }

  /** Removes a user with all their sessions; false when there is no such user. */
  removeUser(userId: number): boolean {
    return this.#db.transaction(() => {
      this.#db.run('delete from sessions where user_id = ?', userId);
      return this.#db.run('delete from users where id = ?', userId).changes === 1;
    });
  }

  /** The session of a bearer token, noting its use; undefined for an unknown or revoked token. */
  session(token: string, now: number): Session | undefined {
    const row = this.#db.get(
      `select sessions.id as session, ${USER}
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

  /**
   * Sets a new password of the user's own, so it is no longer temporary, and revokes every other
   * session of the user. False when the session was revoked while the password was hashed.
   */
  async changePassword(session: Session, password: string): Promise<boolean> {
    const hash = await this.#hash(password);
    return this.#db.transaction(() => {
      if (this.#db.get('select 1 from sessions where id = ?', session.id) === undefined) return false;
      this.#db.run(
        'update users set password_hash = ?, temporary = 0, temporary_used = 0 where id = ?',
        hash,
        session.user.id,
      );
      this.#db.run('delete from sessions where user_id = ? and id != ?', session.user.id, session.id);
      return true;
    });
  }

  /** The account of an id, or undefined. */
  user(userId: number): User | undefined {
    const row = this.#db.get(`select ${USER} from users where id = ?`, userId);
    return row === undefined ? undefined : userOf(row);
  }

  #idOf(name: string): number | undefined {
    const row = this.#db.get('select id from users where name = ?', name);
    return row === undefined ? undefined : Number(row['id']);
  }

  /** Whether `given` is the hash of the setup code and no account exists yet. */
  #isSetupCode(given: Buffer): boolean {
    const row = this.#db.get('select code_hash from setup where id = 1');
    if (row === undefined || this.hasUsers()) return false;
    const kept = Buffer.from(String(row['code_hash']));
    return kept.length === given.length && timingSafeEqual(kept, given);
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
