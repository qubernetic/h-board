// The server's entry point: wiring only. It reads the environment, opens the database on the data
// volume and listens.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import pkg from '../package.json' with { type: 'json' };
import { clientAddress } from './address';
import { createApp } from './app';
import { openDatabase } from './db';

const port = Number(process.env['PORT'] ?? 8787);
const dataDir = process.env['HBOARD_DATA_DIR'] ?? './data';
const trustProxy = process.env['HBOARD_TRUST_PROXY'] === '1';

mkdirSync(dataDir, { recursive: true });
const db = openDatabase(join(dataDir, 'h-board.sqlite'));
const app = createApp({
  version: pkg.version,
  db,
  log: (line) => {
    console.log(line);
  },
  address: (c) => clientAddress(c, trustProxy),
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`h-board server ${pkg.version} listening on port ${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
