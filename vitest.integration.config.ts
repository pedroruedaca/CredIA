import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Integration tests against a local Supabase (`npx supabase start`). Not part of `npm test`. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 60_000, hookTimeout: 120_000, fileParallelism: false },
});
