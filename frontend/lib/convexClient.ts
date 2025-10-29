import { ConvexReactClient } from "convex/react";

const rawConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!rawConvexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL must be defined to initialize Convex.");
}

const convexUrl = rawConvexUrl.replace(/\/$/, "");

export const CONVEX_HTTP_URL = convexUrl;

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
