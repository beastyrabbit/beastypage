"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { MotionConfig } from "motion/react";
import { type ReactNode, useState } from "react";
import { PosthogProvider } from "@/components/posthog-provider";
import convex from "@/lib/convexClient";
import { BackendAuthProvider, DataBackendProvider } from "@/lib/data";
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
  const appContent = (
    <BackendAuthProvider>
      <MotionConfig reducedMotion="user">
        <PosthogProvider>{children}</PosthogProvider>
      </MotionConfig>
    </BackendAuthProvider>
  );
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      appearance={{ theme: shadcn }}
    >
      <QueryClientProvider client={queryClient}>
        <DataBackendProvider backend={backend}>
          {backend === "convex" ? (
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              {appContent}
            </ConvexProviderWithClerk>
          ) : (
            <ConvexProvider client={convex}>{appContent}</ConvexProvider>
          )}
        </DataBackendProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
