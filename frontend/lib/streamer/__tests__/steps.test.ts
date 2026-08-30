import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  catDocumentToLegacyParams,
  decodeCatDocumentLegacy,
  defineCatSystem,
  defineCatTrait,
  objectListValue,
} from "@/lib/cat-system";
import {
  COAT_PATTERN_IDS,
  getCoatPatternName,
} from "@/lib/cat-v3/coatPatterns";
import { buildRegistryRevealSequence } from "@/utils/spinTiming";
import {
  createStreamSteps,
  getDefaultStreamParams,
  getStepById,
  type StreamCatalogSource,
  type StreamerParams,
} from "../steps";

vi.mock("@/lib/single-cat/spriteMapper", () => ({
  default: {
    getPeltNames: () => ["SingleColour", "Tabby", "Tortie", "Calico"],
  },
}));

describe("streamer voting coat choices", () => {
  it("keeps the existing specialized voting flow unchanged", () => {
    const params = getDefaultStreamParams();
    expect(createStreamSteps({ params }).map((step) => step.id)).toEqual([
      "colour",
      "pattern",
      "tortie_toggle",
      "eye_primary",
      "eye_secondary",
      "white_patches",
      "points_pattern",
      "vitiligo_pattern",
      "skin",
      "tint",
      "accessories_toggle",
      "scars_toggle",
      "pose",
    ]);
  });

  it("offers every derived coat and applies or clears it atomically", () => {
    const params = getDefaultStreamParams();
    const state: { params: StreamerParams; history: unknown[] } = {
      params,
      history: [],
    };
    const patternStep = getStepById(createStreamSteps(state), "pattern");
    expect(patternStep).not.toBeNull();

    const options = patternStep?.getOptions(state) ?? [];
    expect(options.map((option) => option.key)).toEqual(
      expect.arrayContaining(COAT_PATTERN_IDS),
    );

    const derived = options.find((option) => option.key === "bengal-rosettes");
    expect(derived).toBeDefined();
    if (!derived) throw new Error("Missing derived coat option");
    expect(derived.label).toBe(getCoatPatternName("bengal-rosettes"));
    patternStep?.apply(derived, state);
    expect(params.peltName).toBe("SingleColour");
    expect(params.coatPattern).toBe("bengal-rosettes");

    const base = options.find((option) => option.key === "Tabby");
    expect(base).toBeDefined();
    if (!base) throw new Error("Missing base pelt option");
    patternStep?.apply(base, state);
    expect(params.peltName).toBe("Tabby");
    expect(params.coatPattern).toBeUndefined();
  });

  it("preserves unrelated canonical and future traits in a resumed session", () => {
    const document = decodeCatDocumentLegacy({
      ...getDefaultStreamParams(),
      peltName: "SingleColour",
      coatPattern: "bengal-rosettes",
      lighting: true,
      accessories: ["FERN"],
      accessory: "FERN",
    });
    const params = {
      ...catDocumentToLegacyParams(document),
      schemaVersion: 2,
      traits: {
        ...document.traits,
        futureEarAccessory: ["EAR-FERN"],
      },
      unknownTraits: { futureMarking: "future" },
      lighting: false,
      accessories: [],
      accessory: undefined,
      _accessorySlots: undefined,
    } as unknown as StreamerParams;
    const state = { params, history: [] };
    const steps = createStreamSteps(state);

    expect(steps.map((step) => step.id)).toContain("accessory_slot_1");
    const patternStep = getStepById(steps, "pattern");
    const base = patternStep
      ?.getOptions(state)
      .find((option) => option.key === "Tabby");
    if (!patternStep || !base) throw new Error("Missing base pelt option");
    patternStep.apply(base, state);

    expect(params.schemaVersion).toBe(2);
    expect((params as unknown as Record<string, unknown>).lighting).toBe(true);
    expect(params.accessories).toEqual(["FERN"]);
    expect(params.traits).toMatchObject({
      pelt: "Tabby",
      lighting: true,
      accessories: ["FERN"],
      futureEarAccessory: ["EAR-FERN"],
    });
    expect(params.traits).not.toHaveProperty("coatPattern");
    expect(params.unknownTraits).toMatchObject({
      futureEarAccessory: ["EAR-FERN"],
      futureMarking: "future",
    });
  });
});

describe("registry compound-list voting", () => {
  it("builds and round-trips a valid compound value from gacha catalogs", () => {
    const traitId = "syntheticEarLayers";
    const syntheticTrait = defineCatTrait({
      id: traitId,
      label: "Synthetic ear layers",
      order: 900,
      value: objectListValue({
        required: false,
        default: [],
        maxItems: 2,
        unique: true,
        schema: z.object({
          mask: z.string(),
          pattern: z.string(),
          colour: z.string(),
        }),
      }),
      legacy: { strategy: "direct", key: traitId },
      render: { kind: "context" },
      gacha: {
        strategy: "tortieList",
        maskCatalog: "syntheticEarMasks",
        peltCatalog: "syntheticEarPatterns",
        colourCatalog: "syntheticEarColours",
        count: { strategy: "uniformCount", min: 0, max: 2 },
        activationProbability: 1,
        fillProbability: 1,
        uniqueMasks: true,
      },
      capabilities: {
        display: true,
        edit: "compoundList",
        reveal: { strategy: "compoundSlots" },
        evolution: "accumulate",
        inherit: "copy",
        settings: true,
      },
    });
    const syntheticSystem = defineCatSystem({
      schemaVersion: 7,
      aliases: {},
      tombstones: {},
      traits: [syntheticTrait],
      catalogs: {
        syntheticEarMasks: {
          source: "static",
          elements: [
            { id: "ear-left", label: "Left ear", poses: ["adult_short1"] },
            { id: "ear-wrong-pose", poses: ["adult_long1"] },
            { id: "ear-retired", deprecated: true },
          ],
        },
        syntheticEarPatterns: {
          source: "static",
          elements: [{ id: "ear-stripes", label: "Ear stripes" }],
        },
        syntheticEarColours: {
          source: "static",
          elements: [{ id: "EAR_GINGER", label: "Ear ginger" }],
        },
      },
    });
    expect(buildRegistryRevealSequence(syntheticSystem)[0]?.compoundMode).toBe(
      "wholeValue",
    );
    const source = {
      schemaVersion: syntheticSystem.schemaVersion,
      traits: [
        {
          id: syntheticTrait.id,
          label: syntheticTrait.label,
          order: syntheticTrait.order,
          value: {
            kind: syntheticTrait.value.kind,
            required: syntheticTrait.value.required,
            default: syntheticTrait.value.default,
            maxItems: syntheticTrait.value.maxItems,
            unique: syntheticTrait.value.unique,
          },
          capabilities: syntheticTrait.capabilities,
          gacha: syntheticTrait.gacha,
          renderOperations: [],
        },
      ],
      catalogs: Object.fromEntries(
        Object.entries(syntheticSystem.catalogs).map(([catalogId, catalog]) => [
          catalogId,
          catalog.source === "static" ? catalog.elements : [],
        ]),
      ),
    } as unknown as StreamCatalogSource;
    const params = getDefaultStreamParams();
    params.poseName = "adult_short1";

    const steps = createStreamSteps({ params }, source);
    const step = getStepById(steps, `registry_trait_${traitId}`);
    expect(step).not.toBeNull();
    const options = step?.getOptions({ params }) ?? [];
    expect(options.map((option) => option.label)).toEqual([
      "None",
      "Left ear / Ear stripes / Ear ginger",
    ]);

    const selected = options[1];
    if (!step || !selected) throw new Error("Missing compound voting option");
    expect(() => step.apply(selected, { params })).not.toThrow();
    expect(params.schemaVersion).toBe(7);
    const selectedValue = (params.traits as Record<string, unknown>)[traitId];
    expect(syntheticTrait.value.schema.parse(selectedValue)).toEqual([
      {
        mask: "ear-left",
        pattern: "ear-stripes",
        colour: "EAR_GINGER",
      },
    ]);

    const roundTripped = JSON.parse(JSON.stringify(params)) as StreamerParams;
    expect(() =>
      createStreamSteps({ params: roundTripped }, source),
    ).not.toThrow();
    expect((roundTripped.traits as Record<string, unknown>)[traitId]).toEqual(
      (params.traits as Record<string, unknown>)[traitId],
    );
  });

  it("uses valid presets when a compound trait deliberately has no gacha", () => {
    const traitId = "syntheticBadges";
    const syntheticTrait = defineCatTrait({
      id: traitId,
      label: "Synthetic badges",
      order: 910,
      value: objectListValue({
        required: false,
        default: [{ badge: "default" }],
        maxItems: 2,
        unique: true,
        schema: z.object({ badge: z.string() }),
      }),
      legacy: { strategy: "direct", key: traitId },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: true,
        edit: "compoundList",
        reveal: { strategy: "compoundSlots" },
        evolution: "preserve",
        inherit: "copy",
        settings: false,
      },
    });
    const syntheticSystem = defineCatSystem({
      schemaVersion: 8,
      aliases: {},
      tombstones: {},
      traits: [syntheticTrait],
      catalogs: {},
    });
    const source = {
      schemaVersion: syntheticSystem.schemaVersion,
      traits: [
        {
          id: syntheticTrait.id,
          label: syntheticTrait.label,
          order: syntheticTrait.order,
          value: {
            kind: syntheticTrait.value.kind,
            required: syntheticTrait.value.required,
            default: syntheticTrait.value.default,
            maxItems: syntheticTrait.value.maxItems,
            unique: syntheticTrait.value.unique,
          },
          capabilities: syntheticTrait.capabilities,
          gacha: syntheticTrait.gacha,
          renderOperations: [],
        },
      ],
      catalogs: {},
    } as StreamCatalogSource;
    const params = getDefaultStreamParams();
    params.traits = { [traitId]: [{ badge: "current" }] } as never;

    const step = getStepById(
      createStreamSteps({ params }, source),
      `registry_trait_${traitId}`,
    );
    const options = step?.getOptions({ params }) ?? [];
    expect(options.map((option) => option.label)).toEqual([
      "None",
      "Keep current value",
      "Use default value",
    ]);

    const useDefault = options[2];
    if (!step || !useDefault)
      throw new Error("Missing default compound preset");
    expect(() => step.apply(useDefault, { params })).not.toThrow();
    expect(
      syntheticTrait.value.schema.parse(
        (params.traits as Record<string, unknown>)[traitId],
      ),
    ).toEqual([{ badge: "default" }]);
  });
});
