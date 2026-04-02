"use client";

import { createShooConvexAuth } from "@shoojs/react";

const SHOO_OPTIONS = { callbackPath: "/auth/callback", requestPii: true } as const;

let _shoo: ReturnType<typeof createShooConvexAuth> | null = null;

function getShoo() {
  if (!_shoo) {
    _shoo = createShooConvexAuth(SHOO_OPTIONS);
  }
  return _shoo;
}

export function useAuth() {
  if (typeof window === "undefined") {
    return {
      isLoading: true as const,
      isAuthenticated: false as const,
      fetchAccessToken: async (_args: { forceRefreshToken: boolean }) =>
        null as string | null,
    };
  }
  return getShoo().useAuth();
}

export function signIn() {
  return getShoo().signIn();
}

export function signOut() {
  return getShoo().signOut();
}
