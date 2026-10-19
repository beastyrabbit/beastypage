import { Image as CanvasImage, createCanvas, loadImage } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { preparePreviewBatchParams } from "@/components/visual-builder/previewBatcher";
import {
  mutateBuilderParams,
  synchronizeBuilderParams,
} from "@/lib/cat-builder/genericTraitEditor";
import { renderCatV3 } from "@/lib/cat-v3/api";
import type { CatParams } from "@/lib/cat-v3/types";
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
