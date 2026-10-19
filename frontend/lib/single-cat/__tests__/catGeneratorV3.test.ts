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
  it("keeps JSON fallback support for non-cloneable legacy trait metadata", async () => {
    const params: Partial<CatParams> = {
      peltName: "Tabby",
      traits: { legacyCallback: () => "unused", colour: "GINGER" },
    };
    expect(() => structuredClone(params)).toThrow();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variants[0].params.traits).toEqual({ colour: "GINGER" });
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

    await new CatGeneratorV3("http://renderer.test").generateVariantSheet(
      BASE_CAT,
      [{ id: "legacy", params }],
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(typeof params.traits?.legacyCallback).toBe("function");
  });

  it("preserves legacy URL ordering, optional fields and first-slot precedence", () => {
    const params = {
      ...BASE_CAT,
      coatPattern: undefined,
      isTortie: true,
      tint: "pink",
      eyeColour2: "BLUE",
      whitePatches: "ANY",
      points: "COLOURPOINT",
      whitePatchesTint: "cream",
      vitiligo: "MOON",
      accessories: [null, "HOLLY"],
      accessory: "MAPLE LEAF",
      scars: [],
      scar: "ONE",
      tortieMask: "TWO",
      tortiePattern: "Tabby",
      tortieColour: "BLACK",
    };
    const url = new CatGeneratorV3().buildCatURL(params);
    expect(url).toBe(
      "https://cgen-tools.github.io/pixel-cat-maker/?version=v1&shading=true&reverse=false&isTortie=true&backgroundColour=rgb%280+0+0+%2F+0%29&peltName=SingleColour&spriteNumber=8&poseName=adult_short2&colour=GINGER&tint=pink&skinColour=DARKBROWN&eyeColour=PALEGREEN&eyeColour2=BLUE&whitePatches=ANY&points=COLOURPOINT&whitePatchesTint=cream&vitiligo=MOON&accessory=null&scar=ONE&tortieMask=TWO&tortiePattern=Tabby&tortieColour=BLACK",
    );
    expect(new CatGeneratorV3().buildCatURL({
      ...params,
      isTortie: false,
      accessories: [],
      tint: "none",
      whitePatchesTint: "none",
    })).not.toMatch(/tortieMask|tortiePattern|tortieColour|&tint=|&whitePatchesTint=/);
  });

  it("does not build an incompatible legacy URL for derived coats", () => {
    const generator = new CatGeneratorV3();
    expect(generator.buildCatURL(BASE_CAT)).toBe("");

    const legacyShaped = { ...BASE_CAT, peltName: "bengal-rosettes" };
    delete legacyShaped.coatPattern;
    expect(generator.buildCatURL(legacyShaped)).toBe("");
  });

  it.each(["available", "missing", "rejecting"])("clears derived coats with structuredClone %s", async (mode) => {
    if (mode === "missing") vi.stubGlobal("structuredClone", undefined);
    if (mode === "rejecting") vi.stubGlobal("structuredClone", () => {
      throw new DOMException("Cannot clone this value", "DataCloneError");
    });
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
