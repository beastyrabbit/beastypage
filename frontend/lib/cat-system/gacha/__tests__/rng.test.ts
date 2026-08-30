import { describe, expect, it } from "vitest";
import {
  defineCatSystem,
  defineCatTrait,
  stringListValue,
  stringValue,
} from "../../definition";
import { catSystem } from "../../registry";
import { createGachaCatalogsFromPublicCatalog } from "../catalogs";
import { rollCatFromRegistry, rollCatFromSystem } from "../engine";
import { Xoshiro128StarStar } from "../rng";
import {
  materializeSlots,
  resolveCount,
  weightedDiscrete,
} from "../strategies";

describe("xoshiro128** gacha RNG", () => {
  it("keeps the version-one string seed vector stable", () => {
    const random = new Xoshiro128StarStar("beasty");
    expect(Array.from({ length: 6 }, () => random.nextUint32())).toEqual([
      0x8315daa0, 0xca789388, 0x4bb0f1c9, 0x3ab8c3d0, 0x90b19742, 0x4d35d2e3,
    ]);
  });

  it("distinguishes numeric and string seeds", () => {
    const numeric = new Xoshiro128StarStar(42);
    const string = new Xoshiro128StarStar("42");
    expect(numeric.nextUint32()).toBe(0xc5a6c26f);
    expect(string.nextUint32()).not.toBe(0xc5a6c26f);
  });

  it("injects one source into count and unique slot selection", () => {
    const random = new Xoshiro128StarStar("slot-contract");
    const count = resolveCount(random, {
      strategy: "weightedDiscrete",
      weights: { "1": 1, "3": 5 },
      min: 1,
      max: 3,
    });
    const slots = materializeSlots({
      random,
      slotCount: count,
      availableChoices: ["a", "b", "c", "d"],
      unique: true,
      exactCount: true,
      placeholder: "none",
      shouldFillSlot: () => true,
      mapChoice: (value) => value,
      mapValueToSlot: (value) => value,
    });

    expect(slots.selectedValues).toHaveLength(count);
    expect(new Set(slots.selectedValues).size).toBe(count);
  });

  it("rejects an empty weighted distribution", () => {
    const random = new Xoshiro128StarStar("invalid-weights");
    expect(() => weightedDiscrete(random, {})).toThrow(
      "Weighted distribution has no valid entries",
    );
  });

  it("makes every value in an explicit slot range reachable", () => {
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        randomPoses: [{ id: "adult_short0" }],
        coatChoices: [{ id: "Tabby" }],
        colours: [{ id: "BLACK" }],
        tints: [{ id: "none" }],
        eyeColours: [{ id: "BLUE" }],
        skinColours: [{ id: "PINK" }],
        tortieMasks: [{ id: "ONE" }, { id: "TWO" }, { id: "THREE" }],
        pelts: [{ id: "Tabby" }],
      },
    });
    const observedCounts = new Set(
      Array.from({ length: 128 }, (_, seed) => {
        const result = rollCatFromRegistry(catalogs, {
          seed,
          exactLayerCounts: true,
          fixedTraits: {
            pose: "adult_short0",
            pelt: "Tabby",
            colour: "BLACK",
            tint: "none",
            eyeColour: "BLUE",
            skinColour: "PINK",
          },
          slotOverrides: { accessories: 0, scars: 0 },
          slotRanges: { tortie: { min: 0, max: 2 } },
        });
        return result.document.traits.tortie?.length ?? 0;
      }),
    );

    expect([...observedCounts].sort((left, right) => left - right)).toEqual([
      0, 1, 2,
    ]);
  });

  it("keeps the declared weighted count domain without an explicit range", () => {
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        randomPoses: [{ id: "adult_short0" }],
        coatChoices: [{ id: "Tabby" }],
        colours: [{ id: "BLACK" }],
        tints: [{ id: "none" }],
        eyeColours: [{ id: "BLUE" }],
        skinColours: [{ id: "PINK" }],
        tortieMasks: [{ id: "ONE" }, { id: "TWO" }, { id: "THREE" }],
        pelts: [{ id: "Tabby" }],
      },
    });
    const observedCounts = new Set(
      Array.from({ length: 256 }, (_, seed) => {
        const result = rollCatFromRegistry(catalogs, {
          seed,
          exactLayerCounts: true,
          fixedTraits: {
            pose: "adult_short0",
            pelt: "Tabby",
            colour: "BLACK",
            tint: "none",
            eyeColour: "BLUE",
            skinColour: "PINK",
          },
          slotOverrides: { accessories: 0, scars: 0 },
        });
        return result.document.traits.tortie?.length ?? 0;
      }),
    );

    expect([...observedCounts].sort((left, right) => left - right)).toEqual([
      1, 2, 3,
    ]);
  });

  it("uses dependsOn for ordering without gating a trait on dependency presence", () => {
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        poses: [{ id: "adult_short0" }],
        randomPoses: [{ id: "adult_short0" }],
        pelts: [{ id: "Tabby" }],
        coatChoices: [{ id: "Tabby" }],
        colours: [{ id: "BLACK" }],
        tints: [{ id: "none" }],
        whitePatchColours: [{ id: "cream" }],
        eyeColours: [{ id: "BLUE" }],
        skinColours: [{ id: "PINK" }],
        accessories: [{ id: "FERN" }],
        scars: [{ id: "ONE" }],
        points: [{ id: "SEALPOINT" }],
        vitiligo: [{ id: "VITILIGO" }],
        tortieMasks: [{ id: "ONE" }],
        whitePatches: [{ id: "TUXEDO" }],
      },
    });

    const result = Array.from({ length: 100 }, (_, seed) =>
      rollCatFromRegistry(catalogs, {
        seed,
        fixedTraits: {
          pose: "adult_short0",
          pelt: "Tabby",
          colour: "BLACK",
          tint: "none",
          eyeColour: "BLUE",
          skinColour: "PINK",
        },
        slotOverrides: { accessories: 0, scars: 0, tortie: 0 },
      }),
    ).find(
      (candidate) =>
        candidate.document.traits.whitePatches === undefined &&
        candidate.document.traits.points === "SEALPOINT",
    );

    expect(result).toBeDefined();
    expect(result?.document.traits.whitePatchesTint).toBe("cream");
  });

  it("lets a runtime probability override a declared boolean strategy", () => {
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        poses: [{ id: "adult_short0" }],
        randomPoses: [{ id: "adult_short0" }],
        pelts: [{ id: "Tabby" }],
        coatChoices: [{ id: "Tabby" }],
        colours: [{ id: "BLACK" }],
        tints: [{ id: "none" }],
        whitePatchColours: [{ id: "cream" }],
        eyeColours: [{ id: "BLUE" }],
        skinColours: [{ id: "PINK" }],
        accessories: [{ id: "FERN" }],
        scars: [{ id: "ONE" }],
        points: [{ id: "SEALPOINT" }],
        vitiligo: [{ id: "VITILIGO" }],
        tortieMasks: [{ id: "ONE" }],
        whitePatches: [{ id: "TUXEDO" }],
      },
    });

    const result = rollCatFromRegistry(catalogs, {
      seed: "boolean-override",
      fixedTraits: {
        pose: "adult_short0",
        pelt: "Tabby",
        colour: "BLACK",
        tint: "none",
        eyeColour: "BLUE",
        skinColour: "PINK",
      },
      slotOverrides: { accessories: 0, scars: 0, tortie: 0 },
      traitProbabilities: { shading: 1 },
    });

    expect(result.document.traits.shading).toBe(true);
  });

  it("discovers a newly generated catalog without a catalog-ID switch", () => {
    const catalogs = createGachaCatalogsFromPublicCatalog(
      {
        catalogs: {
          poses: [{ id: "adult_short0" }, { id: "adult_long0" }],
          earAccessories: [
            { id: "EAR-RIBBON", poses: ["adult_short0"], weight: 7 },
            { id: "EAR-FERN" },
            {
              id: "EAR-LEGACY",
              poses: ["adult_long0"],
              deprecated: true,
            },
          ],
        },
      },
      { colours: [["BLACK"], ["GINGER"]] },
    );

    expect(catalogs.earAccessories.pools).toEqual([["EAR-FERN", "EAR-RIBBON"]]);
    expect(catalogs.earAccessories.byPose?.adult_short0).toEqual([
      "EAR-FERN",
      "EAR-RIBBON",
    ]);
    expect(catalogs.earAccessories.byPose?.adult_long0).toEqual(["EAR-FERN"]);
    expect(catalogs.earAccessories.weights).toEqual({ "EAR-RIBBON": 7 });
    expect(catalogs.earAccessories.canonicalValues).toEqual([
      "EAR-FERN",
      "EAR-LEGACY",
      "EAR-RIBBON",
    ]);
    expect(catalogs.earAccessories.canonicalByPose?.adult_long0).toEqual([
      "EAR-FERN",
      "EAR-LEGACY",
    ]);
    expect(catalogs.earAccessories.canonicalByPose?.adult_short0).toEqual([
      "EAR-FERN",
      "EAR-RIBBON",
    ]);
    expect(catalogs.colours.pools).toEqual([["BLACK"], ["GINGER"]]);
  });

  it("rejects runtime choices outside the compiled catalog", () => {
    expect(() =>
      createGachaCatalogsFromPublicCatalog(
        {
          catalogs: {
            whiteTints: [{ id: "none" }, { id: "cream" }],
          },
        },
        { whiteTints: ["cream", "APRICOT"] },
      ),
    ).toThrow(
      "Gacha catalog override whiteTints contains values outside the compiled catalog: APRICOT",
    );
  });

  it("uses catalog weights while keeping deprecated fixed values valid", () => {
    const weightedChoice = defineCatTrait({
      id: "weightedChoice",
      label: "Weighted choice",
      order: 1,
      value: stringValue({
        required: true,
        default: "HEAVY",
        catalog: "weightedValues",
      }),
      legacy: { strategy: "direct", key: "weightedChoice" },
      render: { kind: "context" },
      gacha: { strategy: "catalogChoice", catalog: "weightedValues" },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    });
    const system = defineCatSystem({
      schemaVersion: 1,
      catalogs: {
        weightedValues: {
          source: "static",
          elements: [
            { id: "HEAVY", weight: Number.MAX_SAFE_INTEGER },
            { id: "LIGHT" },
            { id: "LEGACY", deprecated: true },
          ],
        },
      },
      traits: [weightedChoice] as const,
      aliases: {},
      tombstones: {},
    });
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        weightedValues: [
          { id: "HEAVY", weight: Number.MAX_SAFE_INTEGER },
          { id: "LIGHT" },
          { id: "LEGACY", deprecated: true },
        ],
      },
    });

    const generated = Array.from({ length: 64 }, (_, seed) =>
      rollCatFromSystem(system, catalogs, { seed }),
    );
    expect(
      generated.every(
        (result) => result.document.traits.weightedChoice === "HEAVY",
      ),
    ).toBe(true);
    expect(rollCatFromSystem(system, catalogs, { seed: 17 })).toEqual(
      rollCatFromSystem(system, catalogs, { seed: 17 }),
    );

    expect(
      rollCatFromSystem(system, catalogs, {
        seed: "deprecated-fixed-value",
        fixedTraits: { weightedChoice: "LEGACY" },
      }).document.traits.weightedChoice,
    ).toBe("LEGACY");
    expect(
      rollCatFromSystem(system, catalogs, {
        seed: "invalid-fixed-value",
        fixedTraits: { weightedChoice: "NOT-IN-CATALOG" },
      }).document.traits.weightedChoice,
    ).toBe("HEAVY");
  });

  it("projects a derived choice through declared trait IDs", () => {
    const coatSource = defineCatTrait({
      id: "coatSource",
      label: "Coat source",
      order: 20,
      value: stringValue({
        required: true,
        default: "SingleColour",
        catalog: "baseCoats",
      }),
      legacy: { strategy: "direct", key: "coatSource" },
      render: { kind: "context" },
      gacha: { strategy: "catalogChoice", catalog: "coatChoices" },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    });
    const patternProjection = defineCatTrait({
      id: "patternProjection",
      label: "Pattern projection",
      order: 10,
      value: stringValue({ required: false, catalog: "derivedPatterns" }),
      legacy: { strategy: "direct", key: "patternProjection" },
      render: { kind: "context" },
      gacha: {
        strategy: "derived",
        resolver: "coatChoiceProjection",
        sourceTrait: "coatSource",
        dependsOn: ["coatSource"],
      },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    });
    const system = defineCatSystem({
      schemaVersion: 1,
      catalogs: {
        baseCoats: {
          source: "static",
          elements: [{ id: "SingleColour" }],
        },
        derivedPatterns: {
          source: "static",
          elements: [{ id: "bengal-rosettes" }],
        },
        coatChoices: {
          source: "composite",
          catalogs: ["baseCoats", "derivedPatterns"],
        },
      },
      traits: [coatSource, patternProjection] as const,
      aliases: {},
      tombstones: {},
    });
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        baseCoats: [{ id: "SingleColour" }],
        derivedPatterns: [{ id: "bengal-rosettes" }],
        coatChoices: [{ id: "bengal-rosettes" }],
      },
    });

    const result = rollCatFromSystem(system, catalogs, {
      seed: "renamed-derived-traits",
    });

    expect(result.document.traits).toEqual({
      coatSource: "SingleColour",
      patternProjection: "bengal-rosettes",
    });
    expect(result.document.traits).not.toHaveProperty("pelt");
    expect(result.document.traits).not.toHaveProperty("coatPattern");

    const fixed = rollCatFromSystem(system, catalogs, {
      seed: "fixed-derived-traits",
      fixedTraits: {
        coatSource: "bengal-rosettes",
        patternProjection: "bengal-rosettes",
      },
    });
    expect(fixed.document.traits).toEqual({
      coatSource: "SingleColour",
      patternProjection: "bengal-rosettes",
    });
  });

  it("rejects a cycle in declarative derived dependencies", () => {
    const derivedTrait = (id: string, sourceTrait: string) =>
      defineCatTrait({
        id,
        label: id,
        order: 1,
        value: stringValue({ required: false }),
        legacy: { strategy: "direct", key: id },
        render: { kind: "context" },
        gacha: {
          strategy: "derived",
          resolver: "coatChoiceProjection",
          sourceTrait,
          dependsOn: [sourceTrait],
        },
        capabilities: {
          display: false,
          edit: false,
          reveal: false,
          evolution: "none",
          inherit: "none",
          settings: false,
        },
      });

    expect(() =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {},
        traits: [
          derivedTrait("derivedLeft", "derivedRight"),
          derivedTrait("derivedRight", "derivedLeft"),
        ],
        aliases: {},
        tombstones: {},
      }),
    ).toThrow(/gacha dependency graph contains a cycle/);
  });

  it("rolls a newly registered slot trait through its fixed registry contract", () => {
    const earAccessory = defineCatTrait({
      id: "__probe_earaccessory",
      label: "Ear accessories",
      order: 195,
      value: stringListValue({
        required: false,
        default: [],
        catalog: "__probe_earaccessories",
        maxItems: 2,
        unique: true,
      }),
      legacy: { strategy: "list", key: "__probe_earaccessory" },
      render: {
        kind: "operation",
        operationId: "__probe_earaccessory",
        layerId: "__probe_earaccessory",
        strategy: "catalogSpriteList",
        version: 1,
        after: ["accessories"],
        reads: ["__probe_earaccessory"],
        config: {
          valueTrait: "__probe_earaccessory",
          catalog: "__probe_earaccessories",
          resolver: "mapping",
          sprites: { "EAR-RIBBON": "acc_lifegenTOAST" },
        },
      },
      gacha: {
        strategy: "slotList",
        catalog: "__probe_earaccessories",
        count: { strategy: "uniformCount", min: 2, max: 2 },
        fillProbability: 1,
        unique: true,
        dependsOn: ["pose"],
        availableForPose: true,
      },
      capabilities: {
        display: true,
        edit: "list",
        reveal: { strategy: "slots" },
        evolution: "accumulate",
        inherit: "none",
        settings: false,
      },
    });
    const system = defineCatSystem({
      ...catSystem,
      catalogs: {
        ...catSystem.catalogs,
        __probe_earaccessories: {
          source: "static",
          elements: [{ id: "EAR-RIBBON" }, { id: "EAR-FERN" }],
        },
      },
      traits: [...catSystem.traits, earAccessory] as const,
    });
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        randomPoses: [{ id: "adult_short0" }],
        coatChoices: [{ id: "SingleColour" }],
        colours: [{ id: "WHITE" }],
        tints: [{ id: "none" }],
        eyeColours: [{ id: "BLUE" }],
        skinColours: [{ id: "PINK" }],
        __probe_earaccessories: [{ id: "EAR-RIBBON" }, { id: "EAR-FERN" }],
      },
    });
    const result = rollCatFromSystem(system, catalogs, {
      seed: "generic-ear-accessory",
      exactLayerCounts: true,
      fixedTraits: {
        pose: "adult_short0",
        pelt: "SingleColour",
        colour: "WHITE",
        tortie: [],
        tint: "none",
        whitePatches: undefined,
        points: undefined,
        whitePatchesTint: undefined,
        vitiligo: undefined,
        eyeColour: "BLUE",
        eyeColour2: undefined,
        scars: [],
        shading: false,
        lighting: false,
        darkForest: false,
        dead: false,
        skinColour: "PINK",
        accessories: [],
        reverse: false,
      },
    });

    expect(result.document.traits.__probe_earaccessory).toHaveLength(2);
    expect(result.slotSelections.__probe_earaccessory).toHaveLength(2);

    const rejectedFixedValue = rollCatFromSystem(system, catalogs, {
      seed: "reject-foreign-fixed-list-value",
      fixedTraits: { __probe_earaccessory: ["NOT-IN-THE-CATALOG"] },
    });
    expect(
      rejectedFixedValue.document.traits.__probe_earaccessory,
    ).toHaveLength(2);
    expect(
      rejectedFixedValue.document.traits.__probe_earaccessory,
    ).not.toContain("NOT-IN-THE-CATALOG");
  });
});
