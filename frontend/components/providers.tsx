"use client";

import { ConvexProviderWithAuth } from "convex/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import convex from "@/lib/convexClient";
import { useAuth, getShooClient } from "@/lib/shooAuth";
import { decodeIdentityClaims } from "@shoojs/react";
import { PosthogProvider } from "@/components/posthog-provider";

/**
 * Checks if the stored Shoo token is expired and silently triggers re-auth.
 * Shoo's createShooConvexAuth clears the identity on mount when expired,
 * logging the user out. By redirecting to Shoo BEFORE that happens, we
 * get a fresh token seamlessly (Shoo session is still active server-side).
 */
function useAutoReauth() {
  const [ready, setReady] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Don't run on the callback page — let handleCallback do its thing
    if (window.location.pathname === "/auth/callback") {
      setReady(true);
      return;
    }

    try {
      const client = getShooClient();
      const identity = client.getIdentity();
      if (!identity.token || !identity.userId) {
        // No token — not logged in, proceed normally
        setReady(true);
        return;
      }

      const claims = decodeIdentityClaims(identity.token);
      const exp = claims?.exp;
      if (typeof exp === "number" && exp * 1000 <= Date.now()) {
        // Token expired — silently redirect to Shoo for a fresh one
        void client.startSignIn();
        // Don't setReady — page will redirect
        return;
      }
    } catch {
      // If anything fails, just proceed
    }

    setReady(true);
  }, []);

  return ready;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const ready = useAutoReauth();

  if (!ready) {
    // Brief loading state while checking token / redirecting
    return null;
  }

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <PosthogProvider>{children}</PosthogProvider>
    </ConvexProviderWithAuth>
  );
}
