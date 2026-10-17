import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => ({
  useAdoptionBatch: vi.fn(),
  useAncestryTree: vi.fn(),
  useCatProfile: vi.fn(),
}));

vi.mock("@/lib/data/cats", () => dataMocks);

import { AdoptionBatchClient } from "./adoption/AdoptionBatchClient";
import { EvolutionBatchClient } from "./evolution/EvolutionBatchClient";
import { VisualBuilderLoader } from "./visual-builder/VisualBuilderLoader";

async function renderText(element: ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

describe("missing-link states", () => {
  beforeEach(() => {
    dataMocks.useAdoptionBatch.mockReturnValue(null);
    dataMocks.useAncestryTree.mockReturnValue(null);
    dataMocks.useCatProfile.mockReturnValue(null);
  });

  it("renders the adoption not-found state in PostgreSQL mode", async () => {
    const { host, root } = await renderText(
      <AdoptionBatchClient slug="missing" />,
    );
    expect(host.textContent).toContain(
      "That adoption batch could not be found.",
    );
    root.unmount();
  });

  it("renders the evolution not-found state in PostgreSQL mode", async () => {
    const { host, root } = await renderText(
      <EvolutionBatchClient slug="missing" />,
    );
    expect(host.textContent).toContain(
      "That evolution batch could not be found.",
    );
    root.unmount();
  });

  it("renders the visual-builder not-found state in PostgreSQL mode", async () => {
    const { host, root } = await renderText(
      <VisualBuilderLoader slug="missing" />,
    );
    expect(host.textContent).toContain(
      "We couldn't find a cat with that link.",
    );
    root.unmount();
  });
});
