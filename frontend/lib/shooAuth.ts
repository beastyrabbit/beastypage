"use client";

import { useCallback } from "react";

// We lazily initialize the auth instance because @shoojs/react calls
// deriveRedirectUri at module scope, which crashes in Node/SSR.
// We guard with typeof window so the module is only imported in browsers.

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

let _auth: ShooAuth | null = null;

function getAuth(): ShooAuth {
  if (!_auth) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createShooConvexAuth } = require("@shoojs/react") as typeof import("@shoojs/react");
    _auth = createShooConvexAuth({ callbackPath: "/auth/callback" });
  }
  return _auth;
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
    getAuth().signIn({ requestPii: true });
  }, []);
}

/** Sign out via Shoo */
export function useSignOut() {
  return useCallback(() => {
    getAuth().signOut();
  }, []);
}
