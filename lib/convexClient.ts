import { ConvexReactClient } from "convex/react";

const DEFAULT_INTERNAL_URL = "http://127.0.0.1:3210";

const SERVER_CONVEX_URL =
  process.env.CONVEX_SELF_HOSTED_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  DEFAULT_INTERNAL_URL;

const PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || undefined;

const convexUrl = (PUBLIC_CONVEX_URL || SERVER_CONVEX_URL).replace(/\/$/, "");

export const CONVEX_HTTP_URL = convexUrl;

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
