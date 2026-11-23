import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } } },
});
