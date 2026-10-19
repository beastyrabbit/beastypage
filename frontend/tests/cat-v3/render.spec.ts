import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Image as CanvasImage, createCanvas, loadImage } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { preparePreviewBatchParams } from "@/components/visual-builder/previewBatcher";
import {
  mutateBuilderParams,
  synchronizeBuilderParams,
} from "@/lib/cat-builder/genericTraitEditor";
import { renderCatV3 } from "@/lib/cat-v3/api";
import type { CatParams, RandomGenerationOptions } from "@/lib/cat-v3/types";
import { CatGeneratorV3 } from "@/lib/single-cat/catGeneratorV3";

const baseUrl = inject("rendererBaseUrl");

const originalImage = globalThis.Image;
const originalDocument = globalThis.document;

beforeAll(() => {
  globalThis.Image = CanvasImage as unknown as typeof globalThis.Image;
  globalThis.document = {
    createElement: () => createCanvas(0, 0),
  } as unknown as Document;
});

afterAll(() => {
  globalThis.Image = originalImage;
  globalThis.document = originalDocument;
});

const PARITY_BASE: CatParams = synchronizeBuilderParams({
  spriteNumber: 8,
  poseName: "adult_short2",
  peltName: "Tabby",
  colour: "GINGER",
  isTortie: true,
  tortie: [
    { pattern: "SingleColour", colour: "BLACK", mask: "ONE" },
    { pattern: "SingleColour", colour: "CREAM", mask: "TWO" },
  ],
  tortiePattern: "SingleColour",
  tortieColour: "BLACK",
  tortieMask: "ONE",
  eyeColour: "GREEN",
  skinColour: "PINK",
  whitePatches: "FULLWHITE",
  whitePatchesTint: "none",
  tint: "none",
  shading: true,
  reverse: false,
  accessories: ["MAPLE LEAF"],
  accessory: "MAPLE LEAF",
  scars: ["ONE"],
  scar: "ONE",
});

const PARITY_MUTATORS: Array<{
  id: string;
  mutate: (draft: CatParams) => void;
}> = [
  {
    id: "accessories-cleared",
    mutate: (draft) => {
      draft.accessories = [];
      draft.accessory = undefined;
    },
  },
  {
    id: "accessories-changed",
    mutate: (draft) => {
      draft.accessories = ["HOLLY"];
      draft.accessory = "HOLLY";
    },
  },
  {
    id: "tortie-cleared",
    mutate: (draft) => {
      draft.isTortie = false;
      draft.tortie = [];
      draft.tortiePattern = undefined;
      draft.tortieColour = undefined;
      draft.tortieMask = undefined;
    },
  },
  {
    id: "tortie-changed",
    mutate: (draft) => {
      draft.isTortie = true;
      draft.tortie = [
        { pattern: "SingleColour", colour: "WHITE", mask: "THREE" },
      ];
      draft.tortiePattern = "SingleColour";
      draft.tortieColour = "WHITE";
      draft.tortieMask = "THREE";
    },
  },
  {
    id: "white-patches-cleared",
    mutate: (draft) => {
      draft.whitePatches = undefined;
    },
  },
  {
    id: "white-patches-changed",
    mutate: (draft) => {
      draft.whitePatches = "PEBBLESHINE";
    },
  },
  {
    id: "scars-cleared",
    mutate: (draft) => {
      draft.scars = [];
      draft.scar = undefined;
    },
  },
  {
    id: "scars-changed",
    mutate: (draft) => {
      draft.scars = ["CHEEK"];
      draft.scar = "CHEEK";
    },
  },
  {
    id: "eye-colour-changed",
    mutate: (draft) => {
      draft.eyeColour = "BLUE";
    },
  },
];

async function decodePng(dataUrl: string) {
  const encoded = dataUrl.split(",")[1] ?? "";
  const image = await loadImage(Buffer.from(encoded, "base64"));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    pixels: context.getImageData(0, 0, image.width, image.height).data,
  };
}

// Skip tests if RENDERER_BASE_URL is not set
describe("renderer-service", () => {
  it("keeps fixed-seed cats pixel-identical to the pre-refactor baseline", async () => {
    // RGBA hashes captured from e984e23 before the Sonar complexity refactor.
    const baselines: Array<[RandomGenerationOptions, string]> = [
      [
        { seed: 0 },
        "02858f7e290f035c14fa5be3f549c1abae511a7050489bf6334c5e016769576d",
      ],
      [
        { seed: 1 },
        "db3d47bf2976ac2dc10b43a589ccaf0aca1b3908bca57a3ec341082b5a5da1a2",
      ],
      [
        { seed: 42 },
        "c26911ae0d0ee5d27cb8fd93960487f17b8984c5728bcbc43ebd7724fbb39154",
      ],
      [
        { seed: "sonar-08" },
        "944dfc91fe9f2bd8a7537d1508d2e9eb48e03e132bbc8a32a6d6e0f4c574acee",
      ],
      [
        { seed: 20261019, accessoryCount: 3, scarCount: 3, tortieCount: 3 },
        "07a0a1245afc128d13cfa4a9642ab1a95a8621d46286ad7c5d3e1eb7732cf5d5",
      ],
      [
        {
          seed: "sonar-08-palette",
          experimentalColourMode: ["mood", "bold"],
          includeBaseColours: false,
        },
        "5a986f90ea704ab3b4cbc319e370c7aeff7388d56736d8f0da0a882429338925",
      ],
    ];
    const nativeFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (typeof input === "string" && input.startsWith("/sprite-data/")) {
          const json = await readFile(
            new URL(`../../public${input}`, import.meta.url),
            "utf8",
          );
          return new Response(json, { status: 200 });
        }
        return nativeFetch(input, init);
      });
    try {
      const generator = new CatGeneratorV3(baseUrl);
      for (const [options, hash] of baselines) {
        const params = await generator.generateRandomParams(options);
        const rendered = await generator.generateCat(params);
        const decoded = await decodePng(rendered.imageDataUrl);
        expect([decoded.width, decoded.height], `seed ${options.seed}`).toEqual(
          [50, 50],
        );
        expect(
          createHash("sha256").update(decoded.pixels).digest("hex"),
          `seed ${options.seed}`,
        ).toBe(hash);
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns a PNG data URL for a simple cat", async () => {
    const result = await renderCatV3(
      {
        spriteNumber: 5,
        params: {
          colour: "GINGER",
          eyeColour: "GREEN",
          tint: "none",
        },
      },
      { baseUrl },
    );

    expect(result.imageDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.meta.duration_ms).toBeGreaterThanOrEqual(0);
    const pngBytes = Buffer.from(
      result.imageDataUrl.split(",")[1] ?? "",
      "base64",
    );
    expect(pngBytes.length).toBeGreaterThan(50);
  });

  it("keeps standalone and batch variant renders pixel-identical for trait clears", async () => {
    const generator = new CatGeneratorV3(baseUrl);
    const results: Array<{
      id: string;
      widthEqual: boolean;
      heightEqual: boolean;
      differingPixels: number;
    }> = [];

    for (const { id, mutate } of PARITY_MUTATORS) {
      const tileParams = mutateBuilderParams(PARITY_BASE, mutate);
      const standalone = await generator.generateCat(tileParams);
      const batch = await generator.generateVariantSheet(
        PARITY_BASE,
        [{ id, params: preparePreviewBatchParams(tileParams) }],
        {
          includeSources: true,
          includeBase: false,
          frameMode: "composed",
        },
      );
      const batchSource = batch.sources?.find((source) => source.id === id);
      expect(batchSource, `${id} batch source`).toBeDefined();

      expect(standalone.imageDataUrl, `${id} standalone image`).toBeDefined();
      const standalonePng = await decodePng(standalone.imageDataUrl ?? "");
      const batchPng = await decodePng(batchSource?.imageDataUrl ?? "");
      const widthEqual = standalonePng.width === batchPng.width;
      const heightEqual = standalonePng.height === batchPng.height;
      const differingPixels =
        widthEqual && heightEqual
          ? pixelmatch(
              standalonePng.pixels,
              batchPng.pixels,
              undefined,
              standalonePng.width,
              standalonePng.height,
              { threshold: 0 },
            )
          : -1;
      results.push({ id, widthEqual, heightEqual, differingPixels });
    }

    expect(results, JSON.stringify(results, null, 2)).toEqual(
      PARITY_MUTATORS.map(({ id }) => ({
        id,
        widthEqual: true,
        heightEqual: true,
        differingPixels: 0,
      })),
    );
  }, 30_000);
});
