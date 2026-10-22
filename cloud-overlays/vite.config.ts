import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    // As páginas em shared/ importam a camada de API específica de cada versão.
    alias: { '@app/api': fileURLToPath(new URL('./src/lib/api.ts', import.meta.url)) },
  },
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, proxy: {'/api': 'http://127.0.0.1:8787'} },
  build: { rollupOptions: { output: { manualChunks: {graph:['@xyflow/react'], validation:['zod']} } } },
  test: { include: ['src/**/*.test.ts','worker/**/*.test.ts'] },
});
