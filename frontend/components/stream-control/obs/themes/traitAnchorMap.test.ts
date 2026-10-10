import { describe, expect, it } from "vitest";
import { PARAM_SEQUENCE } from "../spinSupport";
import { ANCHOR_IDS } from "./spriteAnchors";
import { anchorForParam, TRAIT_ANCHOR } from "./traitAnchorMap";

describe("traitAnchorMap", () => {
  it("maps every reveal param to a valid anchor", () => {
    expect(PARAM_SEQUENCE.length).toBeGreaterThan(0);
    for (const def of PARAM_SEQUENCE) {
      expect(ANCHOR_IDS).toContain(anchorForParam(def.id));
    }
  });

  it("only uses known anchors in the explicit table", () => {
    for (const anchor of Object.values(TRAIT_ANCHOR)) {
      expect(ANCHOR_IDS).toContain(anchor);
    }
  });

  it("falls back to the pelt for unknown params", () => {
    expect(anchorForParam("somethingNew")).toBe("pelt");
  });
});
