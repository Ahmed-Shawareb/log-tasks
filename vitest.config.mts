import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Creates a fresh throw-away database per run and sets DATABASE_URL for the workers.
    globalSetup: ["tests/helpers/global-setup.ts"],
    env: { SESSION_SECRET: "test-session-secret-0123456789abcdef", APP_ENV: "test", APP_TIMEZONE: "Africa/Cairo" },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
