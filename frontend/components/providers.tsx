"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { type ReactNode, useState } from "react";
import { TelemetryProvider } from "@/components/telemetry-provider";
import { BackendAuthProvider } from "@/lib/data";

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

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  // One cache per browser session, and per request during SSR, so cached
  // data never crosses users on the server.
  const [queryClient] = useState(makeQueryClient);
  const appContent = (
    <BackendAuthProvider>
      <MotionConfig reducedMotion="user">
        <TelemetryProvider>{children}</TelemetryProvider>
      </MotionConfig>
    </BackendAuthProvider>
  );
  return (
    <ClerkProvider
      telemetry={false}
      publishableKey={clerkPublishableKey}
      appearance={{ theme: shadcn, elements: { rootBox: "rr-block" } }}
    >
      <QueryClientProvider client={queryClient}>
        {appContent}
      </QueryClientProvider>
    </ClerkProvider>
  );
}
