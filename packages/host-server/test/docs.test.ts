import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp, openDatabase } from '../src/index';
import { ignore, server, setUp } from './support';
import type { Server } from './support';

const root = new URL('../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

type Scope = 'read' | 'edit' | 'owner';

async function toolNames(s: Server, token: string, scope: Scope): Promise<string[]> {
  const made = await s.call('POST', '/api/keys', { name: scope, scope }, token);
  const { secret } = (await made.json()) as { secret: string };
  const response = await s.send('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const { result } = (await response.json()) as { result: { tools: { name: string }[] } };
  return result.tools.map((tool) => tool.name);
}

describe('the guides', () => {
  it('name every MCP tool with the scope it needs, and no other', async () => {
    const s = server();
    const token = await setUp(s);
    const reads = await toolNames(s, token, 'read');
    const edits = await toolNames(s, token, 'edit');
    const owners = await toolNames(s, token, 'owner');
    const listed = new Map<string, Scope>();
    for (const name of reads) listed.set(name, 'read');
    for (const name of edits.filter((x) => !reads.includes(x))) listed.set(name, 'edit');
    for (const name of owners.filter((x) => !edits.includes(x))) listed.set(name, 'owner');
    // The tool table of docs/mcp.md: | `site_add` | edit | what it does |
    const documented = new Map([...read('docs/mcp.md').matchAll(/^\| `(\w+)` \| (read|edit|owner) \|/gm)].map((m) => [m[1], m[2]]));
    expect([...documented.entries()].sort()).toEqual([...listed.entries()].sort());
  });

  it('name every route of the server, and no other', () => {
    const app = createApp({ version: '0.0.0', db: openDatabase(':memory:'), log: ignore, address: () => '192.0.2.1' });
    const routes = new Set(app.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} ${route.path}`));
    // Each route of docs/api.md has a heading: ### `GET /api/health`
    const documented = [...read('docs/api.md').matchAll(/^### `([A-Z]+ \/\S*)`$/gm)].map((m) => m[1]);
    expect(documented.sort()).toEqual([...routes].sort());
  });

  it('name every setting the server reads from its environment', () => {
    const settings = [...read('packages/host-server/src/main.ts').matchAll(/process\.env\['(HBOARD_\w+)'\]/g)].map((m) => m[1] ?? '');
    expect(settings.length).toBeGreaterThan(0);
    for (const setting of settings) {
      expect(read('.env.example'), setting).toContain(setting);
      expect(read('docs/server.md'), setting).toContain(`\`${setting}\``);
    }
    expect(read('compose.yaml')).toContain('${HBOARD_PORT:-8787}');
  });
});

it('has the version of the extension it belongs to', () => {
  const own = JSON.parse(read('packages/host-server/package.json')) as { version: string };
  const extension = JSON.parse(read('packages/host-extension/package.json')) as { version: string };
  expect(own.version).toBe(extension.version);
});
