import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashSecret,
  newSetupCode,
  newToken,
  normaliseSetupCode,
  verifyPassword,
} from '../src/secrets';

const CHEAP = 1024;

describe('hashPassword and verifyPassword', () => {
  it('accepts the password it hashed and refuses another', async () => {
    const stored = await hashPassword('correct horse battery', CHEAP);
    expect(stored).not.toContain('correct horse battery');
    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password', CHEAP)).not.toBe(await hashPassword('same password', CHEAP));
  });

  it('uses the strong cost by default and keeps it in the hash', async () => {
    const stored = await hashPassword('a long password');
    expect(stored.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(await verifyPassword('a long password', stored)).toBe(true);
  });

  it('refuses a stored value it cannot read', async () => {
    for (const stored of ['', 'plain', 'scrypt$x$8$1$aa$bb', 'bcrypt$1024$8$1$aa$bb', 'scrypt$1024$8$1$aa']) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });
});

describe('tokens', () => {
  it('are long, random and URL safe', () => {
    const token = newToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(newToken()).not.toBe(token);
  });

  it('are kept as a hash that does not contain them', () => {
    const token = newToken();
    expect(hashSecret(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(token)).toBe(hashSecret(token));
    expect(hashSecret(token)).not.toContain(token);
  });
});

describe('setup codes', () => {
  it('are five groups of four letters and digits that are easy to read', () => {
    const code = newSetupCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    expect(newSetupCode()).not.toBe(code);
  });

  it('are compared without case, spaces or hyphens', () => {
    expect(normaliseSetupCode(' abcd-efgh ijkm-npqr-stvw ')).toBe('ABCDEFGHIJKMNPQRSTVW');
  });
});
