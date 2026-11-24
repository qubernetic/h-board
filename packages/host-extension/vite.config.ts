import { defineConfig } from 'vite';
import { bundleAnalysis } from '../../vite.shared';

// Builds the unpacked extension into dist/: the two pages, and public/ (manifest, icons) as is.
export default defineConfig({
  base: './',
  plugins: [bundleAnalysis('h-board-host-extension')],
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: { input: ['newtab.html', 'board.html'] },
  },
});
