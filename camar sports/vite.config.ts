import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createApi } from "./server/api";
export default defineConfig({
  resolve: {
    // As páginas em shared/ importam a camada de API específica de cada versão.
    alias: { "@app/api": fileURLToPath(new URL("./src/lib/api.ts", import.meta.url)) },
  },
  plugins: [
    react(),
    {
      name: "camar-local-api",
      configureServer(server) {
        const api = createApi();
        server.middlewares.use((req, res, next) => {
          void api.handle(req, res, next);
        });
        server.httpServer?.once("close", api.close);
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { graph: ["@xyflow/react"], validation: ["zod"] },
      },
    },
  },
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"] },
} as import("vitest/config").UserConfig);
