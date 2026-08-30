import {
  defineCatSystem,
  defineCatTrait,
  stringListValue,
} from "../definition";
import { catSystem } from "../registry";

/**
 * One deliberately non-product trait ID shared by the TypeScript contract
 * probe, its generated renderer fixture, and the Python render test.
 */
export const EAR_ACCESSORY_PROBE_ID = "__probe_a81f" as const;
export const EAR_ACCESSORY_PROBE_POSE = "adult_short1" as const;
export const EAR_ACCESSORY_PROBE_SEED =
  "cat-system-ear-accessory-v1-1" as const;
export const EAR_ACCESSORY_PROBE_PRIMARY_VALUE = "wisteria-ear" as const;
export const EAR_ACCESSORY_PROBE_SECONDARY_VALUE = "toast-ear" as const;

export const EAR_ACCESSORY_PROBE_ELEMENTS = [
  {
    id: EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
    label: "Wisteria ear",
    spriteKey: "acc_plantsWISTERIA",
    poses: [EAR_ACCESSORY_PROBE_POSE],
    weight: 2,
  },
  {
    id: EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    label: "Toast ear",
    spriteKey: "acc_lifegenTOAST",
    poses: [EAR_ACCESSORY_PROBE_POSE],
    deprecated: false,
  },
] as const;

export const earAccessoryProbeTrait = defineCatTrait({
  id: EAR_ACCESSORY_PROBE_ID,
  label: "Probe ear accessories",
  description: "Contract-only trait that must never enter the product catalog.",
  order: 195,
  value: stringListValue({
    required: false,
    default: [],
    catalog: EAR_ACCESSORY_PROBE_ID,
    maxItems: 2,
    unique: true,
  }),
  legacy: { strategy: "list", key: EAR_ACCESSORY_PROBE_ID },
  render: {
    kind: "operation",
    operationId: EAR_ACCESSORY_PROBE_ID,
    layerId: EAR_ACCESSORY_PROBE_ID,
    strategy: "catalogSpriteList",
    version: 1,
    after: ["accessories"],
    reads: [EAR_ACCESSORY_PROBE_ID],
    config: {
      valueTrait: EAR_ACCESSORY_PROBE_ID,
      catalog: EAR_ACCESSORY_PROBE_ID,
      resolver: "mapping",
    },
  },
  gacha: {
    strategy: "slotList",
    catalog: EAR_ACCESSORY_PROBE_ID,
    count: { strategy: "uniformCount", min: 0, max: 2 },
    fillProbability: 1,
    unique: true,
    dependsOn: ["pose"],
    availableForPose: true,
  },
  capabilities: {
    display: true,
    edit: "list",
    reveal: {
      strategy: "slots",
      timingKey: EAR_ACCESSORY_PROBE_ID,
      defaultSteps: 4,
    },
    evolution: "accumulate",
    inherit: "mutate",
    settings: false,
  },
});

export const earAccessoryProbeSystem = defineCatSystem({
  ...catSystem,
  catalogs: {
    ...catSystem.catalogs,
    [EAR_ACCESSORY_PROBE_ID]: {
      source: "static",
      elements: EAR_ACCESSORY_PROBE_ELEMENTS,
    },
  },
  traits: [...catSystem.traits, earAccessoryProbeTrait] as const,
});

export const EAR_ACCESSORY_PROBE_FIXED_TRAITS = {
  pose: EAR_ACCESSORY_PROBE_POSE,
  pelt: "SingleColour",
  colour: "WHITE",
  tortie: [],
  eyeColour: "BLUE",
  scars: [],
  shading: false,
  lighting: false,
  darkForest: false,
  dead: false,
  skinColour: "PINK",
  accessories: [],
  reverse: false,
} as const;
