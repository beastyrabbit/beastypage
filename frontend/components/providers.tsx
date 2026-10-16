"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { MotionConfig } from "motion/react";
import { type ReactNode, useState } from "react";
import { PosthogProvider } from "@/components/posthog-provider";
import convex from "@/lib/convexClient";
import { DataBackendProvider } from "@/lib/data/backend";
import type { DataBackend } from "@/server/backend";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status =
            error && typeof error === "object" && "status" in error
              ? error.status
              : undefined;
          if (typeof status === "number" && status >= 400 && status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be defined. Add it to .env.local or your deployment environment.",
  );
}

export function AppProviders({
  children,
  backend,
}: Readonly<{ children: ReactNode; backend: DataBackend }>) {
  // One cache per browser session, and per request during SSR, so cached
  // data never crosses users on the server.
  const [queryClient] = useState(makeQueryClient);
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      appearance={{ theme: shadcn }}
    >
      <QueryClientProvider client={queryClient}>
        <DataBackendProvider backend={backend}>
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <MotionConfig reducedMotion="user">
              <PosthogProvider>{children}</PosthogProvider>
            </MotionConfig>
          </ConvexProviderWithClerk>
        </DataBackendProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
