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

const dialogMethods = Object.fromEntries(
  ["showModal", "close"].map((method) => [
    method,
    Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method),
  ]),
);
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [method, descriptor] of Object.entries(dialogMethods)) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, method, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  }
});

it("opens a named native modal and restores focus after cancellation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  const closeModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: showModal },
    close: { configurable: true, value: closeModal },
  });
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

    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    if (!dialog) throw new Error("Missing preview dialog");
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(
      document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
    ).toBe("Kit");
    const close = dialog.querySelector<HTMLButtonElement>(
      "button:not([tabindex='-1'])",
    );
    expect(document.activeElement).toBe(close);
    await act(async () =>
      dialog.dispatchEvent(new Event("cancel", { cancelable: true })),
    );
    expect(container.querySelector("dialog")).toBeNull();
    expect(closeModal).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(preview);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
