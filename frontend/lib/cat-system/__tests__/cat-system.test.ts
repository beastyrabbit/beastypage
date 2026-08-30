import { describe, expect, it } from "vitest";
import { z } from "zod";
import generatedDocumentSchema from "../../../public/cat-system/cat-document.schema.json";
import {
  addCatalogEnumsToDocumentSchema,
  buildPublicCatalog,
  buildTraitHistoryLock,
  type PublicCatalogElement,
  type SpriteAssetInventory,
  validateRenderStrategyAssets,
} from "../../../scripts/generate-cat-system";
import {
  type AnyCatTraitDefinition,
  booleanValue,
  type CatalogDefinition,
  defineCatSystem,
  defineCatTrait,
  objectListValue,
  stringListValue,
  stringValue,
} from "../definition";
import {
  catDocumentToLegacyParams,
  legacyParamsToCatDocument,
  readCatDocument,
} from "../document";
import { catSystem } from "../registry";
import {
  applySystemEvolutionStrategies,
  applySystemInheritanceStrategies,
  getOrderedRenderOperations,
  getSystemDisplayRows,
  getSystemEvolutionTraits,
  getSystemInheritanceTraits,
  getSystemOrderedRenderOperations,
  getSystemRevealPlan,
  getSystemSettingsControls,
} from "../runtime";

const disabledCapabilities = {
  display: false,
  edit: false,
  reveal: false,
  evolution: "none",
  inherit: "none",
  settings: false,
} as const;

describe("cat-system registry", () => {
  it("compiles the renderer DAG in a deterministic order", () => {
    expect(
      getOrderedRenderOperations().map((operation) => operation.operationId),
    ).toEqual([
      "base",
      "coatPattern",
      "tint",
      "whitePatches",
      "points",
      "vitiligo",
      "eyes",
      "scarsPrimary",
      "shading",
      "lighting",
      "darkForest",
      "lineart",
      "skin",
      "scarsSecondary",
      "accessories",
      "reverse",
    ]);
  });

  it("imports legacy cats and writes a dual-compatible legacy projection", () => {
    const document = legacyParamsToCatDocument({
      spriteNumber: 8,
      peltName: "SingleColour",
      colour: "GINGER",
      eyeColour: "BLUE",
      skinColour: "PINK",
      shading: false,
      reverse: true,
      accessories: ["MAPLE LEAF"],
      scars: ["ONE"],
      isTortie: true,
      tortieMask: "ONE",
      tortiePattern: "Tabby",
      tortieColour: "BLACK",
    });

    expect(document.schemaVersion).toBe(1);
    expect(document.traits.pose).toBe("adult_short2");
    expect(document.traits.accessories).toEqual(["MAPLE LEAF"]);
    expect(document.traits.tortie).toEqual([
      { mask: "ONE", pattern: "Tabby", colour: "BLACK" },
    ]);

    const legacy = catDocumentToLegacyParams(document);
    expect(legacy.poseName).toBe("adult_short2");
    expect(legacy.spriteNumber).toBe(8);
    expect(legacy.accessory).toBe("MAPLE LEAF");
    expect(legacy.isTortie).toBe(true);
  });

  it("keeps unknown future traits for rollback readers", () => {
    const document = readCatDocument({
      schemaVersion: 2,
      traits: {
        pose: "adult_short2",
        pelt: "SingleColour",
        colour: "WHITE",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
        futureEarAccessory: ["ribbon-red"],
      },
    });

    expect(document.unknownTraits).toEqual({
      futureEarAccessory: ["ribbon-red"],
    });
    expect(catDocumentToLegacyParams(document).futureEarAccessory).toEqual([
      "ribbon-red",
    ]);
    expect(() =>
      readCatDocument(
        {
          ...document,
          traits: {
            ...document.traits,
            futureEarAccessory: ["ribbon-red"],
          },
        },
        { strict: true },
      ),
    ).toThrow();
  });

  it("normalizes optional legacy sentinels but keeps catalogued none values", () => {
    const document = legacyParamsToCatDocument({
      spriteNumber: 0,
      whitePatches: "none",
      points: "null",
      vitiligo: "",
      eyeColour2: "NONE",
      tint: "none",
    });

    expect(document.traits.whitePatches).toBeUndefined();
    expect(document.traits.points).toBeUndefined();
    expect(document.traits.vitiligo).toBeUndefined();
    expect(document.traits.eyeColour2).toBeUndefined();
    expect(document.traits.tint).toBe("none");
  });
});

describe("cat-system compiler guarantees", () => {
  const baseTrait = {
    id: "__probe_contract",
    label: "Contract probe",
    order: 1,
    value: stringValue({ required: false }),
    legacy: { strategy: "direct", key: "contractProbe" } as const,
    render: { kind: "context" } as const,
    gacha: { strategy: "none" } as const,
    capabilities: disabledCapabilities,
  };

  const compileProbeTrait = (
    trait: AnyCatTraitDefinition,
    catalogs: Readonly<Record<string, CatalogDefinition>> = {},
  ) =>
    defineCatSystem({
      schemaVersion: 1,
      catalogs,
      traits: [trait],
      aliases: {},
      tombstones: {},
    });

  it("rejects missing consumer and gacha decisions even through untyped input", () => {
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        capabilities: {} as never,
      }),
    ).toThrow(/explicitly declare display/);
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        gacha: undefined as never,
      }),
    ).toThrow(/gacha must be an explicit decision/);
  });

  it("rejects a required trait without a valid default", () => {
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        value: {
          kind: "string",
          schema: z.string(),
          required: true,
        } as never,
      }),
    ).toThrow(/required and must declare a default/);
  });

  it("rejects a declared value kind that disagrees with its Zod schema", () => {
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        value: {
          kind: "string",
          schema: z.boolean(),
          required: false,
        } as never,
      }),
    ).toThrow(/value kind string does not match its Zod schema/);
  });

  it("rejects value kinds that the complete consumer contract does not support", () => {
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        value: {
          kind: "integer",
          schema: z.number().int(),
          required: false,
        } as never,
      }),
    ).toThrow(/value kind integer is not supported/);
  });

  it.each([
    [
      "pose",
      booleanValue({ required: false }),
      { strategy: "pose", key: "poseName", spriteKey: "spriteNumber" },
      /legacy pose requires value kind string/,
    ],
    [
      "list",
      stringValue({ required: false }),
      { strategy: "list", key: "values" },
      /legacy list requires value kind stringList/,
    ],
    [
      "tortie",
      stringListValue({
        required: false,
        catalog: "values",
        maxItems: 2,
      }),
      { strategy: "tortie" },
      /legacy tortie requires value kind objectList/,
    ],
    [
      "booleanAlias",
      stringValue({ required: false }),
      { strategy: "booleanAlias", key: "enabled", aliases: ["active"] },
      /legacy booleanAlias requires value kind boolean/,
    ],
  ] as const)("rejects an incompatible %s legacy binding", (_name, value, legacy, expected) => {
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        value,
        legacy: legacy as never,
      }),
    ).toThrow(expected);
  });

  it("requires the legacy tortie item shape", () => {
    expect(() =>
      defineCatTrait({
        ...baseTrait,
        value: objectListValue({
          required: false,
          schema: z.object({ mask: z.string(), pattern: z.string() }),
          maxItems: 2,
        }),
        legacy: { strategy: "tortie" },
      }),
    ).toThrow(/string mask, pattern, and colour fields/);
  });

  it("requires a render input's target operation to read that trait", () => {
    const operationTrait = defineCatTrait({
      ...baseTrait,
      id: "__probe_owner",
      render: {
        kind: "operation",
        operationId: "probeOperation",
        layerId: "probeOperation",
        strategy: "basePelt",
        version: 1,
        reads: ["__probe_owner"],
        config: {},
      },
    });
    const inputTrait = defineCatTrait({
      ...baseTrait,
      id: "__probe_input",
      render: { kind: "input", operationId: "probeOperation" },
    });

    expect(() =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {},
        traits: [operationTrait, inputTrait],
        aliases: {},
        tombstones: {},
      }),
    ).toThrow(
      /render input probeOperation must declare __probe_input in reads/,
    );
  });

  it.each([
    [
      "spriteLayer",
      booleanValue({ required: false }),
      {
        valueTrait: "__probe_render",
        spriteFamily: "probe",
        diagnosticPrefix: "probe",
      },
      "string",
    ],
    [
      "catalogSpriteList",
      stringValue({ required: false, catalog: "values" }),
      {
        valueTrait: "__probe_render",
        catalog: "values",
        resolver: "direct",
      },
      "stringList",
    ],
    [
      "booleanSpriteLayer",
      stringValue({ required: false }),
      {
        valueTrait: "__probe_render",
        spriteKeys: ["probe"],
        blend: "alpha",
        diagnostic: "probe",
      },
      "boolean",
    ],
    [
      "solidMultiply",
      stringValue({ required: false }),
      {
        valueTrait: "__probe_render",
        colour: [0, 0, 0, 0],
        diagnostic: "probe",
      },
      "boolean",
    ],
    [
      "globalMirror",
      stringValue({ required: false }),
      { valueTrait: "__probe_render", affectsPreviousLayers: true },
      "boolean",
    ],
  ] as const)("checks %s against the configured trait value kind", (strategy, value, config, expectedKind) => {
    const trait = defineCatTrait({
      ...baseTrait,
      id: "__probe_render",
      value,
      render: {
        kind: "operation",
        operationId: "probeRender",
        layerId: "probeRender",
        strategy,
        version: 1,
        reads: ["__probe_render"],
        config,
      } as never,
    });
    expect(() =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {
          values: { source: "static", elements: [{ id: "one" }] },
        },
        traits: [trait],
        aliases: {},
        tombstones: {},
      }),
    ).toThrow(new RegExp(`requires valueTrait .* ${expectedKind} value`));
  });

  it("requires tintMultiply's owning trait to be a string", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      id: "__probe_tint",
      value: booleanValue({ required: false }),
      render: {
        kind: "operation",
        operationId: "probeTint",
        layerId: "probeTint",
        strategy: "tintMultiply",
        version: 1,
        reads: ["__probe_tint"],
        config: {},
      },
    });
    expect(() =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {},
        traits: [trait],
        aliases: {},
        tombstones: {},
      }),
    ).toThrow(/tintMultiply requires owner trait __probe_tint.*string value/);
  });

  it("rejects divergent slotList value and gacha catalogs", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      id: "__probe_catalogs",
      value: stringListValue({
        required: false,
        catalog: "storedValues",
        maxItems: 2,
      }),
      legacy: { strategy: "list", key: "catalogs" },
      gacha: {
        strategy: "slotList",
        catalog: "rolledValues",
        count: { strategy: "uniformCount", min: 0, max: 2 },
        unique: true,
      },
    });
    expect(() =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {
          storedValues: { source: "static", elements: [{ id: "stored" }] },
          rolledValues: { source: "static", elements: [{ id: "rolled" }] },
        },
        traits: [trait],
        aliases: {},
        tombstones: {},
      }),
    ).toThrow(
      /slotList catalog rolledValues must match value catalog storedValues/,
    );
  });

  it("limits single reveals to boolean or catalog-backed string values", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      value: stringValue({ required: false }),
      capabilities: {
        ...disabledCapabilities,
        reveal: { strategy: "single" },
      },
    });

    expect(() => compileProbeTrait(trait)).toThrow(
      /reveal single requires a boolean or catalog-backed string value/,
    );
  });

  it("requires slot reveals to use a catalog-backed string list", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      value: {
        kind: "stringList",
        schema: z.array(z.string()),
        required: false,
        maxItems: 2,
      } as never,
      legacy: { strategy: "list", key: "values" },
      capabilities: {
        ...disabledCapabilities,
        reveal: { strategy: "slots" },
      },
    });

    expect(() => compileProbeTrait(trait)).toThrow(
      /reveal slots requires a catalog-backed stringList value/,
    );
  });

  it("requires compound reveals to use an object list", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      value: stringListValue({
        required: false,
        catalog: "values",
        maxItems: 2,
      }),
      legacy: { strategy: "list", key: "values" },
      capabilities: {
        ...disabledCapabilities,
        reveal: { strategy: "compoundSlots" },
      },
    });

    expect(() =>
      compileProbeTrait(trait, {
        values: { source: "static", elements: [{ id: "one" }] },
      }),
    ).toThrow(/compoundSlots requires an objectList value/);
  });

  it("rejects mutation for values without a proven mutation source", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      value: stringValue({ required: false }),
      capabilities: {
        ...disabledCapabilities,
        inherit: "mutate",
      },
    });

    expect(() => compileProbeTrait(trait)).toThrow(
      /inherit mutate requires a catalog-backed string or stringList value/,
    );
  });

  it("rejects accumulation for non-list values", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      value: stringValue({ required: false, catalog: "values" }),
      capabilities: {
        ...disabledCapabilities,
        evolution: "accumulate",
      },
    });

    expect(() =>
      compileProbeTrait(trait, {
        values: { source: "static", elements: [{ id: "one" }] },
      }),
    ).toThrow(/evolution accumulate requires a list value/);
  });

  it("rejects slot generation that can violate a unique value contract", () => {
    const trait = defineCatTrait({
      ...baseTrait,
      id: "__probe_unique",
      value: stringListValue({
        required: false,
        default: [],
        catalog: "values",
        maxItems: 2,
        unique: true,
      }),
      gacha: {
        strategy: "slotList",
        catalog: "values",
        count: { strategy: "uniformCount", min: 0, max: 2 },
        unique: false,
      },
    });

    expect(() =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {
          values: { source: "static", elements: [{ id: "one" }] },
        },
        traits: [trait],
        aliases: {},
        tombstones: {},
      }),
    ).toThrow(/must select unique values/);
  });

  it("keeps trait history append-only and requires explicit removals", () => {
    const previous = { formatVersion: 1, traitIds: ["oldTrait"] } as const;
    expect(() =>
      buildTraitHistoryLock(
        { traits: [], aliases: {}, tombstones: {} },
        { ...previous, traitIds: [...previous.traitIds] },
      ),
    ).toThrow(/removed without an alias or tombstone/);
    expect(
      buildTraitHistoryLock(
        {
          traits: [{ id: "newTrait" }],
          aliases: { oldTrait: "newTrait" },
          tombstones: {},
        },
        { ...previous, traitIds: [...previous.traitIds] },
      ).traitIds,
    ).toEqual(["oldTrait", "newTrait"]);
  });

  it("preserves catalog lifecycle and weighting metadata in the public artifact", () => {
    const element = {
      id: "legacy-ribbon",
      label: "Legacy ribbon",
      weight: 7,
      deprecated: true,
    };

    expect(
      buildPublicCatalog({ weightedAccessories: [element] }).catalogs,
    ).toEqual({ weightedAccessories: [element] });
  });

  it("validates every statically referenced render asset", () => {
    const inventory: SpriteAssetInventory = {
      spriteIndex: {
        present: { spritesheet: "present" },
        fileMissing: { spritesheet: "missing-sheet" },
      },
      spriteFileExists: (path) => path === "present.png",
    };
    const catalogs: Record<string, PublicCatalogElement[]> = {
      values: [{ id: "one", label: "One" }],
    };
    const makeSystem = (
      render: Parameters<typeof defineCatTrait>[0]["render"],
      value: Parameters<typeof defineCatTrait>[0]["value"] = stringValue({
        required: false,
        catalog: "values",
      }),
    ) =>
      defineCatSystem({
        schemaVersion: 1,
        catalogs: {
          values: { source: "static", elements: [{ id: "one" }] },
        },
        traits: [
          defineCatTrait({
            ...baseTrait,
            value,
            render,
          }),
        ],
        aliases: {},
        tombstones: {},
      });

    const booleanSystem = makeSystem(
      {
        kind: "operation",
        operationId: "booleanAsset",
        layerId: "booleanAsset",
        strategy: "booleanSpriteLayer",
        version: 1,
        reads: [baseTrait.id],
        config: {
          valueTrait: baseTrait.id,
          spriteKeys: ["absent"],
          blend: "alpha",
          diagnostic: "probe",
        },
      },
      booleanValue({ required: false }),
    );
    expect(() =>
      validateRenderStrategyAssets(
        booleanSystem,
        getSystemOrderedRenderOperations(booleanSystem),
        catalogs,
        inventory,
      ),
    ).toThrow(/missing sprite absent/);

    const familySystem = makeSystem({
      kind: "operation",
      operationId: "familyAsset",
      layerId: "familyAsset",
      strategy: "spriteLayer",
      version: 1,
      reads: [baseTrait.id],
      config: {
        valueTrait: baseTrait.id,
        spriteFamily: "missingFamily",
        diagnosticPrefix: "probe",
      },
    });
    expect(() =>
      validateRenderStrategyAssets(
        familySystem,
        getSystemOrderedRenderOperations(familySystem),
        catalogs,
        inventory,
      ),
    ).toThrow(/missing sprite missingFamilyone/);

    const mappingSystem = makeSystem(
      {
        kind: "operation",
        operationId: "mappingAsset",
        layerId: "mappingAsset",
        strategy: "catalogSpriteList",
        version: 1,
        reads: [baseTrait.id],
        config: {
          valueTrait: baseTrait.id,
          catalog: "values",
          resolver: "mapping",
          sprites: { one: "fileMissing" },
        },
      },
      stringListValue({
        required: false,
        catalog: "values",
        maxItems: 2,
      }),
    );
    expect(() =>
      validateRenderStrategyAssets(
        mappingSystem,
        getSystemOrderedRenderOperations(mappingSystem),
        catalogs,
        inventory,
      ),
    ).toThrow(/missing missing-sheet\.png/);
  });

  it("narrows catalog-bound string and list fields in JSON Schema", () => {
    const schema = addCatalogEnumsToDocumentSchema(
      {
        type: "object",
        properties: {
          traits: {
            type: "object",
            properties: {
              value: { type: "string" },
              values: { type: "array", items: { type: "string" } },
              layers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    mask: { type: "string" },
                    pattern: { type: "string" },
                    colour: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      {
        choices: [{ id: "one", label: "One" }],
        masks: [{ id: "mask-one", label: "Mask one" }],
        patterns: [{ id: "pattern-one", label: "Pattern one" }],
        colours: [{ id: "colour-one", label: "Colour one" }],
      },
      [
        {
          ...baseTrait,
          id: "value",
          value: stringValue({ required: false, catalog: "choices" }),
        },
        {
          ...baseTrait,
          id: "values",
          value: stringListValue({
            required: false,
            catalog: "choices",
            maxItems: 2,
          }),
        },
        {
          ...baseTrait,
          id: "layers",
          value: objectListValue({
            required: false,
            schema: z.object({
              mask: z.string(),
              pattern: z.string(),
              colour: z.string(),
            }),
            maxItems: 2,
            unique: true,
          }),
          gacha: {
            strategy: "tortieList",
            maskCatalog: "masks",
            peltCatalog: "patterns",
            colourCatalog: "colours",
            count: { strategy: "uniformCount", min: 0, max: 2 },
            activationProbability: 1,
            fillProbability: 1,
            uniqueMasks: true,
          },
        },
      ],
    );
    const properties = (
      (schema.properties as Record<string, unknown>).traits as {
        properties: Record<string, Record<string, unknown>>;
      }
    ).properties;
    expect(properties.value.enum).toEqual(["one"]);
    expect((properties.values.items as Record<string, unknown>).enum).toEqual([
      "one",
    ]);
    expect(properties.values.uniqueItems).toBe(true);
    expect(properties.layers.uniqueItems).toBe(true);
    const layerProperties = (
      properties.layers.items as {
        properties: Record<string, Record<string, unknown>>;
      }
    ).properties;
    expect(layerProperties.mask.enum).toEqual(["mask-one"]);
    expect(layerProperties.pattern.enum).toEqual(["pattern-one"]);
    expect(layerProperties.colour.enum).toEqual(["colour-one"]);
  });

  it("includes palette colours in base and tortie schema enums", () => {
    const traitProperties =
      generatedDocumentSchema.properties.traits.properties;
    expect(traitProperties.colour.enum).toContain("AQC_MIDNIGHTZONE");
    expect(traitProperties.tortie.items.properties.colour.enum).toContain(
      "AQC_MIDNIGHTZONE",
    );
  });

  it("emits uniqueItems for every structurally unique product list", () => {
    const traitProperties =
      generatedDocumentSchema.properties.traits.properties;
    expect(traitProperties.accessories.uniqueItems).toBe(true);
    expect(traitProperties.scars.uniqueItems).toBe(true);
    expect(traitProperties.tortie.uniqueItems).toBe(true);
  });
});

describe("generated probe trait", () => {
  const probeTrait = defineCatTrait({
    id: "__probe_a81f",
    label: "Probe ear accessories",
    order: 195,
    value: stringListValue({
      required: false,
      default: [],
      catalog: "__probe_ear_accessories",
      maxItems: 2,
      unique: true,
    }),
    legacy: { strategy: "list", key: "__probe_a81f" },
    render: {
      kind: "operation",
      operationId: "__probe_a81f",
      layerId: "__probe_a81f",
      strategy: "catalogSpriteList",
      version: 1,
      after: ["accessories"],
      reads: ["__probe_a81f"],
      config: {
        valueTrait: "__probe_a81f",
        catalog: "__probe_ear_accessories",
        resolver: "accessory",
      },
    },
    gacha: {
      strategy: "slotList",
      catalog: "__probe_ear_accessories",
      count: {
        strategy: "weightedDiscrete",
        weights: { "0": 1, "1": 4, "2": 1 },
        min: 0,
        max: 2,
      },
      unique: true,
      dependsOn: ["pose"],
      availableForPose: true,
    },
    capabilities: {
      display: true,
      edit: "list",
      reveal: { strategy: "slots", timingKey: "__probe_a81f" },
      evolution: "accumulate",
      inherit: "none",
      settings: true,
    },
  });

  const probeSystem = defineCatSystem({
    schemaVersion: catSystem.schemaVersion,
    catalogs: {
      ...catSystem.catalogs,
      __probe_ear_accessories: {
        source: "static",
        elements: [
          {
            id: "ribbon-red",
            label: "Red ribbon",
            spriteKey: "acc_lifegenTOAST",
            poses: ["adult_short2"],
          },
        ],
      },
    },
    traits: [...catSystem.traits, probeTrait] as const,
    aliases: catSystem.aliases,
    tombstones: catSystem.tombstones,
  });

  it("is discovered by every capability consumer without an ID switch", () => {
    const traits = {
      __probe_a81f: ["ribbon-red"],
    };
    expect(
      getSystemOrderedRenderOperations(probeSystem).map(
        (operation) => operation.operationId,
      ),
    ).toContain("__probe_a81f");
    expect(
      getSystemSettingsControls(probeSystem).map((control) => control.traitId),
    ).toContain("__probe_a81f");
    expect(
      getSystemRevealPlan(probeSystem, traits).map((stage) => stage.traitId),
    ).toContain("__probe_a81f");
    expect(
      getSystemDisplayRows(probeSystem, traits).map((row) => row.traitId),
    ).toContain("__probe_a81f");
    expect(
      getSystemEvolutionTraits(probeSystem).map((trait) => trait.id),
    ).toContain("__probe_a81f");
    expect(
      getSystemInheritanceTraits(probeSystem).map((trait) => trait.id),
    ).not.toContain("__probe_a81f");
  });

  it("uses generic evolution and inheritance dispatch", () => {
    expect(
      applySystemEvolutionStrategies(
        probeSystem,
        { __probe_a81f: ["ribbon-red"] },
        { __probe_a81f: ["ribbon-blue", "ribbon-red"] },
      ).__probe_a81f,
    ).toEqual(["ribbon-red", "ribbon-blue"]);
    expect(
      applySystemInheritanceStrategies(
        probeSystem,
        { __probe_a81f: ["ribbon-red"] },
        { __probe_a81f: ["ribbon-blue"] },
        { random: () => 0 },
      ).__probe_a81f,
    ).toEqual([]);
  });

  it("keeps global transforms after newly inserted render layers", () => {
    const operations = getSystemOrderedRenderOperations(probeSystem);
    expect(operations.at(-2)?.operationId).toBe("__probe_a81f");
    expect(operations.at(-1)?.operationId).toBe("reverse");
  });
});
