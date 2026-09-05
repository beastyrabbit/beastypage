import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/browser/setup.mts",
  outputDir: "../.playwright-mcp/test-results",
  workers: 1,
  use: {
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    screenshot: "off",
  },
});
