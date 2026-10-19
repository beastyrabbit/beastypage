import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCatShare,
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

// Captured from the pre-cleanup encoder. Keep this fixed to detect wire changes.
const existingHybridShare =
  "eyJ2IjoxLCJkb2N1bWVudCI6eyJzY2hlbWFWZXJzaW9uIjoxLCJ0cmFpdHMiOnsicG9zZSI6ImFkdWx0X3Nob3J0MiIsInBlbHQiOiJTaW5nbGVDb2xvdXIiLCJjb2xvdXIiOiJXSElURSIsInRvcnRpZSI6W10sInRpbnQiOiJub25lIiwiZXllQ29sb3VyIjoiQkxVRSIsInNjYXJzIjpbXSwic2hhZGluZyI6ZmFsc2UsImxpZ2h0aW5nIjpmYWxzZSwiZGFya0ZvcmVzdCI6ZmFsc2UsImRlYWQiOmZhbHNlLCJza2luQ29sb3VyIjoiUElOSyIsImFjY2Vzc29yaWVzIjpbXSwicmV2ZXJzZSI6ZmFsc2V9LCJ1bmtub3duVHJhaXRzIjp7ImZ1dHVyZSI6eyJsYWJlbCI6Ik3DpHVzZSDwn5CIIiwibmVzdGVkIjpbbnVsbCx0cnVlLDNdfSwic3ByaXRlTnVtYmVyIjo4fX0sInBhcmFtcyI6eyJmdXR1cmUiOnsibGFiZWwiOiJNw6R1c2Ug8J+QiCIsIm5lc3RlZCI6W251bGwsdHJ1ZSwzXX0sInNwcml0ZU51bWJlciI6OCwicG9zZU5hbWUiOiJhZHVsdF9zaG9ydDIiLCJwZWx0TmFtZSI6IlNpbmdsZUNvbG91ciIsImNvbG91ciI6IldISVRFIiwidG9ydGllIjpbXSwiaXNUb3J0aWUiOmZhbHNlLCJ0aW50Ijoibm9uZSIsImV5ZUNvbG91ciI6IkJMVUUiLCJzY2FycyI6W10sInNoYWRpbmciOmZhbHNlLCJsaWdodGluZyI6ZmFsc2UsImRhcmtGb3Jlc3QiOmZhbHNlLCJkYXJrTW9kZSI6ZmFsc2UsImRlYWQiOmZhbHNlLCJza2luQ29sb3VyIjoiUElOSyIsImFjY2Vzc29yaWVzIjpbXSwicmV2ZXJzZSI6ZmFsc2V9LCJzbG90cyI6eyJmdXR1cmUiOlt7Im5lc3RlZCI6WyLDqSIsbnVsbCxmYWxzZSwzXX1dLCJhY2Nlc3NvcmllcyI6WyJGRVJOIiwibm9uZSJdLCJzY2FycyI6WyJGQUNFIl0sInRvcnRpZSI6W3sibWFzayI6Ik9ORSIsInBhdHRlcm4iOiJTaW5nbGVDb2xvdXIiLCJjb2xvdXIiOiJHSU5HRVIifV19LCJjb3VudHMiOnsiZnV0dXJlIjoxLCJhY2Nlc3NvcmllcyI6Miwic2NhcnMiOjEsInRvcnRpZSI6MX19";

describe("cat share codec", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])(
    "keeps existing share bytes and Unicode data, without structuredClone: %s",
    async (withoutStructuredClone) => {
      if (withoutStructuredClone) vi.stubGlobal("structuredClone", undefined);
      const input = {
        params: {
          spriteNumber: 8,
          peltName: "SingleColour",
          colour: "WHITE",
          eyeColour: "BLUE",
          skinColour: "PINK",
          future: { label: "Mäuse 🐈", nested: [null, true, 3] },
        },
        accessorySlots: ["FERN", null],
        scarSlots: ["FACE"],
        tortieSlots: [
          { mask: "ONE", pattern: "SingleColour", colour: "GINGER" },
        ],
        traitSlots: { future: [{ nested: ["é", null, false, 3] }] },
      };
      expect(encodeCatShare(input)).toBe(existingHybridShare);
      const decoded = await decodeCatShare(existingHybridShare);
      expect(decoded?.params).toMatchObject(input.params);
      expect(decoded?.traitSlots.future).toEqual(input.traitSlots.future);
      expect(decoded?.accessorySlots).toEqual(["FERN", "none"]);
      expect(decoded?.tortieSlots).toEqual(input.tortieSlots);
      expect(decoded).not.toBeNull();
      if (!decoded) throw new Error("Existing share must decode");
      expect(encodeCatShare(decoded)).toBe(existingHybridShare);

      const prepared = prepareCatShare(input);
      input.traitSlots.future[0].nested.push("changed");
      expect(prepared.slots.future).toEqual([
        { nested: ["é", null, false, 3] },
      ]);
    },
  );

  it.each([1, 2])(
    "reads existing V%s links with coerced legacy slots",
    async (v) => {
      const stored = prepareCatShare({ params: { colour: "WHITE" } });
      const decoded = await decodeCatShare(
        encodeLegacyV1({
          v,
          ...(v === 1
            ? { params: stored.params }
            : { document: stored.document }),
          slots: {
            accessories: [7, true, {}, ["FERN"], null, "  "],
            tortie: [
              { mask: ["ONE"], pattern: ["SingleColour"], colour: ["GINGER"] },
            ],
          },
          counts: {},
        }),
      );
      expect(decoded?.accessorySlots).toEqual([
        "7",
        "true",
        "[object Object]",
        "FERN",
        "none",
        "none",
      ]);
      expect(decoded?.tortieSlots).toEqual([
        { mask: "ONE", pattern: "SingleColour", colour: "GINGER" },
      ]);
    },
  );

  it("forwards the edit capability for slug updates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: "saved", id: "share-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createCatShare(
      { params: { colour: "WHITE" } },
      { slug: "saved", editToken: "capability-token" },
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject(
      {
        slug: "saved",
        editToken: "capability-token",
      },
    );
  });

  it("round-trips JSON shares without structuredClone", async () => {
    vi.stubGlobal("structuredClone", undefined);
    const params = {
      spriteNumber: 8,
      peltName: "SingleColour",
      colour: "WHITE",
      eyeColour: "BLUE",
      skinColour: "PINK",
    };
    const decoded = await decodeCatShare(encodeCatShare({ params }));
    expect(decoded?.params).toMatchObject(params);
    expect(decoded?.params).not.toBe(params);
  });

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
