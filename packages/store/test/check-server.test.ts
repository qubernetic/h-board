import { emptyHistory, emptyLibrary } from '@h-board/core';
import { describe, expect, it } from 'vitest';
import { RemoteStore, checkServer } from '../src/index';
import { FakeLocalArea } from './chrome-storage';

/** A `RemoteStore` on `server` that counts every request and every token asked for. */
function store(server: string) {
  const s = {
    asked: [] as string[],
    tokens: 0,
    fetch: (url: string): Promise<Response> => {
      s.asked.push(url);
      return Promise.resolve(Response.json({ library: emptyLibrary(), history: emptyHistory() }));
    },
    make: () =>
      new RemoteStore({
        server,
        token: () => {
          s.tokens += 1;
          return 'token';
        },
        cache: new FakeLocalArea(),
        fetch: s.fetch,
      }),
  };
  return s;
}

describe('checkServer', () => {
  it('takes an https address and gives it back without the trailing slash', () => {
    expect(checkServer('https://board.example.org')).toBe('https://board.example.org');
    expect(checkServer(' https://Board.Example.org:8443/ ')).toBe('https://board.example.org:8443');
    expect(checkServer('https://example.org/h-board/')).toBe('https://example.org/h-board');
  });

  it('takes http only on this computer: localhost, 127.0.0.0/8 and [::1]', () => {
    expect(checkServer('http://localhost:8787')).toBe('http://localhost:8787');
    expect(checkServer('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    expect(checkServer('http://127.1.2.3')).toBe('http://127.1.2.3');
    expect(checkServer('http://[::1]:8787')).toBe('http://[::1]:8787');
  });

  it.each([
    ['http to another host', 'http://board.example.org'],
    ['http to a host that only starts like this computer', 'http://localhost.example.org'],
    ['http to a private network', 'http://192.168.1.20:8787'],
    ['credentials', 'https://ann:secret@board.example.org'],
    ['a name alone', 'https://ann@board.example.org'],
    ['a query', 'https://board.example.org/?a=1'],
    ['a fragment', 'https://board.example.org/#top'],
    ['an empty query and fragment', 'https://board.example.org/?#'],
    ['ftp', 'ftp://board.example.org'],
    ['data', 'data:text/plain,board'],
    ['javascript', 'javascript:alert(1)'],
    ['no scheme', 'board.example.org'],
    ['nothing', ''],
  ])('refuses %s with the field and without the value', (_, value) => {
    expect(() => checkServer(value)).toThrow('server: must be an https address');
    try {
      checkServer(value);
    } catch (error) {
      if (value !== '') expect((error as Error).message).not.toContain(value);
    }
  });

  it('refuses an address longer than 2048 characters', () => {
    expect(() => checkServer(`https://${'a'.repeat(2048)}.org`)).toThrow('server: must be at most 2048 characters');
  });
});

describe('RemoteStore and the server address', () => {
  it.each([
    'http://board.example.org',
    'https://ann:secret@board.example.org',
    'https://board.example.org/?a=1',
    'https://board.example.org/#top',
    'ftp://board.example.org',
    'data:text/plain,board',
    'javascript:alert(1)',
  ])('refuses %s in the constructor, before any token or request', (server) => {
    const s = store(server);
    expect(() => s.make()).toThrow('server: must be an https address');
    expect(s.asked).toEqual([]);
    expect(s.tokens).toBe(0);
  });

  it('asks a server behind a sub-path on this computer at its own path', async () => {
    const s = store('http://localhost:8080/board/');
    await s.make().load();
    expect(s.asked).toEqual(['http://localhost:8080/board/api/library']);
  });
});
