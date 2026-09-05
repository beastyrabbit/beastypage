import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  resolve: {
    alias: [
      {
        find: "@/lib/convexClient",
        replacement: resolve(import.meta.dirname, "services.ts"),
      },
      { find: "@", replacement: root },
      {
        find: "convex/react",
        replacement: resolve(import.meta.dirname, "services.ts"),
      },
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
  define: {
    "process.env.NEXT_PUBLIC_CONVEX_URL": JSON.stringify(
      "http://127.0.0.1:3210",
    ),
    "process.env.NEXT_PUBLIC_POSTHOG_KEY": "undefined",
  },
  server: { host: "127.0.0.1", port: 0 },
});
