"use client";

import { useCallback, useMemo } from "react";
import {
  createShooConvexAuth,
  createShooAuth,
  decodeIdentityClaims,
  type ShooAuthClient,
} from "@shoojs/react";

type ConvexUseAuth = () => {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
};

type ShooAuth = {
  useAuth: ConvexUseAuth;
  signIn: (opts?: { requestPii?: boolean }) => void;
  signOut: () => void;
};

const SHOO_OPTIONS = { callbackPath: "/auth/callback", requestPii: true } as const;

let _auth: ShooAuth | null = null;
let _client: ShooAuthClient | null = null;

function getAuth(): ShooAuth {
  if (!_auth) {
    _auth = createShooConvexAuth(SHOO_OPTIONS);
  }
  return _auth;
}

/**
 * Return the shared ShooAuthClient singleton.
 * Used by the callback page to exchange the auth code and redirect,
 * ensuring a single client instance across the app.
 */
export function getShooClient(): ShooAuthClient {
  if (!_client) {
    _client = createShooAuth(SHOO_OPTIONS);
  }
  return _client;
}

/**
 * useAuth adapter for ConvexProviderWithAuth.
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

/** Sign in via Shoo */
export function useSignIn() {
  return useCallback(() => {
    getShooClient().clearIdentity();
    void getAuth().signIn();
  }, []);
}

/**
 * Read the profile picture URL from the Shoo JWT claims (client-side only).
 * Requires requestPii: true and user consent on the Shoo consent screen.
 */
export function useProfilePic(): string | undefined {
  const token =
    typeof window !== "undefined"
      ? getShooClient().getIdentity().token
      : undefined;
  return useMemo(() => {
    if (!token) return undefined;
    const claims = decodeIdentityClaims(token);
    return claims?.picture ?? undefined;
  }, [token]);
}

/** Sign out via Shoo */
export function useSignOut() {
  return useCallback(() => {
    getAuth().signOut();
  }, []);
}
