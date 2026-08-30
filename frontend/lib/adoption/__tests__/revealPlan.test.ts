import { describe, expect, it } from "vitest";
import {
  defineCatSystem,
  defineCatTrait,
  stringListValue,
  stringValue,
} from "@/lib/cat-system/definition";
import {
  buildAdoptionInitialTraits,
  buildAdoptionRevealPlan,
} from "../revealPlan";

const probeSystem = defineCatSystem({
  schemaVersion: 1,
  catalogs: {
    baseTraits: {
      source: "static",
      elements: [{ id: "base" }, { id: "final" }],
    },
    earAccessories: {
      source: "static",
      elements: [{ id: "EAR_BOW" }, { id: "EAR_RING" }],
    },
  },
  traits: [
    defineCatTrait({
      id: "baseTrait",
      label: "Base trait",
      order: 10,
      value: stringValue({
        required: true,
        default: "base",
        catalog: "baseTraits",
      }),
      legacy: { strategy: "direct", key: "baseTrait" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: false,
        edit: false,
        reveal: { strategy: "single", timingKey: "baseTrait", defaultSteps: 2 },
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    }),
    defineCatTrait({
      id: "__probe_earaccessory",
      label: "Ear accessories",
      order: 20,
      value: stringListValue({
        required: false,
        default: [],
        catalog: "earAccessories",
        maxItems: 2,
      }),
      legacy: { strategy: "list", key: "earAccessories" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: false,
        edit: false,
        reveal: {
          strategy: "slots",
          timingKey: "earAccessory",
          defaultSteps: 4,
        },
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    }),
  ],
  aliases: {},
  tombstones: {},
});

describe("adoption reveal plan", () => {
  it("discovers an additional slot trait from the registry", () => {
    const plan = buildAdoptionRevealPlan({
      system: probeSystem,
      traits: {
        baseTrait: "base",
        __probe_earaccessory: ["EAR_BOW", "EAR_RING"],
      },
    });

    expect(
      plan.map(({ traitId, slotIndex }) => ({ traitId, slotIndex })),
    ).toEqual([
      { traitId: "baseTrait", slotIndex: undefined },
      { traitId: "__probe_earaccessory", slotIndex: 0 },
      { traitId: "__probe_earaccessory", slotIndex: 1 },
    ]);
    expect(plan[1]).toMatchObject({
      type: "slot",
      param: "earAccessories",
      timingKey: "earAccessory",
      defaultSteps: 4,
    });
  });

  it("conceals every reveal trait through the same registry metadata", () => {
    const traits = buildAdoptionInitialTraits({
      system: probeSystem,
      finalTraits: {
        baseTrait: "final",
        __probe_earaccessory: ["EAR_BOW"],
        futureValue: "preserved",
      },
    });

    expect(traits).toEqual({
      baseTrait: "base",
      __probe_earaccessory: [],
      futureValue: "preserved",
    });
  });
});
