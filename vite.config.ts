import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: mode === "engine" ? "engine.html" : "index.html",
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
