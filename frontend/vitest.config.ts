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
            "**/*.db.test.ts",
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
      {
        // Real PostgreSQL. Needs DATABASE_URL or `pnpm run db:local up`.
        extends: true,
        test: {
          name: "database",
          environment: "node",
          include: ["**/*.db.test.ts"],
          exclude: ["**/node_modules/**"],
          globalSetup: ["./tests/database.global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js resolves `server-only` to an empty module on the server;
      // tests run server code directly.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
});
