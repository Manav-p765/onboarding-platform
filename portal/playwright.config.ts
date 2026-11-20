import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Every run starts from an empty database (fresh folder; workers inherit the same value).
process.env.E2E_DATA_DIR ??= path.join(os.tmpdir(), `portal-e2e-${Date.now()}`);
const PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // tests build on each other (setup → client → review)
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/e2e-report" }]],
  outputDir: "test-results/e2e-artifacts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`, // run "npm run build" first (npm run test:e2e does)
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATA_DIR: process.env.E2E_DATA_DIR,
      ENCRYPTION_KEY: "b".repeat(64),
      APP_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});
