import { describe, expect, it } from "vitest";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  type BatchStreamCat,
  batchStartCount,
  buildBatchStagePlan,
  buildPartialBatchParams,
  parseBatchStreamCommand,
} from "../streamBatch";

const CONFIG = { accessoryCount: 2, scarCount: 2, tortieCount: 2 };

function makeCat(): BatchStreamCat {
  return {
    id: "cat-1",
    label: "Cat 1",
    catData: {
      params: {
        spriteNumber: 11,
        poseName: "adult-short-1",
        peltName: "Tabby",
        colour: "BLACK",
        tint: "dilute",
        skinColour: "BLUE",
        eyeColour: "EMERALD",
        eyeColour2: "none",
        whitePatches: "FULLWHITE",
        points: "none",
        whitePatchesTint: "none",
        vitiligo: "none",
        shading: true,
        reverse: true,
        darkForest: true,
        dead: false,
      } as unknown as CatParams,
      accessorySlots: ["BROWNBEAR", "none"],
      scarSlots: ["LEFTBLIND", "none"],
      tortieSlots: [
        { mask: "MASK", pattern: "Marbled", colour: "GOLDEN" },
        null,
      ],
      counts: { accessories: 1, scars: 1, tortie: 1 },
    },
  };
}

describe("buildBatchStagePlan", () => {
  it("matches the website's stage order and count", () => {
    const stages = buildBatchStagePlan(CONFIG);
    // 4 base + 2 torties × 3 + 6 simple + 2 accessories + 2 scars + 3 tail
    expect(stages).toHaveLength(23);
    expect(stages[0].id).toBe("colour");
    expect(stages[4].id).toBe("tortie-0-mask");
    expect(stages[stages.length - 1].id).toBe("poseName");
  });

  it("sizes the starting pool as finalists + stage count", () => {
    expect(batchStartCount(CONFIG, 10)).toBe(33);
    expect(
      batchStartCount({ accessoryCount: 0, scarCount: 0, tortieCount: 0 }, 10),
    ).toBe(23);
  });
});

describe("buildPartialBatchParams", () => {
  const stages = buildBatchStagePlan(CONFIG);
  const cat = makeCat();

  it("renders the unrevealed base kit at -1", () => {
    const params = buildPartialBatchParams(
      cat,
      stages,
      -1,
    ) as unknown as Record<string, unknown>;
    expect(params.colour).toBe("GINGER");
    expect(params.peltName).toBe("SingleColour");
    expect(params.isTortie).toBe(false);
    expect(params.accessories).toEqual([]);
    expect(params.whitePatches).toBeUndefined();
    // Afterlife flags are visible from the start, like the website.
    expect(params.darkForest).toBe(true);
  });

  it("applies revealed simple stages while keeping later ones at defaults", () => {
    // Through stage 1 (colour + pelt revealed).
    const params = buildPartialBatchParams(cat, stages, 1) as unknown as Record<
      string,
      unknown
    >;
    expect(params.colour).toBe("BLACK");
    expect(params.peltName).toBe("Tabby");
    expect(params.eyeColour).toBe("BLUE"); // not yet revealed
    expect(params.shading).toBe(false); // not yet revealed
  });

  it("uses placeholders for unrevealed tortie sub-elements", () => {
    // Stage 4 = tortie-0-mask revealed only.
    const params = buildPartialBatchParams(cat, stages, 4, {
      mask: "PHMASK",
      pattern: "PHPELT",
      colour: "WHITE",
    }) as unknown as Record<string, unknown>;
    expect(params.isTortie).toBe(true);
    expect(params.tortie).toEqual([
      { mask: "MASK", pattern: "PHPELT", colour: "WHITE" },
    ]);
  });

  it("skips tortie layers the cat does not have", () => {
    // Through stage 9 (both tortie layers' sub-stages revealed).
    const params = buildPartialBatchParams(cat, stages, 9) as unknown as Record<
      string,
      unknown
    >;
    expect(params.tortie).toEqual([
      { mask: "MASK", pattern: "Marbled", colour: "GOLDEN" },
    ]);
  });

  it("returns the real params once everything is revealed", () => {
    const params = buildPartialBatchParams(cat, stages, stages.length - 1);
    expect(params).toBe(cat.catData.params);
  });

  it("fills accessory and scar slots as their stages reveal", () => {
    const accessoryStageIndex = stages.findIndex(
      (stage) => stage.id === "accessory-0",
    );
    const params = buildPartialBatchParams(
      cat,
      stages,
      accessoryStageIndex,
    ) as unknown as Record<string, unknown>;
    expect(params.accessories).toEqual(["BROWNBEAR"]);
    expect(params.scars).toEqual([]);
  });
});

describe("parseBatchStreamCommand", () => {
  it("accepts a valid command and rejects malformed ones", () => {
    const valid = {
      finalCount: 10,
      config: CONFIG,
      cats: [makeCat()],
    };
    expect(parseBatchStreamCommand(valid)).not.toBeNull();
    expect(parseBatchStreamCommand(null)).toBeNull();
    expect(parseBatchStreamCommand({ finalCount: 10, cats: [] })).toBeNull();
  });
});
