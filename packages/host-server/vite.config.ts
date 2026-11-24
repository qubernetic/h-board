import { defineConfig } from 'vite';

// Builds the server into one file, dist/main.js. The workspace packages are bundled in; the
// packages from npm (hono, better-sqlite3 with its native part) stay imports.
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    target: 'node22',
  },
});
