import { ConvexReactClient } from "convex/react";

const PROXIED_CONVEX_PATH = "/api/convex";
const SERVER_CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL;

if (!SERVER_CONVEX_URL) {
  throw new Error("CONVEX_SELF_HOSTED_URL must be defined in the container environment.");
}

function resolveConvexUrl(): string {
  if (typeof window === "undefined") {
    return SERVER_CONVEX_URL;
  }
  return `${window.location.origin}${PROXIED_CONVEX_PATH}`;
}

function resolveHttpUrl(): string {
  if (typeof window === "undefined") {
    return SERVER_CONVEX_URL.replace(/\/$/, "");
  }
  return `${window.location.origin}${PROXIED_CONVEX_PATH}`.replace(/\/$/, "");
}

const convexUrl = resolveConvexUrl();

export const CONVEX_HTTP_URL = resolveHttpUrl();

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
