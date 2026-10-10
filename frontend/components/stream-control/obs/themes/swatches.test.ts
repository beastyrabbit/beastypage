import { describe, expect, it } from "vitest";
import type { SpriteMapperApi } from "@/components/cat-builder/types";
import { getColourSwatch } from "@/components/cat-builder/utils";
import { dmcCode, swatchForParam } from "./swatches";

const stubMapper = {
  getExperimentalColourDefinition: (name: string) =>
    name === "STUBCOLOUR" ? { multiply: [1, 2, 3] } : null,
} as unknown as SpriteMapperApi;

describe("swatchForParam", () => {
  it("uses the base colour swatches", () => {
    expect(swatchForParam("colour", "GINGER", null)).toBe("#f97316");
    expect(swatchForParam("colour", "GINGER", null)).toBe(
      getColourSwatch("GINGER", null),
    );
    expect(swatchForParam("colour", "grey", null)).toBe("#94a3b8");
  });

  it("uses the mapper's experimental colour multiply", () => {
    expect(swatchForParam("colour", "STUBCOLOUR", stubMapper)).toBe(
      "rgb(1, 2, 3)",
    );
  });

  it("returns null for unknown colours", () => {
    expect(swatchForParam("colour", "NOT_A_COLOUR_XYZ", null)).toBeNull();
  });

  it("maps tints to their multiply colour", () => {
    expect(swatchForParam("tint", "pink", null)).toBe("rgb(253, 237, 237)");
    expect(swatchForParam("whitePatchesTint", "cream", null)).toBe(
      "rgb(247, 241, 225)",
    );
    expect(swatchForParam("tint", "dilute", null)).toBeNull();
  });

  it("maps eye colours by name, then by sprite group", () => {
    expect(swatchForParam("eyeColour", "GREEN", null)).toBe("#5c9e4a");
    expect(swatchForParam("eyeColour2", "BLUE", null)).toBe("#4f8fd6");
    // SAGE has no override → green group colour.
    expect(swatchForParam("eyeColour", "SAGE", null)).toBe("#5c9e4a");
    expect(swatchForParam("eyeColour", "UNKNOWN", null)).toBeNull();
  });

  it("maps skin colours", () => {
    expect(swatchForParam("skinColour", "PINK", null)).toBe("#d99aa6");
  });

  it("returns null for none values and colourless traits", () => {
    expect(swatchForParam("colour", "none", null)).toBeNull();
    expect(swatchForParam("tint", undefined, null)).toBeNull();
    expect(swatchForParam("eyeColour2", null, null)).toBeNull();
    expect(swatchForParam("pelt", "Tabby", null)).toBeNull();
    expect(swatchForParam("sprite", "adult_short2", null)).toBeNull();
    expect(swatchForParam("accessory", "HOLLY", null)).toBeNull();
  });
});

describe("dmcCode", () => {
  it("is deterministic", () => {
    expect(dmcCode("colour", "GINGER")).toBe(dmcCode("colour", "GINGER"));
    expect(dmcCode("colour", "GINGER")).toMatch(/^\d+$/);
  });

  it("uses B5200 for white", () => {
    expect(dmcCode("colour", "WHITE")).toBe("B5200");
  });
});
