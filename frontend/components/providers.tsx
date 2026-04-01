"use client";

import { ConvexProviderWithAuth } from "convex/react";
import { ReactNode } from "react";
import convex from "@/lib/convexClient";
import { useAuth } from "@/lib/shooAuth";
import { PosthogProvider } from "@/components/posthog-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <PosthogProvider>{children}</PosthogProvider>
    </ConvexProviderWithAuth>
  );
}
