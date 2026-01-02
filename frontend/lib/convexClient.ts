import { ConvexReactClient } from "convex/react";

import { requireClientConvexUrl } from "@/lib/convexUrl";

const convexUrl = requireClientConvexUrl();

export const CONVEX_HTTP_URL = convexUrl;

export const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export default convex;
