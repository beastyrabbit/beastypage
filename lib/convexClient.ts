import { ConvexReactClient } from "convex/react";

const DEFAULT_INTERNAL_URL = "http://127.0.0.1:3210";

const normalize = (value?: string | undefined | null) =>
  (value ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");

const SERVER_CONVEX_URL = normalize(
  process.env.CONVEX_SELF_HOSTED_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    DEFAULT_INTERNAL_URL
);

const PUBLIC_CONVEX_URL = normalize(process.env.NEXT_PUBLIC_CONVEX_URL ?? undefined);

const convexUrl = PUBLIC_CONVEX_URL.length ? PUBLIC_CONVEX_URL : SERVER_CONVEX_URL;

if (process.env.NODE_ENV === "development") {
  console.info("[convexClient] SERVER_CONVEX_URL:", SERVER_CONVEX_URL);
  console.info("[convexClient] PUBLIC_CONVEX_URL:", PUBLIC_CONVEX_URL);
  console.info("[convexClient] Using convex URL:", convexUrl);
}

export const CONVEX_HTTP_URL = convexUrl;

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
