import { afterEach, describe, expect, it, vi } from "vitest";
import { CAT_CATALOG_HASH } from "@/lib/cat-system/generated/cat-schema.generated";
import type { CatParams } from "@/lib/cat-v3/types";
import { CatGeneratorV3 } from "../catGeneratorV3";

const BASE_CAT: CatParams = {
  spriteNumber: 8,
  poseName: "adult_short2",
  peltName: "SingleColour",
  coatPattern: "bengal-rosettes",
  colour: "GINGER",
  isTortie: false,
  eyeColour: "PALEGREEN",
  skinColour: "DARKBROWN",
  shading: true,
  reverse: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CatGeneratorV3 batch coat variants", () => {
  it("does not build an incompatible legacy URL for derived coats", () => {
    const generator = new CatGeneratorV3();
    expect(generator.buildCatURL(BASE_CAT)).toBe("");

    const legacyShaped = { ...BASE_CAT, peltName: "bengal-rosettes" };
    delete legacyShaped.coatPattern;
    expect(generator.buildCatURL(legacyShaped)).toBe("");
  });

  it("explicitly clears a base derived coat for normal-pelt variants", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variants[0].params).toMatchObject({
        peltName: "Tabby",
        coatPattern: null,
      });
      expect(body.variants[1].params).toMatchObject({
        peltName: "SingleColour",
        coatPattern: "tiger-stripes",
      });

      return new Response(
        JSON.stringify({
          sheet: "data:image/png;base64,",
          width: 0,
          height: 0,
          tileSize: 50,
          catalogHash: CAT_CATALOG_HASH,
          frames: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const generator = new CatGeneratorV3("http://renderer.test");
    const normalPelt = { ...BASE_CAT, peltName: "Tabby" };
    delete normalPelt.coatPattern;

    await generator.generateVariantSheet(BASE_CAT, [
      { id: "normal", params: normalPelt },
      {
        id: "derived",
        params: { ...BASE_CAT, coatPattern: "tiger-stripes" },
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("normalizes legacy-shaped derived coats at the renderer boundary", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.payload.params).toMatchObject({
        peltName: "SingleColour",
        coatPattern: "bengal-rosettes",
      });

      return new Response(
        JSON.stringify({
          sheet: "data:image/png;base64,",
          width: 0,
          height: 0,
          tileSize: 50,
          catalogHash: CAT_CATALOG_HASH,
          frames: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const legacyShaped = { ...BASE_CAT, peltName: "bengal-rosettes" };
    delete legacyShaped.coatPattern;

    const generator = new CatGeneratorV3("http://renderer.test");
    await generator.generateVariantSheet(legacyShaped, [], {
      includeBase: true,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
