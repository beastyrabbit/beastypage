import { ConvexReactClient } from "convex/react";

const PROXIED_CONVEX_PATH = "/api/convex";
const DEFAULT_INTERNAL_URL = "http://127.0.0.1:3210";

const SERVER_CONVEX_URL =
  process.env.CONVEX_SELF_HOSTED_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  DEFAULT_INTERNAL_URL;

const PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || undefined;

function resolveConvexUrl(): string {
  if (typeof window === "undefined") {
    return SERVER_CONVEX_URL.replace(/\/$/, "");
  }
  if (PUBLIC_CONVEX_URL) {
    return PUBLIC_CONVEX_URL.replace(/\/$/, "");
  }
  return `${window.location.origin}${PROXIED_CONVEX_PATH}`.replace(/\/$/, "");
}

const convexUrl = resolveConvexUrl();

export const CONVEX_HTTP_URL = convexUrl;

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
