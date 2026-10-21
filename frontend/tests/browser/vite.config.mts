import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  // Keep Next's JSON catalog import working despite Vite's public-directory guard.
  plugins: [
    {
      name: "fixture-cat-catalog",
      resolveId(id) {
        if (id === "virtual:fixture-cat-catalog") return id;
      },
      load(id) {
        if (id === "virtual:fixture-cat-catalog")
          return `export default ${readFileSync(resolve(root, "public/cat-system/public-cat-catalog.json"), "utf8")}`;
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@/public/cat-system/public-cat-catalog.json",
        replacement: "virtual:fixture-cat-catalog",
      },
      {
        find: "next/navigation",
        replacement: resolve(import.meta.dirname, "services.ts"),
      },
      { find: "@", replacement: root },
      {
        find: "@clerk/nextjs",
        replacement: resolve(import.meta.dirname, "services.ts"),
      },
      {
        find: "next/link",
        replacement: resolve(import.meta.dirname, "link.tsx"),
      },
      {
        find: "next/image",
        replacement: resolve(import.meta.dirname, "image.tsx"),
      },
    ],
  },
  define: { "process.env.NEXT_PUBLIC_APP_ENV": "undefined" },
  server: {
    host: "127.0.0.1",
    port: 0,
    watch: { ignored: ["**/.next/**"] },
  },
});
