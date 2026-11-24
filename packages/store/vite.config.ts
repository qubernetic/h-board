import { defineConfig } from 'vite';
import { bundleAnalysis } from '../../vite.shared';

export default defineConfig({
  plugins: [bundleAnalysis('h-board-store')],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
    rollupOptions: { external: [/^@h-board\//] },
  },
});
