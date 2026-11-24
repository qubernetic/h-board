import { Hono } from 'hono';

export interface AppOptions {
  /** The server's version, shown by the health route. */
  readonly version: string;
}

/** The HTTP application. Everything the server answers lives under `/api`. */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true, version: options.version }));
  return app;
}
