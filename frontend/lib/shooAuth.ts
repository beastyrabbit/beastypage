"use client";

import { useCallback, useMemo } from "react";
import {
  createShooConvexAuth,
  createShooAuth,
  decodeIdentityClaims,
  type ShooAuthClient,
} from "@shoojs/react";

const SHOO_OPTIONS = { callbackPath: "/auth/callback", requestPii: true } as const;

let _auth: ReturnType<typeof createShooConvexAuth> | null = null;
let _client: ShooAuthClient | null = null;

function getAuth() {
  if (!_auth) {
    _auth = createShooConvexAuth(SHOO_OPTIONS);
  }
  return _auth;
}

/**
 * Return a shared ShooAuthClient for direct operations
 * (callback handling, reading identity, clearing tokens).
 * Separate from the Convex auth adapter returned by getAuth(),
 * which creates its own internal client. Both share localStorage.
 */
export function getShooClient(): ShooAuthClient {
  if (!_client) {
    _client = createShooAuth(SHOO_OPTIONS);
  }
  return _client;
}

/**
 * useAuth adapter for ConvexProviderWithAuth.
 * Returns a static stub during SSR (where the Shoo client cannot run)
 * and delegates to the real Shoo auth on the client.
 */
export function useAuth() {
  if (typeof window === "undefined") {
    return {
      isLoading: true as const,
      isAuthenticated: false as const,
      fetchAccessToken: async (_args: { forceRefreshToken: boolean }) =>
        null as string | null,
    };
  }
  return getAuth().useAuth();
}

/** Sign in via Shoo, clearing any existing identity first to force a fresh flow. */
export function useSignIn() {
  return useCallback(() => {
    getShooClient().clearIdentity();
    void getAuth().signIn();
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
      // Corrupted localStorage — treat as no token
      token = undefined;
    }
  }
  return useMemo(() => {
    if (!token) return undefined;
    try {
      const claims = decodeIdentityClaims(token);
      return claims?.picture ?? undefined;
    } catch {
      // Malformed JWT — don't crash the component tree
      return undefined;
    }
  }, [token]);
}

/** Sign out via Shoo */
export function useSignOut() {
  return useCallback(() => {
    getAuth().signOut();
  }, []);
}
