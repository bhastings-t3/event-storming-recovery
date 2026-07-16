import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// The SPA lives in src/web and builds to dist/web, which the es-view server serves.
// In dev, Vite runs on 5179 and proxies /api to the node API server on 5178.
export default defineConfig({
  root: path.join(root, 'src', 'web'),
  base: '/',
  plugins: [react()],
  build: {
    outDir: path.join(root, 'dist', 'web'),
    emptyOutDir: true,
  },
  server: {
    port: 5179,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:5178',
    },
  },
});
