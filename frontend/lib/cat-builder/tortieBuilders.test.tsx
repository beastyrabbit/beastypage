import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";
import { GuidedBuilderClient } from "@/components/guided-builder/GuidedBuilderClient";
import { VisualBuilderClient } from "@/components/visual-builder/VisualBuilderClient";
import { VisualBuilderLoader } from "@/components/visual-builder/VisualBuilderLoader";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/data/cats", () => ({
  useCatCreate: () => vi.fn(),
  useCatProfile: () => ({
    id: "saved-before-161",
    cat_data: {
      params: {
        spriteNumber: 8,
        tortie: [
          { mask: "ONE", pattern: "SingleColour", colour: "GINGER" },
          { mask: "TWO", pattern: "Tabby", colour: "BLACK" },
          { colour: "GINGER", pattern: "SingleColour", mask: "ONE" },
        ],
      },
    },
  }),
}));
vi.mock("@/lib/useDefaultCreatorName", () => ({
  useDefaultCreatorName: () => "",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/cat-builder/hooks", () => {
  const options = {
    poseNames: [],
    pelts: ["SingleColour", "Tabby"],
    coatChoices: ["SingleColour", "Tabby"],
    points: [],
    vitiligo: [],
    whitePatches: [],
    eyeColours: ["YELLOW"],
    skinColours: ["PINK"],
    tints: [],
    whiteTints: [],
    tortieMasks: ["ONE", "TWO"],
    plantAccessories: [],
    wildAccessories: [],
    collarAccessories: [],
    scarBattle: [],
    scarMissing: [],
    scarEnvironmental: [],
  };
  const mapper = {
    getColours: () => ["WHITE", "GINGER"],
    getColourOptions: () => ["WHITE", "GINGER"],
    getExperimentalColoursByMode: () => ["WHITE"],
    getWhitePatchColourOptions: () => [],
  };
  return {
    useSpriteMapperOptions: () => ({
      options,
      mapper,
      loading: false,
      error: null,
    }),
    useCatGenerator: () => ({ generator: null, ready: false, error: null }),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function verifyBuilder(guided: boolean) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (name: string, scope: ParentNode = container) => {
    const button = Array.from(scope.querySelectorAll("button")).find(
      (entry) =>
        entry.getAttribute("aria-label") === name ||
        entry.textContent?.trim() === name,
    );
    if (!button) throw new Error(`Missing button: ${name}`);
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(
        React.createElement(guided ? GuidedBuilderClient : VisualBuilderClient),
      ),
    );
    if (guided) {
      await click("Next step");
      await click("Next step");
      await click("Disabled");
      await click("2 layers");
      await click("Next step");
      await click("Tortie layer 2 mask One");
    } else {
      await click("Enable tortie");
      await click("Add layer");
      const section = container.querySelector("#tortie");
      if (!section) throw new Error("Missing tortie section");
      await click("MaskCurrent: Two", section);
      await click("One", section);
    }
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("previous selection has been kept"),
    );
    if (guided) {
      expect(
        container.querySelector('[aria-label="Tortie layer 2 mask Two"]')
          ?.className,
      ).toContain("border-amber-400");
    } else {
      expect(container.textContent).toContain("Mask Two");
    }
    vi.mocked(toast.error).mockClear();
    if (guided) {
      await click("Tortie layer 2 colour White");
      await click("Tortie layer 2 mask One");
      await click("Tortie layer 2 colour Ginger");
    } else {
      const section = container.querySelector("#tortie");
      if (!section) throw new Error("Missing tortie section");
      await click("ColourCurrent: Ginger", section);
      await click("White", section);
      await click("MaskCurrent: Two", section);
      await click("One", section);
      await click("ColourCurrent: White", section);
      await click("Ginger", section);
    }
    expect(toast.error).toHaveBeenCalledOnce();
    vi.mocked(toast.error).mockClear();
    if (guided) {
      await click("Mood");
      expect(toast.error).toHaveBeenCalledOnce();
      vi.mocked(toast.error).mockClear();
      await click("Tortie layer 2 pattern Tabby");
      await click("Tortie layer 2 colour Ginger");
      await click("Tortie layer 2 pattern Singlecolour");
    } else {
      const section = container.querySelector("#tortie");
      if (!section) throw new Error("Missing tortie section");
      await click("PatternCurrent: Singlecolour", section);
      await click("Tabby", section);
      await click("ColourCurrent: White", section);
      await click("Ginger", section);
      await click("PatternCurrent: Tabby", section);
      await click("Singlecolour", section);
    }
    expect(toast.error).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

it("Guided Builder rejects a duplicate mask or colour and accepts a free combination", () =>
  verifyBuilder(true));
it("Visual Builder rejects a duplicate mask or colour and accepts a free combination", () =>
  verifyBuilder(false));

it("loads a stored cat with duplicate layers into two consistent editor rows", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        React.createElement(VisualBuilderLoader, { slug: "saved-before-161" }),
      ),
    );
    const rows = Array.from(
      container.querySelectorAll("#tortie button"),
    ).filter((button) => /^Layer \d/.test(button.textContent ?? ""));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Mask One");
    expect(rows[1].textContent).toContain("Mask Two");
    expect(toast.error).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
