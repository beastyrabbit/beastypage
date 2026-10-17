import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataBackendProvider } from "@/lib/data/backend";

const convexMocks = vi.hoisted(() => ({
  query: vi.fn(() => undefined),
  mutation: vi.fn(() => vi.fn()),
  paginated: vi.fn(() => ({
    results: [],
    status: "LoadingFirstPage",
    isLoading: true,
    loadMore: vi.fn(),
  })),
}));

vi.mock("convex/react", () => ({
  useQuery: convexMocks.query,
  useMutation: convexMocks.mutation,
  usePaginatedQuery: convexMocks.paginated,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { AncestryTreeViewClient } from "../app/ancestry-tree/[slug]/AncestryTreeViewClient";
import { AdoptionBatchClient } from "./adoption/AdoptionBatchClient";
import { EvolutionBatchClient } from "./evolution/EvolutionBatchClient";
import { ViewerClient } from "./single-cat/ViewerClient";
import { VisualBuilderLoader } from "./visual-builder/VisualBuilderLoader";

function Providers({ children }: Readonly<{ children: ReactElement }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <DataBackendProvider backend="postgres">{children}</DataBackendProvider>
    </QueryClientProvider>
  );
}

async function renderText(element: ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => {
    root.render(<Providers>{element}</Providers>);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { host, root };
}

describe("missing-link states", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ code: "not_found", error: "Missing" }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the cat viewer not-found state through the PostgreSQL hook", async () => {
    const { host, root } = await renderText(<ViewerClient slug="missing" />);
    expect(host.textContent).toContain("No cat found for that link.");
    root.unmount();
  });

  it("renders the adoption not-found state through the PostgreSQL hook", async () => {
    const { host, root } = await renderText(
      <AdoptionBatchClient slug="missing" />,
    );
    expect(host.textContent).toContain(
      "That adoption batch could not be found.",
    );
    root.unmount();
  });

  it("renders the evolution not-found state through the PostgreSQL hook", async () => {
    const { host, root } = await renderText(
      <EvolutionBatchClient slug="missing" />,
    );
    expect(host.textContent).toContain(
      "That evolution batch could not be found.",
    );
    root.unmount();
  });

  it("renders the ancestry not-found state through the PostgreSQL hook", async () => {
    const { host, root } = await renderText(
      <AncestryTreeViewClient slug="missing" />,
    );
    expect(host.textContent).toContain(
      "That ancestry tree could not be found.",
    );
    root.unmount();
  });

  it("renders the visual-builder not-found state through the PostgreSQL hook", async () => {
    const { host, root } = await renderText(
      <VisualBuilderLoader slug="missing" />,
    );
    expect(host.textContent).toContain(
      "We couldn't find a cat with that link.",
    );
    root.unmount();
  });
});
