import { describe, expect, it } from "vitest";
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
  buildParameterOptions,
  PARAM_SEQUENCE,
  type SpriteMapperApi,
} from "./spinSupport";

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
