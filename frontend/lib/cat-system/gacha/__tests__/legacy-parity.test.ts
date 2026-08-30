import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateRandomParamsServerDetailed } from "@/lib/cat-v3/random-cat-server";
import randomConfig from "@/lib/cat-v3/random-config.json";
import { publicCatCatalog } from "../../catalog";
import {
  booleanValue,
  defineCatSystem,
  defineCatTrait,
  objectListValue,
  stringListValue,
  stringValue,
} from "../../definition";
import { type CatTraitId, catSystem } from "../../registry";
import {
  createGachaCatalogs,
  createGachaCatalogsFromPublicCatalog,
} from "../catalogs";
import { rollCatFromRegistry, rollCatFromSystem } from "../engine";
import { Xoshiro128StarStar } from "../rng";

const LEGACY_RANDOM_POSES = [
  "adolescent_short0",
  "adolescent_short1",
  "adolescent_short2",
  "adolescent_long0",
  "adolescent_long1",
  "adolescent_long2",
  "adult_short0",
  "adult_short1",
  "adult_short2",
  "adult_long0",
  "adult_long1",
  "adult_long2",
  "senior0",
  "senior1",
  "senior2",
  "para_adult_short0",
  "para_adult_long0",
  "para_young0",
  "sick_adult0",
  "sick_young0",
] as const;

const LEGACY_PELTS = [
  "SingleColour",
  "TwoColour",
  "Tabby",
  "Marbled",
  "Rosette",
  "Smoke",
  "Ticked",
  "Speckled",
  "Bengal",
  "Mackerel",
  "Classic",
  "Sokoke",
  "Agouti",
  "Singlestripe",
  "Masked",
] as const;

const LEGACY_COAT_PATTERNS = [
  "bengal-rosettes",
  "clouded-leopard",
  "ocelot-chains",
  "serval-spots",
  "snow-leopard",
  "tiger-stripes",
  "king-cheetah",
  "lynx-fleck",
  "marble-swirl",
  "brindle",
  "jaguar-mosaic",
  "cheetah-dots",
  "fishing-cat",
  "toyger-braids",
  "sandcat-bars",
  "classic-bullseye",
  "ridgeback",
  "masked-mantle",
  "ghost-stripes",
  "split-marble",
] as const;

const LEGACY_BASE_COLOURS = [
  "WHITE",
  "PALEGREY",
  "SILVER",
  "GREY",
  "DARKGREY",
  "GHOST",
  "BLACK",
  "CREAM",
  "PALEGINGER",
  "GOLDEN",
  "GINGER",
  "DARKGINGER",
  "SIENNA",
  "LIGHTBROWN",
  "LILAC",
  "BROWN",
  "GOLDEN-BROWN",
  "DARKBROWN",
  "CHOCOLATE",
] as const;

function productTrait(traitId: string) {
  const trait = catSystem.traits.find((candidate) => candidate.id === traitId);
  if (!trait) throw new Error(`Missing product trait ${traitId}`);
  return trait;
}

function publicCatalogIds(catalogId: string): string[] {
  return (publicCatCatalog.catalogs[catalogId] ?? []).map(({ id }) => id);
}

function publicSelectableIds(catalogId: string): string[] {
  return (publicCatCatalog.catalogs[catalogId] ?? [])
    .filter(
      ({ deprecated, randomSelectable }) =>
        deprecated !== true && randomSelectable !== false,
    )
    .map(({ id }) => id)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function runtimePoolIds(catalogId: string): string[] {
  return Array.from(
    new Set(
      createGachaCatalogs()[catalogId]?.pools.flatMap((pool) => [...pool]) ??
        [],
    ),
  ).sort((left, right) => left.localeCompare(right, "en"));
}

const hiddenCapabilities = {
  display: false,
  edit: false,
  reveal: false,
  evolution: "none",
  inherit: "none",
  settings: false,
} as const;

describe("legacy Gacha parity", () => {
  it("locks the production probabilities, counts, and shared white-patch gate", () => {
    expect(productTrait("pose").gacha).toEqual({
      strategy: "catalogChoice",
      catalog: "randomPoses",
    });
    expect(productTrait("pelt").gacha).toEqual({
      strategy: "catalogChoice",
      catalog: "coatChoices",
    });
    expect(productTrait("colour").gacha).toMatchObject({
      strategy: "catalogChoice",
      catalog: "colours",
    });
    expect(productTrait("tortie").gacha).toMatchObject({
      strategy: "tortieList",
      activationProbability: 0.5,
      fillProbability: 0.5,
      uniqueMasks: true,
      count: {
        strategy: "weightedDiscrete",
        weights: { "1": 0.75, "2": 0.2, "3": 0.05 },
        min: 1,
        max: 3,
      },
    });
    expect(productTrait("accessories").gacha).toMatchObject({
      strategy: "slotList",
      fillProbability: 0.5,
      unique: true,
      count: {
        strategy: "weightedDiscrete",
        weights: { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1 },
        min: 0,
        max: 4,
      },
    });
    expect(productTrait("scars").gacha).toMatchObject({
      strategy: "slotList",
      fillProbability: 0.5,
      unique: true,
      count: {
        strategy: "weightedDiscrete",
        weights: { "0": 1, "1": 1, "2": 1, "3": 1 },
        min: 0,
        max: 3,
      },
    });
    expect(productTrait("reverse").gacha).toEqual({
      strategy: "boolean",
      probability: 0.5,
    });
    expect(productTrait("shading").gacha).toEqual({
      strategy: "boolean",
      probability: 0,
    });
    expect(productTrait("eyeColour2").gacha).toMatchObject({
      strategy: "catalogChoice",
      catalog: "eyeColours",
      optionalProbability: 0.5,
      includeUnsetChoice: true,
    });

    const sharedGate = { group: "whitePatchGroup", probability: 0.5 };
    for (const traitId of [
      "whitePatches",
      "points",
      "whitePatchesTint",
      "vitiligo",
    ]) {
      expect(productTrait(traitId).gacha).toMatchObject({ gate: sharedGate });
    }
    for (const traitId of ["whitePatches", "points", "vitiligo"]) {
      expect(productTrait(traitId).gacha).toMatchObject({
        optionalProbability: 0.5,
      });
    }
  });

  it("keeps the v7.3.1 product pools and random-selectable membership", () => {
    expect(publicCatalogIds("randomPoses")).toEqual(LEGACY_RANDOM_POSES);
    expect(publicCatalogIds("pelts")).toEqual(LEGACY_PELTS);
    expect(publicCatalogIds("coatPatterns")).toEqual(LEGACY_COAT_PATTERNS);
    expect(publicCatalogIds("coatChoices")).toEqual([
      ...LEGACY_PELTS,
      ...LEGACY_COAT_PATTERNS,
    ]);
    expect(publicCatalogIds("baseColours")).toEqual(LEGACY_BASE_COLOURS);

    const legacySelectableCardinality = {
      randomPoses: 20,
      pelts: 15,
      coatPatterns: 20,
      coatChoices: 35,
      baseColours: 19,
      colours: 1626,
      eyeColours: 30,
      skinColours: 18,
      tints: 12,
      whitePatchColours: 6,
      tortieWhitePatchColours: 6,
      whitePatches: 117,
      points: 5,
      vitiligo: 8,
      scars: 53,
      tortieMasks: 43,
      accessories: 469,
    } as const;

    for (const [catalogId, cardinality] of Object.entries(
      legacySelectableCardinality,
    )) {
      const selectable = publicSelectableIds(catalogId);
      expect(selectable, catalogId).toHaveLength(cardinality);
      expect(runtimePoolIds(catalogId), catalogId).toEqual(selectable);
    }
  });

  it("keeps browser slot defaults and real white-patch/heterochromia semantics", () => {
    expect(randomConfig.defaultSlots).toEqual({
      tortie: 1,
      accessories: 1,
      scars: 1,
    });

    const catalogs = createGachaCatalogs({
      colours: [LEGACY_BASE_COLOURS],
      whitePatchColours: ["darkcream", "cream", "offwhite", "gray", "pink"],
      tortieWhitePatchColours: [
        "darkcream",
        "cream",
        "offwhite",
        "gray",
        "pink",
      ],
    });
    expect(catalogs.colours.pools).toEqual([
      [...LEGACY_BASE_COLOURS].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    ]);

    const observed = Array.from({ length: 4096 }, (_, seed) =>
      rollCatFromRegistry(catalogs, {
        seed,
        defaultSlotCounts: randomConfig.defaultSlots,
      }),
    );
    for (const result of observed) {
      expect(result.slotSelections.accessories).toHaveLength(1);
      expect(result.slotSelections.scars).toHaveLength(1);
      expect(result.slotSelections.tortie?.length ?? 0).toBeLessThanOrEqual(1);

      const { traits } = result.document;
      if (traits.whitePatchesTint === undefined) {
        expect(traits.whitePatches).toBeUndefined();
        expect(traits.points).toBeUndefined();
        expect(traits.vitiligo).toBeUndefined();
      }
      if (traits.eyeColour2 !== undefined) {
        expect(publicCatalogIds("eyeColours")).toContain(traits.eyeColour2);
      }
    }
    expect(observed.some(({ document }) => document.traits.eyeColour2)).toBe(
      true,
    );
    expect(
      observed.some(({ document }) => document.traits.eyeColour2 === undefined),
    ).toBe(true);
    expect(
      observed.some(
        ({ document }) =>
          document.traits.whitePatchesTint !== undefined &&
          document.traits.whitePatches === undefined &&
          document.traits.points !== undefined,
      ),
    ).toBe(true);

    const rate = (predicate: (result: (typeof observed)[number]) => boolean) =>
      observed.filter(predicate).length / observed.length;
    const hasValue = (traitId: CatTraitId) =>
      rate(({ document }) => {
        const value = document.traits[traitId];
        return Array.isArray(value) ? value.length > 0 : Boolean(value);
      });
    for (const traitId of [
      "tortie",
      "accessories",
      "scars",
      "reverse",
      "whitePatchesTint",
    ] as const) {
      expect(hasValue(traitId), traitId).toBeCloseTo(0.5, 1);
    }
    for (const traitId of ["whitePatches", "points", "vitiligo"] as const) {
      expect(hasValue(traitId), traitId).toBeCloseTo(0.25, 1);
    }
    expect(hasValue("eyeColour2")).toBeCloseTo(0.5 * (30 / 31), 1);

    const observedValues = (traitId: CatTraitId) =>
      Array.from(
        new Set(
          observed
            .map(({ document }) => document.traits[traitId])
            .filter((value): value is string => typeof value === "string"),
        ),
      ).sort((left, right) => left.localeCompare(right, "en"));
    for (const [traitId, catalogId] of [
      ["pose", "randomPoses"],
      ["colour", "baseColours"],
      ["tint", "tints"],
      ["eyeColour", "eyeColours"],
      ["skinColour", "skinColours"],
    ] as const) {
      expect(observedValues(traitId), traitId).toEqual(
        publicSelectableIds(catalogId),
      );
    }
    expect(observedValues("pelt")).toEqual(publicSelectableIds("pelts"));
    expect(observedValues("coatPattern")).toEqual(
      publicSelectableIds("coatPatterns"),
    );

    // v7.3.1 used unseeded Math.random(), so no honest seed-for-seed legacy
    // vector exists. The assertions above prove its distribution and support;
    // this separate v1 fingerprint freezes the new engine's complete seeded
    // output and therefore its RNG-consumption order.
    expect(
      createHash("sha256").update(JSON.stringify(observed)).digest("hex"),
    ).toBe("5ce9e7731e44391d203f021b761c09bbff5d4d34c2acefe128d5ca3feb57178a");
  });

  it("keeps the Discord default slot ranges at zero through four", async () => {
    const results = await Promise.all(
      Array.from({ length: 256 }, (_, seed) =>
        generateRandomParamsServerDetailed(
          {},
          { seed, exactLayerCounts: true },
        ),
      ),
    );

    for (const traitId of ["accessories", "scars", "tortie"] as const) {
      const counts = new Set(
        results.map(
          ({ slotSelections }) => slotSelections[traitId]?.length ?? 0,
        ),
      );
      expect([...counts].sort((left, right) => left - right)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    }
  });

  it("gates the second eye before choosing from unset plus the eye catalog", () => {
    const secondEye = defineCatTrait({
      id: "secondEye",
      label: "Second eye",
      order: 10,
      value: stringValue({ required: false, catalog: "eyes" }),
      legacy: { strategy: "direct", key: "secondEye" },
      render: { kind: "context" },
      gacha: {
        strategy: "catalogChoice",
        catalog: "eyes",
        optionalProbability: 0.5,
        includeUnsetChoice: true,
      },
      capabilities: hiddenCapabilities,
    });
    const downstream = defineCatTrait({
      id: "downstream",
      label: "Downstream",
      order: 20,
      value: booleanValue({ required: true, default: false }),
      legacy: { strategy: "direct", key: "downstream" },
      render: { kind: "context" },
      gacha: {
        strategy: "boolean",
        probability: 0.5,
        dependsOn: ["secondEye"],
      },
      capabilities: hiddenCapabilities,
    });
    const system = defineCatSystem({
      schemaVersion: 1,
      catalogs: {
        eyes: {
          source: "static",
          elements: [{ id: "AMBER" }, { id: "BLUE" }],
        },
      },
      traits: [secondEye, downstream] as const,
      aliases: {},
      tombstones: {},
    });
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: { eyes: [{ id: "AMBER" }, { id: "BLUE" }] },
    });

    for (let seed = 0; seed < 256; seed += 1) {
      const random = new Xoshiro128StarStar(seed);
      let expectedEye: string | undefined;
      if (random.nextFloat() < 0.5) {
        expectedEye = [undefined, "AMBER", "BLUE"][
          Math.floor(random.nextFloat() * 3)
        ];
      }
      const expectedDownstream = random.nextFloat() < 0.5;
      const result = rollCatFromSystem(system, catalogs, { seed });

      expect(result.document.traits.secondEye).toBe(expectedEye);
      expect(result.document.traits.downstream).toBe(expectedDownstream);
    }
  });

  it("uses one uniform union when a non-empty list enables a conditional catalog", () => {
    const layers = defineCatTrait({
      id: "layers",
      label: "Layers",
      order: 10,
      value: stringListValue({
        required: false,
        default: [],
        catalog: "layers",
        maxItems: 2,
      }),
      legacy: { strategy: "list", key: "layers" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: hiddenCapabilities,
    });
    const whiteTint = defineCatTrait({
      id: "whiteTint",
      label: "White tint",
      order: 20,
      value: stringValue({ required: false, catalog: "whiteColours" }),
      legacy: { strategy: "direct", key: "whiteTint" },
      render: { kind: "context" },
      gacha: {
        strategy: "catalogChoice",
        catalog: "whiteColours",
        flattenSelection: true,
        dependsOn: ["layers"],
        conditionalCatalogs: [
          {
            catalog: "activeWhiteColours",
            whenTrait: "layers",
            condition: "nonEmptyList",
          },
        ],
      },
      capabilities: hiddenCapabilities,
    });
    const system = defineCatSystem({
      schemaVersion: 1,
      catalogs: {
        layers: { source: "static", elements: [{ id: "ONE" }] },
        fixedWhite: { source: "static", elements: [{ id: "cream" }] },
        paletteColours: {
          source: "static",
          elements: [{ id: "BLUE" }, { id: "GREEN" }, { id: "RED" }],
        },
        whiteColours: {
          source: "composite",
          catalogs: ["fixedWhite", "paletteColours"],
          selectableCatalogs: ["fixedWhite"],
        },
        activeWhiteColours: {
          source: "composite",
          catalogs: ["fixedWhite", "paletteColours"],
          selectableCatalogs: ["fixedWhite"],
        },
      },
      traits: [layers, whiteTint] as const,
      aliases: {},
      tombstones: {},
    });
    const catalogs = createGachaCatalogsFromPublicCatalog(
      {
        catalogs: {
          layers: [{ id: "ONE" }],
          fixedWhite: [{ id: "cream" }],
          paletteColours: [{ id: "BLUE" }, { id: "GREEN" }, { id: "RED" }],
          whiteColours: [
            { id: "cream" },
            { id: "BLUE", randomSelectable: false },
            { id: "GREEN", randomSelectable: false },
            { id: "RED", randomSelectable: false },
          ],
          activeWhiteColours: [
            { id: "cream" },
            { id: "BLUE", randomSelectable: false },
            { id: "GREEN", randomSelectable: false },
            { id: "RED", randomSelectable: false },
          ],
        },
      },
      {
        whiteColours: ["cream"],
        activeWhiteColours: ["cream", "BLUE", "GREEN", "RED"],
      },
    );
    const union = [...(catalogs.activeWhiteColours?.pools[0] ?? [])];

    for (let seed = 0; seed < 128; seed += 1) {
      const random = new Xoshiro128StarStar(seed);
      const expected = union[Math.floor(random.nextFloat() * union.length)];
      const active = rollCatFromSystem(system, catalogs, {
        seed,
        fixedTraits: { layers: ["ONE"] },
      });
      const inactive = rollCatFromSystem(system, catalogs, {
        seed,
        fixedTraits: { layers: [] },
      });

      expect(active.document.traits.whiteTint).toBe(expected);
      expect(inactive.document.traits.whiteTint).toBe("cream");
    }
  });

  it("activates a ranged Tortie roll before drawing its exact layer count", () => {
    const layerSchema = z.object({
      mask: z.string(),
      pattern: z.string(),
      colour: z.string(),
    });
    const tortie = defineCatTrait({
      id: "tortie",
      label: "Tortie",
      order: 10,
      value: objectListValue({
        required: false,
        default: [],
        schema: layerSchema,
        maxItems: 4,
      }),
      legacy: { strategy: "tortie" },
      render: { kind: "context" },
      gacha: {
        strategy: "tortieList",
        maskCatalog: "masks",
        peltCatalog: "pelts",
        colourCatalog: "colours",
        count: { strategy: "uniformCount", min: 0, max: 4 },
        activationProbability: 0.5,
        fillProbability: 0.5,
        uniqueMasks: true,
      },
      capabilities: hiddenCapabilities,
    });
    const system = defineCatSystem({
      schemaVersion: 1,
      catalogs: {
        masks: {
          source: "static",
          elements: ["ONE", "TWO", "THREE", "FOUR"].map((id) => ({ id })),
        },
        pelts: { source: "static", elements: [{ id: "Tabby" }] },
        colours: { source: "static", elements: [{ id: "BLACK" }] },
      },
      traits: [tortie] as const,
      aliases: {},
      tombstones: {},
    });
    const catalogs = createGachaCatalogsFromPublicCatalog({
      catalogs: {
        masks: ["ONE", "TWO", "THREE", "FOUR"].map((id) => ({ id })),
        pelts: [{ id: "Tabby" }],
        colours: [{ id: "BLACK" }],
      },
    });

    for (let seed = 0; seed < 128; seed += 1) {
      const random = new Xoshiro128StarStar(seed);
      const active = random.nextFloat() < 0.5;
      const expectedCount = active ? Math.floor(random.nextFloat() * 5) : 0;
      const result = rollCatFromSystem(system, catalogs, {
        seed,
        exactLayerCounts: true,
        slotRanges: { tortie: { min: 0, max: 4 } },
      });

      expect(result.document.traits.tortie).toHaveLength(expectedCount);
    }

    const forced = rollCatFromSystem(system, catalogs, {
      seed: "numeric-override-forces-tortie",
      exactLayerCounts: true,
      slotOverrides: { tortie: 2 },
    });
    expect(forced.document.traits.tortie).toHaveLength(2);
  });
});
