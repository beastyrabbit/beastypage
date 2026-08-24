import { describe, expect, it } from "vitest";
import { decodeCatShare, encodeCatShare } from "@/lib/catShare";

describe("cat share codec", () => {
  it("preserves poseName through encode/decode", async () => {
    const encoded = encodeCatShare({
      params: {
        spriteNumber: 9,
        poseName: "adolescent_long2",
        peltName: "SingleColour",
        colour: "WHITE",
        eyeColour: "BLUE",
        skinColour: "PINK",
        isTortie: false,
        shading: false,
        reverse: false,
      },
    });

    const decoded = await decodeCatShare(encoded);
    expect(decoded?.params.poseName).toBe("adolescent_long2");
    expect(decoded?.params.spriteNumber).toBe(9);
  });

  it("preserves a derived coat pattern through encode/decode", async () => {
    const encoded = encodeCatShare({
      params: {
        spriteNumber: 8,
        poseName: "adult_short2",
        peltName: "SingleColour",
        coatPattern: "bengal-rosettes",
        colour: "GOLDEN",
      },
    });

    const decoded = await decodeCatShare(encoded);
    expect(decoded?.params.peltName).toBe("SingleColour");
    expect(decoded?.params.coatPattern).toBe("bengal-rosettes");
  });

  it("upgrades a legacy derived pelt when a share is rewritten", async () => {
    const legacyEncoded = encodeCatShare({
      params: {
        spriteNumber: 8,
        peltName: "bengal-rosettes",
        colour: "GOLDEN",
      },
    });
    const decoded = await decodeCatShare(legacyEncoded);
    if (!decoded) throw new Error("Expected the legacy share to decode");

    const rewritten = await decodeCatShare(encodeCatShare(decoded));
    expect(rewritten?.params.peltName).toBe("SingleColour");
    expect(rewritten?.params.coatPattern).toBe("bengal-rosettes");
  });
});
