import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendAuthProvider, useBackendAuth } from "./auth";
import { DataBackendProvider } from "./backend";

const authMocks = vi.hoisted(() => ({
  convex: vi.fn(() => ({ isLoading: true, isAuthenticated: false })),
  clerk: vi.fn(
    (): { isLoaded: boolean; isSignedIn: boolean; userId?: string | null } => ({
      isLoaded: false,
      isSignedIn: false,
    }),
  ),
}));

vi.mock("convex/react", () => ({ useConvexAuth: authMocks.convex }));
vi.mock("@clerk/nextjs", () => ({ useAuth: authMocks.clerk }));

function Probe({ onValue }: Readonly<{ onValue: (value: unknown) => void }>) {
  onValue(useBackendAuth());
  return null;
}

function renderProbe(
  backend: "convex" | "postgres",
  onValue: (value: unknown) => void,
  queryClient = new QueryClient(),
) {
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = () =>
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DataBackendProvider backend={backend}>
            <BackendAuthProvider>
              <Probe onValue={onValue} />
            </BackendAuthProvider>
          </DataBackendProvider>
        </QueryClientProvider>,
      );
    });
  render();
  return Object.assign(root, { rerender: render });
}

describe("useBackendAuth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves Convex auth state in Convex mode", () => {
    authMocks.convex.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    const values: unknown[] = [];
    const root = renderProbe("convex", (value) => values.push(value));

    expect(values.at(-1)).toEqual({
      isLoading: false,
      isAuthenticated: true,
    });
    expect(authMocks.convex).toHaveBeenCalledTimes(1);
    expect(authMocks.clerk).not.toHaveBeenCalled();
    root.unmount();
  });

  it("uses Clerk auth in PostgreSQL mode while Convex auth is loading", () => {
    authMocks.convex.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });
    authMocks.clerk.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const values: unknown[] = [];
    const root = renderProbe("postgres", (value) => values.push(value));

    expect(values.at(-1)).toEqual({
      isLoading: false,
      isAuthenticated: true,
    });
    expect(authMocks.convex).not.toHaveBeenCalled();
    expect(authMocks.clerk).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("reports Clerk loading and signed-out states in PostgreSQL mode", () => {
    authMocks.clerk.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const values: unknown[] = [];
    const root = renderProbe("postgres", (value) => values.push(value));

    expect(values.at(-1)).toEqual({
      isLoading: true,
      isAuthenticated: false,
    });
    root.unmount();
  });

  it("drops cached per-user data when the Clerk user changes", () => {
    const queryClient = new QueryClient();
    const viewerKey = ["users.viewer"];
    authMocks.clerk.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_a",
    });
    const root = renderProbe("postgres", () => {}, queryClient);
    queryClient.setQueryData(viewerKey, { username: "a" });

    root.rerender();
    expect(queryClient.getQueryData(viewerKey)).toEqual({ username: "a" });

    authMocks.clerk.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_b",
    });
    root.rerender();
    expect(queryClient.getQueryData(viewerKey)).toBeUndefined();

    queryClient.setQueryData(viewerKey, { username: "b" });
    authMocks.clerk.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
    });
    root.rerender();
    expect(queryClient.getQueryData(viewerKey)).toBeUndefined();
    root.unmount();
  });
});
