import { describe, expect, it } from "vitest";
import {
  decodeCatShare,
  encodeCatShare,
  prepareCatShare,
} from "@/lib/catShare";

function encodeLegacyV1(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeStoredPayload(encoded: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

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
    const legacyEncoded = encodeLegacyV1({
      v: 1,
      params: {
        spriteNumber: 8,
        peltName: "bengal-rosettes",
        colour: "GOLDEN",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
      },
      slots: { accessories: [], scars: [], tortie: [] },
      counts: { accessories: 0, scars: 0, tortie: 0 },
    });
    const decoded = await decodeCatShare(legacyEncoded);
    if (!decoded) throw new Error("Expected the legacy share to decode");

    const rewritten = await decodeCatShare(encodeCatShare(decoded));
    expect(rewritten?.params.peltName).toBe("SingleColour");
    expect(rewritten?.params.coatPattern).toBe("bengal-rosettes");
  });

  it("writes a V1 hybrid payload readable by v7.3.1", () => {
    const encoded = encodeCatShare({
      params: {
        spriteNumber: 8,
        peltName: "SingleColour",
        colour: "WHITE",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
      },
    });
    const stored = decodeStoredPayload(encoded);

    expect(stored.v).toBe(1);
    expect(stored.document).toMatchObject({
      schemaVersion: 1,
      traits: { pose: "adult_short2", pelt: "SingleColour" },
    });
    expect(stored.params).toMatchObject({
      spriteNumber: 8,
      poseName: "adult_short2",
      peltName: "SingleColour",
      colour: "WHITE",
    });
  });

  it("prefers the embedded document in a hybrid payload", async () => {
    const stored = prepareCatShare({
      params: {
        spriteNumber: 8,
        peltName: "SingleColour",
        colour: "WHITE",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
      },
    });
    const encoded = encodeLegacyV1({
      ...stored,
      params: {
        ...stored.params,
        peltName: "Tabby",
        colour: "BLACK",
      },
    });

    const decoded = await decodeCatShare(encoded);
    expect(decoded?.document.traits.pelt).toBe("SingleColour");
    expect(decoded?.document.traits.colour).toBe("WHITE");
    expect(decoded?.params.peltName).toBe("SingleColour");
    expect(decoded?.params.colour).toBe("WHITE");
  });

  it("falls back to params for a legacy V1 payload without a document", async () => {
    const encoded = encodeLegacyV1({
      v: 1,
      params: {
        spriteNumber: 8,
        peltName: "Tabby",
        colour: "BLACK",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: true,
      },
      slots: {
        accessories: ["MAPLE LEAF", "none"],
        scars: ["ONE"],
        tortie: [],
      },
      counts: { accessories: 2, scars: 1, tortie: 0 },
    });

    const decoded = await decodeCatShare(encoded);
    expect(decoded?.document.traits).toMatchObject({
      pose: "adult_short2",
      pelt: "Tabby",
      colour: "BLACK",
      reverse: true,
    });
    expect(decoded?.accessorySlots).toEqual(["MAPLE LEAF", "none"]);
    expect(decoded?.scarSlots).toEqual(["ONE"]);
    expect(decoded?.counts).toMatchObject({
      accessories: 2,
      scars: 1,
      tortie: 0,
    });
  });

  it("preserves future traits and generic slots losslessly", async () => {
    const futureTrait = { side: "left", sprite: "EAR-FERN" };
    const encoded = encodeCatShare({
      params: {
        spriteNumber: 8,
        peltName: "SingleColour",
        colour: "WHITE",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
        earAccessory: futureTrait,
      },
      traitSlots: { earAccessory: [futureTrait] },
      counts: { earAccessory: 1 },
    });

    const decoded = await decodeCatShare(encoded);
    expect(decoded?.document.unknownTraits?.earAccessory).toEqual(futureTrait);
    expect(decoded?.traitSlots.earAccessory).toEqual([futureTrait]);
    expect(decoded?.traitCounts.earAccessory).toBe(1);

    const rewritten = await decodeCatShare(
      encodeCatShare(decoded ?? { params: {} }),
    );
    expect(rewritten?.document.unknownTraits?.earAccessory).toEqual(
      futureTrait,
    );
    expect(rewritten?.traitSlots.earAccessory).toEqual([futureTrait]);
  });
});
