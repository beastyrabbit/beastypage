import { describe, expect, it } from "vitest";
import {
  defineCatSystem,
  defineCatTrait,
  stringListValue,
} from "@/lib/cat-system/definition";
import { applySystemInheritanceStrategies } from "@/lib/cat-system/runtime";
import {
  applyGeneticsTraitOverrides,
  selectAncestryTraitMutations,
} from "../inheritance";

const probeTrait = defineCatTrait({
  id: "__probe_ancestry",
  label: "Probe ear accessories",
  order: 10,
  value: stringListValue({
    required: false,
    default: [],
    catalog: "probeEarAccessories",
    maxItems: 2,
    unique: true,
  }),
  legacy: { strategy: "list", key: "__probe_ancestry" },
  render: { kind: "context" },
  gacha: {
    strategy: "slotList",
    catalog: "probeEarAccessories",
    count: { strategy: "uniformCount", min: 0, max: 2 },
    unique: true,
  },
  capabilities: {
    display: false,
    edit: false,
    reveal: false,
    evolution: "none",
    inherit: "mutate",
    settings: false,
  },
});

const probeSystem = defineCatSystem({
  schemaVersion: 1,
  catalogs: {
    probeEarAccessories: {
      source: "static",
      elements: [
        { id: "EAR-RIBBON", label: "Ear ribbon" },
        { id: "EAR-FERN", label: "Ear fern" },
      ],
    },
  },
  traits: [probeTrait] as const,
  aliases: {},
  tombstones: {},
});

describe("registry-driven ancestry inheritance", () => {
  it("inherits a newly registered trait without a mutation-pool field", () => {
    const mutations = selectAncestryTraitMutations(
      probeSystem,
      {},
      {},
      { mutationRate: 0 },
    );
    const child = applySystemInheritanceStrategies(
      probeSystem,
      { __probe_ancestry: ["EAR-RIBBON"] },
      { __probe_ancestry: ["EAR-FERN"] },
      { mutations, random: () => 0 },
    );

    expect(child.__probe_ancestry).toEqual(["EAR-RIBBON"]);
  });

  it("mutates a list trait from the generic trait-ID pool", () => {
    const mutations = selectAncestryTraitMutations(
      probeSystem,
      {},
      { __probe_ancestry: ["EAR-FERN"] },
      { mutationRate: 1, random: () => 0 },
    );
    const child = applySystemInheritanceStrategies(
      probeSystem,
      { __probe_ancestry: ["EAR-RIBBON"] },
      { __probe_ancestry: ["EAR-RIBBON"] },
      { mutations, random: () => 0 },
    );

    expect(child.__probe_ancestry).toEqual(["EAR-FERN"]);
  });

  it("keeps genetics authoritative and clears absent optional coat data", () => {
    expect(
      applyGeneticsTraitOverrides(
        {
          pelt: "Tabby",
          coatPattern: "bengal-rosettes",
          colour: "BLACK",
          points: "COLOURPOINT",
        },
        { pelt: "SingleColour", colour: "GINGER" },
      ),
    ).toEqual({
      pelt: "SingleColour",
      colour: "GINGER",
      points: "COLOURPOINT",
    });
  });
});
