"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { createContext, type ReactNode, useContext } from "react";
import { useDataBackend } from "./backend";

export type BackendAuth = {
  isLoading: boolean;
  isAuthenticated: boolean;
};

const BackendAuthContext = createContext<BackendAuth | undefined>(undefined);

function ConvexBackendAuthProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <BackendAuthContext.Provider value={{ isLoading, isAuthenticated }}>
      {children}
    </BackendAuthContext.Provider>
  );
}

function ClerkBackendAuthProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { isLoaded, isSignedIn } = useAuth();
  return (
    <BackendAuthContext.Provider
      value={{
        isLoading: !isLoaded,
        isAuthenticated: isSignedIn === true,
      }}
    >
      {children}
    </BackendAuthContext.Provider>
  );
}

export function BackendAuthProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const backend = useDataBackend();
  return backend === "convex" ? (
    <ConvexBackendAuthProvider>{children}</ConvexBackendAuthProvider>
  ) : (
    <ClerkBackendAuthProvider>{children}</ClerkBackendAuthProvider>
  );
}

/**
 * Read authentication from the active data backend.
 *
 * PostgreSQL mode uses Clerk state, while Convex mode preserves the existing
 * Convex auth state. The provider boundary keeps the unselected auth hook out
 * of the render tree, so PostgreSQL can use a plain ConvexProvider.
 */
export function useBackendAuth(): BackendAuth {
  const auth = useContext(BackendAuthContext);
  if (!auth) {
    throw new Error("useBackendAuth must be used inside BackendAuthProvider");
  }
  return auth;
}
