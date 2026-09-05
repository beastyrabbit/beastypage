import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
            "**/.next/**",
            "tests/cat-v3/render.spec.ts",
            "tests/browser/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "node",
          include: ["tests/cat-v3/render.spec.ts"],
          globalSetup: ["./tests/renderer.global-setup.ts"],
        },
      },
    ],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
