import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendAuthProvider, useBackendAuth } from "./auth";
import { DataBackendProvider } from "./backend";

const authMocks = vi.hoisted(() => ({
  convex: vi.fn(() => ({ isLoading: true, isAuthenticated: false })),
  clerk: vi.fn(() => ({ isLoaded: false, isSignedIn: false })),
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
) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => {
    root.render(
      <DataBackendProvider backend={backend}>
        <BackendAuthProvider>
          <Probe onValue={onValue} />
        </BackendAuthProvider>
      </DataBackendProvider>,
    );
  });
  return root;
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
});
