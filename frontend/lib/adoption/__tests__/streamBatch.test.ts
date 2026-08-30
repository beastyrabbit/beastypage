import { describe, expect, it } from "vitest";
import { catDataToLegacyPersistence } from "@/lib/cat-system/document";
import {
  EAR_ACCESSORY_PROBE_ID,
  EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
  EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
  earAccessoryProbeSystem,
} from "@/lib/cat-system/testing/earAccessoryProbe";
import probeArtifact from "@/lib/cat-system/testing/fixtures/cat-system-ear-accessory-probe.generated.json";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  type BatchStreamCat,
  batchStartCount,
  buildBatchStagePlan,
  buildPartialBatchParams,
  parseBatchStreamCommand,
  trimBatchPoolToStageCount,
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

function makeProbeCat(
  values = [
    EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
    EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
  ],
): BatchStreamCat {
  const cat = makeCat();
  return {
    ...cat,
    catData: {
      ...cat.catData,
      params: {
        ...cat.catData.params,
        poseName: "adult_short1",
        schemaVersion: earAccessoryProbeSystem.schemaVersion,
        traits: {
          ...probeArtifact.renderDocument.traits,
          pelt: "Tabby",
          [EAR_ACCESSORY_PROBE_ID]: values,
        },
      },
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

  it("derives added slot stages and the exact pool size from canonical traits", () => {
    const oneSlotCat = makeProbeCat([EAR_ACCESSORY_PROBE_PRIMARY_VALUE]);
    const stages = buildBatchStagePlan(
      CONFIG,
      [oneSlotCat],
      earAccessoryProbeSystem,
    );

    expect(
      stages.filter(
        (stage) =>
          stage.type === "registry" && stage.traitId === EAR_ACCESSORY_PROBE_ID,
      ),
    ).toEqual([
      expect.objectContaining({
        id: `${EAR_ACCESSORY_PROBE_ID}-0`,
        strategy: "slots",
        slotIndex: 0,
      }),
    ]);
    expect(
      batchStartCount(CONFIG, 10, [oneSlotCat], earAccessoryProbeSystem),
    ).toBe(34);
    expect(
      batchStartCount(CONFIG, 10, undefined, earAccessoryProbeSystem),
    ).toBe(35);

    const upperBoundPool = Array.from({ length: 35 }, () => oneSlotCat);
    expect(
      trimBatchPoolToStageCount(
        CONFIG,
        10,
        upperBoundPool,
        earAccessoryProbeSystem,
      ),
    ).toHaveLength(34);
  });

  it("reconstructs added stages after persistence strips canonical traits", () => {
    const canonicalCat = makeProbeCat();
    const persistedCat: BatchStreamCat = {
      ...canonicalCat,
      catData: catDataToLegacyPersistence(
        canonicalCat.catData as unknown as Readonly<Record<string, unknown>>,
      ) as unknown as BatchStreamCat["catData"],
    };
    const persistedParams = persistedCat.catData.params as unknown as Record<
      string,
      unknown
    >;

    expect(persistedParams.traits).toBeUndefined();
    expect(persistedParams[EAR_ACCESSORY_PROBE_ID]).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
      EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    ]);

    const addedStages = buildBatchStagePlan(
      CONFIG,
      [persistedCat],
      earAccessoryProbeSystem,
    ).filter(
      (stage) =>
        stage.type === "registry" && stage.traitId === EAR_ACCESSORY_PROBE_ID,
    );

    expect(addedStages).toHaveLength(2);
    expect(
      batchStartCount(CONFIG, 10, [persistedCat], earAccessoryProbeSystem),
    ).toBe(35);
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

  it("reveals peltName and a derived coat pattern together", () => {
    const base = makeCat();
    const cat = {
      ...base,
      catData: {
        ...base.catData,
        params: {
          ...base.catData.params,
          peltName: "SingleColour",
          coatPattern: "clouded-leopard",
        },
      },
    };

    const beforePelt = buildPartialBatchParams(
      cat,
      stages,
      0,
    ) as unknown as Record<string, unknown>;
    const afterPelt = buildPartialBatchParams(
      cat,
      stages,
      1,
    ) as unknown as Record<string, unknown>;

    expect(beforePelt.peltName).toBe("SingleColour");
    expect(beforePelt.coatPattern).toBeUndefined();
    expect(afterPelt.peltName).toBe("SingleColour");
    expect(afterPelt.coatPattern).toBe("clouded-leopard");
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

  it("keeps an added trait hidden in canonical traits until its registry stages", () => {
    const probeCat = makeProbeCat();
    const probeStages = buildBatchStagePlan(
      CONFIG,
      [probeCat],
      earAccessoryProbeSystem,
    );
    const firstProbeIndex = probeStages.findIndex(
      (stage) =>
        stage.type === "registry" && stage.traitId === EAR_ACCESSORY_PROBE_ID,
    );

    const before = buildPartialBatchParams(
      probeCat,
      probeStages,
      firstProbeIndex - 1,
      undefined,
      earAccessoryProbeSystem,
    ) as unknown as Record<string, unknown>;
    const afterFirst = buildPartialBatchParams(
      probeCat,
      probeStages,
      firstProbeIndex,
      undefined,
      earAccessoryProbeSystem,
    ) as unknown as Record<string, unknown>;
    const afterSecond = buildPartialBatchParams(
      probeCat,
      probeStages,
      firstProbeIndex + 1,
      undefined,
      earAccessoryProbeSystem,
    ) as unknown as Record<string, unknown>;

    expect((before.traits as Record<string, unknown>).pelt).toBe("Tabby");
    expect(
      (before.traits as Record<string, unknown>)[EAR_ACCESSORY_PROBE_ID],
    ).toEqual([]);
    expect(
      (afterFirst.traits as Record<string, unknown>)[EAR_ACCESSORY_PROBE_ID],
    ).toEqual([EAR_ACCESSORY_PROBE_PRIMARY_VALUE]);
    expect(
      (afterSecond.traits as Record<string, unknown>)[EAR_ACCESSORY_PROBE_ID],
    ).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
      EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    ]);
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
