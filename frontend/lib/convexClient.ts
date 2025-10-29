import { ConvexReactClient } from "convex/react";

const PROXIED_CONVEX_PATH = "/api/convex";

function getServerConvexUrl(): string {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  if (!url) {
    throw new Error("CONVEX_SELF_HOSTED_URL must be defined in the container environment.");
  }
  return url.replace(/\/$/, "");
}

function resolveConvexUrl(): string {
  if (typeof window === "undefined") {
    return getServerConvexUrl();
  }
  return `${window.location.origin}${PROXIED_CONVEX_PATH}`;
}

function resolveHttpUrl(): string {
  if (typeof window === "undefined") {
    return getServerConvexUrl();
  }
  return `${window.location.origin}${PROXIED_CONVEX_PATH}`.replace(/\/$/, "");
}

const convexUrl = resolveConvexUrl();

export const CONVEX_HTTP_URL = resolveHttpUrl();

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
