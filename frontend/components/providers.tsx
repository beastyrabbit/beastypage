"use client";

import { ConvexProviderWithAuth } from "convex/react";
import type { ReactNode } from "react";
import { PosthogProvider } from "@/components/posthog-provider";
import convex from "@/lib/convexClient";
import { useAuth } from "@/lib/shooAuth";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <PosthogProvider>{children}</PosthogProvider>
    </ConvexProviderWithAuth>
  );
}
