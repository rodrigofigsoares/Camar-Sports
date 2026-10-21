import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, proxy: {'/api': 'http://127.0.0.1:8787'} },
  build: { rollupOptions: { output: { manualChunks: {graph:['@xyflow/react'], validation:['zod']} } } },
  test: { include: ['src/**/*.test.ts','worker/**/*.test.ts'] },
});
