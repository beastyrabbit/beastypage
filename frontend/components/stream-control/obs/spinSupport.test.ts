import { afterEach, describe, expect, it, vi } from "vitest";
import {
  booleanValue,
  defineCatSystem,
  defineCatTrait,
  stringListValue,
  stringValue,
} from "@/lib/cat-system/definition";
import { COAT_PATTERN_IDS } from "@/lib/cat-v3/coatPatterns";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  buildRegistryRevealSequence,
  getRegistryRevealOptions,
  getRegistryRevealValue,
  REGISTRY_REVEAL_SEQUENCE,
  setRegistryRevealValue,
} from "@/utils/spinTiming";
import {
  applyParamValue,
  buildLayerOptionStrings,
  buildParameterOptions,
  cloneParams,
  formatValue,
  PARAM_SEQUENCE,
  type ParameterOptions,
  sampleValues,
  type SpriteMapperApi,
} from "./spinSupport";

describe("OBS option sampling", () => {
  it("keeps the same spaced layer samples and puts the target last", () => {
    const values = Array.from({ length: 30 }, (_, i) => `value_${i}`);
    expect(
      buildLayerOptionStrings(
        ["", "none", ...values, "value_0"],
        "value_4",
      ).map((option) => option.raw),
    ).toEqual([
      "none",
      "value_0",
      "value_2",
      "value_5",
      "value_7",
      "value_9",
      "value_11",
      "value_13",
      "value_15",
      "value_17",
      "value_19",
      "value_4",
    ]);
    expect(
      buildLayerOptionStrings(values, "value_4", false, { spinny: true }),
    ).toHaveLength(30);
  });

  it("preserves the none target rules with empty and duplicate inputs", () => {
    expect(buildLayerOptionStrings(null, null)).toEqual([
      { raw: "none", display: "None" },
    ]);
    expect(buildLayerOptionStrings(["a", "a", "none", ""], "a", false)).toEqual(
      [{ raw: "a", display: "A" }],
    );
    expect(
      buildLayerOptionStrings(["a"], "none", false).map((x) => x.raw),
    ).toEqual(["a"]);
  });

  it.each([1, 2, 3, 8, 0, -1, 2.5, Infinity, NaN])(
    "keeps a single final option last with limit %s",
    (limit) => {
      const options = {
        colour: [null, undefined, "A", "A", "B", "C", "D", "E", "F"],
      } as unknown as ParameterOptions;
      const sampled = sampleValues(options, "colour", "C", "C", limit);
      expect(sampled.at(-1)).toEqual({ raw: "C", display: "C" });
      expect(sampled.filter((option) => option.raw === "C")).toHaveLength(1);
      expect(new Set(sampled.map((option) => option.raw)).size).toBe(
        sampled.length,
      );
      const expected = new Map([
        [1, ["C"]],
        [2, ["A", "C"]],
        [3, ["A", "D", "C"]],
        [8, ["A", "B", "D", "E", "F", "C"]],
        [0, ["C"]],
        [-1, ["C"]],
        [2.5, ["A", "E", "C"]],
        [Infinity, ["A", "B", "D", "E", "F", "C"]],
        [NaN, ["A", "B", "D", "E", "F", "C"]],
      ]);
      expect(sampled.map((option) => option.raw)).toEqual(expected.get(limit));
    },
  );

  it("returns the final option when options are missing", () => {
    expect(sampleValues(null, "colour", "GINGER", "Ginger")).toEqual([
      { raw: "GINGER", display: "Ginger" },
    ]);
  });
});

describe("OBS parameter updates", () => {
  it.each([
    ["eyeColour2", "YELLOW"],
    ["whitePatches", "VAN"],
    ["points", "COLOURPOINT"],
    ["whitePatchesTint", "WHITE"],
    ["vitiligo", "MOON"],
  ] as const)("clears optional %s for case-insensitive none", (id, value) => {
    const params: Partial<CatParams> = {};
    applyParamValue(params, id, value);
    expect(params[id]).toBe(value);
    applyParamValue(params, id, "NoNe");
    expect(params[id]).toBeUndefined();
  });

  it.each(["accessory", "scar"] as const)(
    "keeps %s and its slot list in sync",
    (id) => {
      const params: Partial<CatParams> = {};
      const listKey = id === "accessory" ? "accessories" : "scars";
      for (const [value, single, list] of [
        [
          id === "accessory" ? "RED" : "SNOUT",
          id === "accessory" ? "RED" : "SNOUT",
          [id === "accessory" ? "RED" : "SNOUT"],
        ],
        ["NoNe", undefined, []],
        ["", undefined, []],
        [12, undefined, []],
      ] as const) {
        applyParamValue(params, id, value);
        expect(params[id]).toBe(single);
        expect(params[listKey]).toEqual(list);
      }
    },
  );

  it("switches named and numeric poses and ignores invalid numeric input", () => {
    const params: Partial<CatParams> = { spriteNumber: 8 };
    applyParamValue(params, "sprite", "adult_short2");
    expect(params.poseName).toBe("adult_short2");
    applyParamValue(params, "sprite", " 12 ");
    expect(params.spriteNumber).toBe(12);
    expect(params.poseName).toBe("senior0");
    applyParamValue(params, "sprite", NaN);
    expect(params.spriteNumber).toBe(12);
  });

  it("clears all tortie fields and canonical traits when disabled", () => {
    const params: Partial<CatParams> = {
      isTortie: true,
      tortie: [{ mask: "ONE", pattern: "Tabby", colour: "RED" }],
      tortieMask: "ONE",
      tortiePattern: "Tabby",
      tortieColour: "RED",
    };
    applyParamValue(params, "tortie", false);
    expect(params).toMatchObject({ isTortie: false, tortie: [] });
    expect(params.tortieMask).toBeUndefined();
    expect(params.tortiePattern).toBeUndefined();
    expect(params.tortieColour).toBeUndefined();
    expect(params.traits?.tortie).toEqual([]);
  });
});

describe("OBS compatibility fallbacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves existing object labels and custom string conversion", () => {
    expect(formatValue({ mask: "ONE" })).toBe("[Object Object]");
    expect(formatValue(["RED_FUR", "BLUE"])).toBe("Red Fur,Blue");
    expect(formatValue({ toString: () => "12 - RED_FUR" })).toBe("Red Fur");
  });

  it("clones JSON-compatible params when structuredClone is unavailable", () => {
    vi.stubGlobal("structuredClone", undefined);
    const params = { traits: { colour: "GINGER" } };
    const cloned = cloneParams(params);
    cloned.traits.colour = "BLACK";
    expect(params.traits.colour).toBe("GINGER");
  });

  it("keeps the JSON fallback when structuredClone rejects a value", () => {
    vi.stubGlobal("structuredClone", () => {
      throw new DOMException("Cannot clone", "DataCloneError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const params = { colour: "GINGER", unsupported: () => "ignored" };
    expect(cloneParams(params)).toEqual({ colour: "GINGER" });
  });
});

const probeCatalog = { source: "peltInfo", keys: ["patterns"] } as const;
const probeSystem = defineCatSystem({
  schemaVersion: 1,
  catalogs: {
    probeStrings: probeCatalog,
    probeSlots: probeCatalog,
  },
  traits: [
    defineCatTrait({
      id: "probeString",
      label: "Probe string",
      order: 10,
      value: stringValue({
        required: true,
        default: "SingleColour",
        catalog: "probeStrings",
      }),
      legacy: { strategy: "direct", key: "probeString" },
      render: { kind: "context" },
      gacha: { strategy: "catalogChoice", catalog: "probeStrings" },
      capabilities: {
        display: false,
        edit: false,
        reveal: { strategy: "single", defaultSteps: 4 },
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    }),
    defineCatTrait({
      id: "probeBoolean",
      label: "Probe boolean",
      order: 20,
      value: booleanValue({ required: true, default: false }),
      legacy: { strategy: "direct", key: "probeBoolean" },
      render: { kind: "context" },
      gacha: { strategy: "boolean", probability: 0.5 },
      capabilities: {
        display: false,
        edit: false,
        reveal: { strategy: "single", defaultSteps: 2 },
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    }),
    defineCatTrait({
      id: "probeSlots",
      label: "Probe slots",
      order: 30,
      value: stringListValue({
        required: false,
        default: [],
        catalog: "probeSlots",
        maxItems: 4,
      }),
      legacy: { strategy: "list", key: "probeSlots" },
      render: { kind: "context" },
      gacha: {
        strategy: "slotList",
        catalog: "probeSlots",
        count: { strategy: "uniformCount", min: 0, max: 4 },
        unique: true,
      },
      capabilities: {
        display: false,
        edit: false,
        reveal: { strategy: "slots", timingKey: "probeSlot", defaultSteps: 7 },
        evolution: "none",
        inherit: "none",
        settings: true,
      },
    }),
  ],
  aliases: {},
  tombstones: {},
});

describe("OBS progressive pelt options", () => {
  it("includes every derived coat pattern", async () => {
    const mapper: SpriteMapperApi = {
      loaded: true,
      init: async () => true,
      getPeltNames: () => ["SingleColour", "Tabby", "Tortie", "Calico"],
    };

    const options = await buildParameterOptions(mapper, true, [], true);

    expect(options.pelt).toEqual(expect.arrayContaining(COAT_PATTERN_IDS));
  });

  it("applies derived coats and clears them when a base pelt is selected", () => {
    const params: Partial<CatParams> = { peltName: "Tabby" };

    for (const coatPattern of COAT_PATTERN_IDS) {
      applyParamValue(params, "pelt", coatPattern);
      expect(params.peltName).toBe("SingleColour");
      expect(params.coatPattern).toBe(coatPattern);
      expect(params.traits?.pelt).toBe("SingleColour");
      expect(params.traits?.coatPattern).toBe(coatPattern);
    }

    applyParamValue(params, "pelt", "Mackerel");
    expect(params.peltName).toBe("Mackerel");
    expect(params).not.toHaveProperty("coatPattern");
    expect(params.traits?.pelt).toBe("Mackerel");
    expect(params.traits).not.toHaveProperty("coatPattern");
  });
});

describe("registry-driven reveal contract", () => {
  const sequence = buildRegistryRevealSequence(probeSystem);

  it("derives ordered single, boolean, and slot reveals without trait switches", () => {
    expect(sequence.map((definition) => definition.traitId)).toEqual([
      "probeString",
      "probeBoolean",
      "probeSlots",
    ]);
    expect(sequence[2]).toMatchObject({
      id: "probeSlot",
      strategy: "slots",
      timingKey: "probeSlot",
      layerKey: "probeSlots",
    });
  });

  it("derives catalog and boolean options for probe traits", () => {
    const catalogs = {
      probeStrings: [
        { id: "alpha" },
        { id: "retired-alpha", deprecated: true },
        { id: "beta" },
      ],
      probeSlots: [
        { id: "left" },
        { id: "retired-left", deprecated: true },
        { id: "right" },
      ],
    };
    expect(getRegistryRevealOptions(sequence[0], undefined, catalogs)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(getRegistryRevealOptions(sequence[1], undefined, catalogs)).toEqual([
      true,
      false,
    ]);
    expect(getRegistryRevealOptions(sequence[2], undefined, catalogs)).toEqual([
      "none",
      "left",
      "right",
    ]);
  });

  it("reads and writes forward-compatible canonical traits", () => {
    const params: Partial<CatParams> = {};
    setRegistryRevealValue(params, sequence[0], "alpha");
    setRegistryRevealValue(params, sequence[1], true);
    setRegistryRevealValue(params, sequence[2], ["left", "right"]);

    expect(getRegistryRevealValue(params, sequence[0])).toBe("alpha");
    expect(getRegistryRevealValue(params, sequence[1])).toBe(true);
    expect(getRegistryRevealValue(params, sequence[2])).toEqual([
      "left",
      "right",
    ]);
  });

  it("keeps OBS on the shared registry sequence", () => {
    expect(PARAM_SEQUENCE).toEqual(REGISTRY_REVEAL_SEQUENCE);
  });
});
