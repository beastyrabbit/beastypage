import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import { DataBackendProvider } from "./backend";
import { useDataMutation, useDataQuery } from "./hooks";

const convexMocks = vi.hoisted(() => ({
  query: vi.fn(() => undefined),
  mutation: vi.fn(() => vi.fn(async () => ({ from: "convex" }))),
  paginated: vi.fn(() => ({
    results: [],
    status: "LoadingFirstPage",
    isLoading: true,
    loadMore: vi.fn(),
  })),
}));

const queryRef = {} as FunctionReference<
  "query",
  "public",
  { id: string },
  { id: string }
>;
const mutationRef = {} as FunctionReference<
  "mutation",
  "public",
  { id: string },
  { ok: boolean }
>;

vi.mock("convex/react", () => ({
  useQuery: convexMocks.query,
  useMutation: convexMocks.mutation,
  usePaginatedQuery: convexMocks.paginated,
}));

function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <DataBackendProvider backend="postgres">{children}</DataBackendProvider>
    </QueryClientProvider>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("dual-path data hooks", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses TanStack Query for PostgreSQL and keeps loading undefined", async () => {
    const values: unknown[] = [];
    function Probe() {
      values.push(
        useDataQuery(
          queryRef,
          { id: "cat-1" },
          {
            queryKey: ["data", "cat", "cat-1"],
            queryFn: async () => ({ id: "cat-1" }),
          },
        ),
      );
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <Providers>
          <Probe />
        </Providers>,
      ),
    );
    expect(values[0]).toBeUndefined();
    await settle();
    expect(values.at(-1)).toEqual({ id: "cat-1" });
    expect(convexMocks.query).toHaveBeenCalledWith({}, "skip");
    root.unmount();
  });

  it("returns a PostgreSQL mutation function and invalidates its keys", async () => {
    const save = vi.fn(async () => ({ ok: true }));
    let mutate: ((args: { id: string }) => Promise<unknown>) | undefined;
    function Probe() {
      mutate = useDataMutation(mutationRef, {
        mutationFn: save,
        invalidate: [["data", "cats"]],
      });
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <Providers>
          <Probe />
        </Providers>,
      ),
    );
    await act(async () => {
      await expect(mutate?.({ id: "cat-1" })).resolves.toEqual({ ok: true });
    });
    expect(save).toHaveBeenCalledWith({ id: "cat-1" }, expect.any(AbortSignal));
    expect(convexMocks.mutation).toHaveBeenCalled();
    root.unmount();
  });
});
