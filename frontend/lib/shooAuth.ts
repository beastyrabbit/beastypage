"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createShooAuth,
  decodeIdentityClaims,
  type ShooAuthClient,
} from "@shoojs/react";

const SHOO_OPTIONS = { callbackPath: "/auth/callback", requestPii: true } as const;

let _client: ShooAuthClient | null = null;

/**
 * Return the shared ShooAuthClient singleton.
 * Used for callback handling, reading identity, and clearing tokens.
 */
export function getShooClient(): ShooAuthClient {
  if (!_client) {
    _client = createShooAuth(SHOO_OPTIONS);
  }
  return _client;
}

/**
 * Custom useAuth adapter for ConvexProviderWithAuth.
 *
 * Unlike createShooConvexAuth's built-in useAuth, this does NOT redirect
 * the browser when the token expires. Instead, it returns the token as long
 * as the identity exists in localStorage. Convex will reject expired tokens
 * server-side, but the user stays on the page. Re-authentication happens
 * explicitly via the sign-in button.
 */
export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || ran.current) return;
    ran.current = true;
    const client = getShooClient();
    // Handle OAuth callback if we're returning from Shoo
    client.handleCallback().finally(() => {
      const identity = client.getIdentity();
      setIsAuthenticated(identity.userId !== null && !!identity.token);
      setIsLoading(false);
    });
  }, []);

  const fetchAccessToken = useCallback(
    async (_args: { forceRefreshToken: boolean }) => {
      if (typeof window === "undefined") return null;
      try {
        const client = getShooClient();
        const identity = client.getIdentity();
        if (!identity.token || identity.userId === null) {
          setIsAuthenticated(false);
          return null;
        }
        // Always return the token — let Convex validate expiry server-side.
        // This prevents disruptive browser redirects on token expiry.
        setIsAuthenticated(true);
        return identity.token;
      } catch {
        setIsAuthenticated(false);
        return null;
      }
    },
    [],
  );

  if (typeof window === "undefined") {
    return {
      isLoading: true as const,
      isAuthenticated: false as const,
      fetchAccessToken: async (_args: { forceRefreshToken: boolean }) =>
        null as string | null,
    };
  }

  return { isLoading, isAuthenticated, fetchAccessToken };
}

/** Sign in via Shoo, clearing any existing identity first to force a fresh flow. */
export function useSignIn() {
  return useCallback(() => {
    const client = getShooClient();
    client.clearIdentity();
    void client.startSignIn();
  }, []);
}

/**
 * Read the profile picture URL from the Shoo JWT claims (client-side only).
 * Requires requestPii: true and user consent on the Shoo consent screen.
 * Returns undefined when no token is available or the user declined PII consent.
 */
export function useProfilePic(): string | undefined {
  let token: string | undefined;
  if (typeof window !== "undefined") {
    try {
      token = getShooClient().getIdentity().token;
    } catch {
      token = undefined;
    }
  }
  return useMemo(() => {
    if (!token) return undefined;
    try {
      const claims = decodeIdentityClaims(token);
      return claims?.picture ?? undefined;
    } catch {
      return undefined;
    }
  }, [token]);
}

/** Sign out via Shoo */
export function useSignOut() {
  return useCallback(() => {
    const client = getShooClient();
    client.clearIdentity();
    window.location.reload();
  }, []);
}
