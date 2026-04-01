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
 */
export function getShooClient(): ShooAuthClient {
  if (!_client) {
    _client = createShooAuth(SHOO_OPTIONS);
  }
  return _client;
}

/**
 * useAuth adapter for ConvexProviderWithAuth.
 * Returns a static stub during SSR and delegates to Shoo on the client.
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

/** Sign in via Shoo. */
export function useSignIn() {
  return useCallback(() => {
    void getAuth().signIn();
  }, []);
}

/**
 * Read the profile picture URL from the Shoo JWT claims (client-side only).
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

/** Sign out via Shoo. */
export function useSignOut() {
  return useCallback(() => {
    getAuth().signOut();
  }, []);
}
