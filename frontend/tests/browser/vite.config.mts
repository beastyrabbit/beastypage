import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  resolve: {
    alias: [
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
  define: { "process.env.NEXT_PUBLIC_POSTHOG_KEY": "undefined" },
  server: {
    host: "127.0.0.1",
    port: 0,
    watch: { ignored: ["**/.next/**"] },
  },
});
