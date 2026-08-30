import { describe, expect, it } from "vitest";
import {
  booleanValue,
  defineCatSystem,
  defineCatTrait,
  stringListValue,
  stringValue,
} from "@/lib/cat-system/definition";
import {
  applyEvolutionTraitChanges,
  type EvolutionDocument,
} from "../traitEvolution";

const probeSystem = defineCatSystem({
  schemaVersion: 1,
  catalogs: {
    earAccessories: {
      source: "static",
      elements: [{ id: "old-ear" }, { id: "new-ear" }, { id: "third-ear" }],
    },
  },
  traits: [
    defineCatTrait({
      id: "__probe_earaccessory",
      label: "Ear accessories",
      order: 10,
      value: stringListValue({
        required: false,
        default: [],
        catalog: "earAccessories",
        maxItems: 2,
        unique: true,
      }),
      legacy: { strategy: "list", key: "earAccessories" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "accumulate",
        inherit: "none",
        settings: false,
      },
    }),
    defineCatTrait({
      id: "__probe_replace",
      label: "Replace probe",
      order: 20,
      value: stringValue({ required: false }),
      legacy: { strategy: "direct", key: "replaceProbe" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "replace",
        inherit: "none",
        settings: false,
      },
    }),
    defineCatTrait({
      id: "__probe_preserve",
      label: "Preserve probe",
      order: 30,
      value: stringValue({ required: false }),
      legacy: { strategy: "direct", key: "preserveProbe" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "preserve",
        inherit: "none",
        settings: false,
      },
    }),
    defineCatTrait({
      id: "__probe_none",
      label: "None probe",
      order: 40,
      value: booleanValue({ required: false }),
      legacy: { strategy: "direct", key: "noneProbe" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: false,
        edit: false,
        reveal: false,
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    }),
  ],
  aliases: {},
  tombstones: {},
});

function parentDocument(): EvolutionDocument {
  return {
    schemaVersion: 1,
    traits: {
      __probe_earaccessory: ["old-ear"],
      __probe_replace: "old",
      __probe_preserve: "keep",
      __probe_none: false,
    },
    unknownTraits: { futureTrait: ["untouched"] },
  };
}

describe("trait evolution", () => {
  it("automatically accumulates a new string-list trait by traitId", () => {
    const result = applyEvolutionTraitChanges({
      parent: parentDocument(),
      system: probeSystem,
      changes: [{ traitId: "__probe_earaccessory", value: "new-ear" }],
    });

    expect(result.traits).toMatchObject({
      __probe_earaccessory: ["old-ear", "new-ear"],
    });
    expect(result.unknownTraits).toEqual({ futureTrait: ["untouched"] });
  });

  it("uses replace, preserve, and none from the trait capabilities", () => {
    const result = applyEvolutionTraitChanges({
      parent: parentDocument(),
      system: probeSystem,
      changes: [
        { traitId: "__probe_replace", value: "first" },
        { traitId: "__probe_replace", value: "last" },
        { traitId: "__probe_preserve", value: "discard" },
        { traitId: "__probe_none", value: true },
      ],
    });

    expect(result.traits).toMatchObject({
      __probe_replace: "last",
      __probe_preserve: "keep",
      __probe_none: false,
    });
  });

  it("deduplicates accumulated values and enforces maxItems", () => {
    const result = applyEvolutionTraitChanges({
      parent: parentDocument(),
      system: probeSystem,
      changes: [
        { traitId: "__probe_earaccessory", value: "old-ear" },
        { traitId: "__probe_earaccessory", value: "new-ear" },
        { traitId: "__probe_earaccessory", value: "third-ear" },
      ],
    });

    expect(result.traits).toMatchObject({
      __probe_earaccessory: ["old-ear", "new-ear"],
    });
  });

  it("replaces one accumulated item without a trait-specific branch", () => {
    const result = applyEvolutionTraitChanges({
      parent: parentDocument(),
      system: probeSystem,
      changes: [
        {
          traitId: "__probe_earaccessory",
          previous: "old-ear",
          value: "new-ear",
        },
      ],
    });

    expect(result.traits).toMatchObject({
      __probe_earaccessory: ["new-ear"],
    });
  });

  it("rejects unknown traits and values that fail the trait schema", () => {
    expect(() =>
      applyEvolutionTraitChanges({
        parent: parentDocument(),
        system: probeSystem,
        changes: [{ traitId: "missing", value: "new" }],
      }),
    ).toThrow("Unknown evolution trait missing");

    expect(() =>
      applyEvolutionTraitChanges({
        parent: parentDocument(),
        system: probeSystem,
        changes: [{ traitId: "__probe_replace", value: 42 }],
      }),
    ).toThrow("Invalid evolution value for __probe_replace");
  });
});
