import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createApi } from "./server/api";
export default defineConfig({
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
