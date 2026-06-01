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
});
