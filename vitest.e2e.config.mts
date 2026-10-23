import { defineConfig } from "vitest/config";

// HTTP tests against a running server (npm run dev / npm start). LOG_BASE_URL defaults to http://localhost:3100.
export default defineConfig({ test: { include: ["tests/e2e/**/*.test.ts"], testTimeout: 60_000, fileParallelism: false } });
