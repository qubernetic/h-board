import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clientAddress } from '../src/address';

async function addressOf(trustProxy: boolean, headers: Record<string, string>, remoteAddress?: string) {
  const app = new Hono();
  app.get('/', (c) => c.text(clientAddress(c, trustProxy)));
  const env = { incoming: { socket: { remoteAddress } } };
  return (await app.request('/', { headers }, env)).text();
}

describe('clientAddress', () => {
  it('is the address of the connection', async () => {
    expect(await addressOf(false, { 'x-forwarded-for': '203.0.113.9' }, '192.0.2.1')).toBe('192.0.2.1');
  });

  it('is the address the proxy added last, when the proxy is trusted', async () => {
    expect(await addressOf(true, { 'x-forwarded-for': '10.9.9.9, 203.0.113.9 ' }, '192.0.2.1')).toBe('203.0.113.9');
  });

  it('falls back to the connection without a forwarded address', async () => {
    expect(await addressOf(true, {}, '192.0.2.1')).toBe('192.0.2.1');
    expect(await addressOf(true, { 'x-forwarded-for': ' ' }, '192.0.2.1')).toBe('192.0.2.1');
  });

  it('is "unknown" when the connection has none', async () => {
    expect(await addressOf(false, {})).toBe('unknown');
    const app = new Hono();
    app.get('/', (c) => c.text(clientAddress(c, false)));
    expect(await (await app.request('/')).text()).toBe('unknown');
  });
});
