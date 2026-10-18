"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

export type BackendAuth = {
  isLoading: boolean;
  isAuthenticated: boolean;
};

const BackendAuthContext = createContext<BackendAuth | undefined>(undefined);

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
  return <ClerkBackendAuthProvider>{children}</ClerkBackendAuthProvider>;
}

/**
 * Read authentication from the active data backend.
 *
 * Authentication is provided by Clerk for all frontend data requests.
 */
export function useBackendAuth(): BackendAuth {
  const auth = useContext(BackendAuthContext);
  if (!auth) {
    throw new Error("useBackendAuth must be used inside BackendAuthProvider");
  }
  return auth;
}
