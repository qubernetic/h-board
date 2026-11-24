import { defineConfig } from 'vite';
import { bundleAnalysis } from '../../vite.shared';

// Builds the unpacked extension into dist/: the pages, the service worker as background.js (the
// manifest names it), and public/ (manifest, icons) as is.
export default defineConfig({
  base: './',
  plugins: [bundleAnalysis('h-board-host-extension')],
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
