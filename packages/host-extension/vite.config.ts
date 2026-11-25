import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { bundleAnalysis } from '../../vite.shared';
import { zipBuild } from './src/pack';

const manifest = JSON.parse(readFileSync(new URL('public/manifest.json', import.meta.url), 'utf8')) as {
  version_name: string;
};

// Builds the unpacked extension into dist/: the pages, the service worker as background.js (the
// manifest names it), and public/ (manifest, icons) as is. Then zips dist/ into h-board-<version_name>.zip
// in this folder.
export default defineConfig({
  base: './',
  plugins: [bundleAnalysis('h-board-host-extension'), zipBuild(manifest.version_name)],
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        newtab: 'newtab.html',
        board: 'board.html',
        settings: 'settings.html',
        theme: 'theme.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
