"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
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
  const value = useMemo(
    () => ({ isLoading, isAuthenticated }),
    [isLoading, isAuthenticated],
  );
  return (
    <BackendAuthContext.Provider value={value}>
      {children}
    </BackendAuthContext.Provider>
  );
}

/**
 * Per-user queries (viewer, saved variants, stream sessions) are keyed
 * without the Clerk user, so a sign-in, sign-out or account switch resets the
 * query cache before the next paint instead of showing the previous user's
 * data. Resetting also cancels fetches still running with the old session.
 */
function useResetQueriesOnUserChange(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const previous = useRef(userId);
  useLayoutEffect(() => {
    if (userId === undefined) return;
    if (previous.current !== undefined && previous.current !== userId) {
      void queryClient.resetQueries();
    }
    previous.current = userId;
  }, [queryClient, userId]);
}

function ClerkBackendAuthProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useResetQueriesOnUserChange(userId);
  const value = useMemo(
    () => ({ isLoading: !isLoaded, isAuthenticated: isSignedIn === true }),
    [isLoaded, isSignedIn],
  );
  return (
    <BackendAuthContext.Provider value={value}>
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
