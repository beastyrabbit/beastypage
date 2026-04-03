"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
import { PosthogProvider } from "@/components/posthog-provider";
import convex from "@/lib/convexClient";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      appearance={{ theme: shadcn }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <PosthogProvider>{children}</PosthogProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
