import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * The scrypt cost of a new password hash: N = 2^17 with r = 8 and p = 1, the OWASP minimum. The
 * cost is kept in the hash, so a later change still reads the old ones.
 */
export const PASSWORD_COST = 131072;

const BLOCK = 8;
const PARALLEL = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, cost: number, block: number, parallel: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs 128 * N * r bytes; allow twice that.
    const maxmem = 256 * cost * block;
    scrypt(password, salt, KEY_LENGTH, { N: cost, r: block, p: parallel, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Hashes a password with a fresh salt: `scrypt$N$r$p$salt$hash`, both in base64url. */
export async function hashPassword(password: string, cost: number = PASSWORD_COST): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost, BLOCK, PARALLEL);
  return ['scrypt', cost, BLOCK, PARALLEL, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Whether `password` is the one `stored` was made from. A value it cannot read is a refusal. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [cost, block, parallel] = parts.slice(1, 4).map(Number) as [number, number, number];
  if (![cost, block, parallel].every((n) => Number.isSafeInteger(n) && n > 0)) return false;
  const [salt, expected] = parts.slice(4).map((part) => Buffer.from(part, 'base64url')) as [Buffer, Buffer];
  const key = await derive(password, salt, cost, block, parallel).catch(() => undefined);
  return key !== undefined && expected.length === key.length && timingSafeEqual(expected, key);
}

/** A new bearer token: 32 random bytes in base64url. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The hash a token or a setup code is kept as. Both are long and random, so one SHA-256 is
 * enough; a password, which a person chooses, gets scrypt.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

// Crockford's base 32: no I, L, O or U, so the code is easy to read from a log and type.
const CODE_LETTERS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A new setup code: 20 characters (100 bits) in five groups of four. */
export function newSetupCode(): string {
  const letters = Array.from({ length: 20 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]);
  return [0, 4, 8, 12, 16].map((start) => letters.slice(start, start + 4).join('')).join('-');
}

/**
 * A new temporary password, which an admin gives a user: the form of a setup code, 100 bits, easy
 * to read out and type. It is hashed like any password.
 */
export function newTemporaryPassword(): string {
  return newSetupCode();
}

/** A typed setup code as it is hashed: capitals, without spaces and hyphens. */
export function normaliseSetupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}
