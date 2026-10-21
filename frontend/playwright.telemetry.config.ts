import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/telemetry",
  testMatch: "**/*.spec.ts",
  outputDir: "../.playwright-mcp/telemetry-results",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4319",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    screenshot: "off",
  },
  webServer: {
    command: "pnpm exec next start --hostname 127.0.0.1 --port 4319",
    url: "http://127.0.0.1:4319/projects",
    reuseExistingServer: false,
    env: { JOBS_ENABLED: "0" },
    timeout: 60_000,
  },
});
