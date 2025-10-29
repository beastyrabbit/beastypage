"use client";

import { ConvexProvider } from "convex/react";
import { ReactNode } from "react";
import convex from "@/lib/convexClient";
import { PosthogProvider } from "@/components/posthog-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <PosthogProvider>{children}</PosthogProvider>
    </ConvexProvider>
  );
}
