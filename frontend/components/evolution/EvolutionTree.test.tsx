import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EvolutionTree, type EvolutionTreeCat } from "./EvolutionTree";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement("img", { src, alt }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("@/components/ui/x-icon", () => ({ default: () => null }));

afterEach(() => vi.unstubAllGlobals());

it("announces a modal, traps keyboard focus, and restores focus after Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  const cat: EvolutionTreeCat = {
    key: "kit",
    label: "Kit",
    name: "Kit",
    level: 0,
    branchLabel: null,
    archetype: null,
    additions: [],
    rolls: [],
    previewUrl: "/kit.png",
    href: "/view/kit",
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(React.createElement(EvolutionTree, { cats: [cat] })),
    );
    const preview = container.querySelector<HTMLButtonElement>(
      '[aria-label="Preview Kit"]',
    );
    if (!preview) throw new Error("Missing preview button");
    preview.focus();
    await act(async () => preview.click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("Missing preview dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
    ).toBe("Kit");
    const close = dialog.querySelector<HTMLButtonElement>("button");
    const link = dialog.querySelector<HTMLAnchorElement>("a");
    expect(document.activeElement).toBe(close);
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(link);
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
      ),
    );
    expect(document.activeElement).toBe(close);
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(preview);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
