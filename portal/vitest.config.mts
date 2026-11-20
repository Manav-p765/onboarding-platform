import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Unit tests run against a throwaway database in the temp folder.
const dataDir = path.join(os.tmpdir(), `portal-unit-${process.pid}-${Date.now()}`);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    env: {
      DATA_DIR: dataDir,
      ENCRYPTION_KEY: "a".repeat(64),
      APP_URL: "https://onboard.example.test",
    },
  },
});
