import { describe, expect, it } from "vitest";
import {
  applyParamValue,
  cloneParams,
  getParameterRawValue,
  getParameterValueForDisplay,
  PARAM_SEQUENCE,
  type ParameterOptions,
  type TortieSlot,
} from "@/components/stream-control/obs/spinSupport";
import { syncChangedRegistryTraitsFromLegacy } from "@/lib/cat-system";
import { getCoatChoiceValues } from "@/lib/cat-v3/coatPatterns";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  getRegistryRevealValue,
  type RegistryRevealDefinition,
} from "@/utils/spinTiming";
import {
  buildParamDescriptors,
  buildRegistrySlotDescriptors,
  buildStringLayerDescriptors,
  buildTortieSlotSpin,
  commitRegistrySlots,
  commitStringLayers,
  commitTortieSlots,
  createInitialProgressiveParams,
  isAnimatableParam,
  registrySlotChoices,
  registrySlotTargets,
  resolveRolledSlots,
  type SpinPools,
  spinParamRoute,
  stringLayerSlotValue,
} from "../descriptors";
import { buildSpinPlan, prefetchSpin, type SpinPlan } from "../spinPlan";
import type { VariantDescriptor } from "../types";

type Params = Partial<CatParams>;

// --- fixtures ---------------------------------------------------------------

const pools: SpinPools = {
  accessories: ["MAPLE LEAF", "HOLLY", "BLUE BERRIES", "CATTAIL"],
  scars: ["ONE", "TWO", "SNOUT", "CHEEK"],
  tortieMasks: ["ONE", "TWO", "THREE", "DELILAH"],
  tortiePatterns: ["SingleColour", "Tabby", "Marbled", "Smoke"],
  tortieColours: ["WHITE", "SILVER", "GREY", "GHOST", "BLACK"],
};

const parameterOptions = {
  sprite: ["adolescent_short0", "adult_short2"],
  pelt: getCoatChoiceValues(["SingleColour", "Tabby"]),
  colour: pools.tortieColours,
  tortie: [true, false],
  tortieMask: pools.tortieMasks,
  tortiePattern: pools.tortiePatterns,
  tortieColour: pools.tortieColours,
  tint: ["none", "pink"],
  eyeColour: ["YELLOW", "AMBER"],
  eyeColour2: ["YELLOW", "AMBER", "none"],
  skinColour: ["BLACK", "PINK"],
  whitePatches: ["none", "VAN"],
  points: ["none", "COLOURPOINT"],
  whitePatchesTint: ["none", "cream"],
  vitiligo: ["none", "MOON"],
  accessory: ["none", ...pools.accessories],
  scar: ["none", ...pools.scars],
  shading: [true, false],
  reverse: [true, false],
} satisfies ParameterOptions;

function rolledCat(): Params {
  const params: Params = {
    poseName: "adult_short2",
    spriteNumber: 8,
    peltName: "Tabby",
    colour: "GREY",
    eyeColour: "AMBER",
    skinColour: "PINK",
    whitePatches: "VAN",
    isTortie: true,
    tortie: [
      { mask: "TWO", pattern: "Marbled", colour: "BLACK" },
      { mask: "DELILAH", pattern: "Smoke", colour: "WHITE" },
    ],
    tortieMask: "TWO",
    tortiePattern: "Marbled",
    tortieColour: "BLACK",
    accessories: ["HOLLY"],
    accessory: "HOLLY",
    scars: ["SNOUT", "ONE"],
    scar: "SNOUT",
    shading: true,
    reverse: false,
    darkForest: false,
    darkMode: false,
    dead: false,
  };
  syncChangedRegistryTraitsFromLegacy(params, [
    "accessories",
    "scars",
    "tortie",
    "colour",
  ]);
  return params;
}

const slotSelections = {
  accessories: ["HOLLY"],
  scars: ["SNOUT", "none", "ONE"],
  tortie: [
    { mask: "TWO", pattern: "Marbled", colour: "BLACK" },
    null,
    { mask: "DELILAH", pattern: "Smoke", colour: "WHITE" },
  ],
};

/** A registry string-slot trait, so the generic slot phase is exercised. */
const probeSlot: RegistryRevealDefinition = {
  ...(PARAM_SEQUENCE.find(
    (entry) => entry.id === "accessory",
  ) as RegistryRevealDefinition),
  id: "probeSlot",
  timingKey: "probeSlot",
};
const sequence = [...PARAM_SEQUENCE, probeSlot];

function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

type LoaderCall =
  | { type: "frames"; base: Params; descriptors: VariantDescriptor[] }
  | { type: "single"; params: Params };

function recordingLoader() {
  const calls: LoaderCall[] = [];
  return {
    calls,
    prefetch(base: Params, descriptors: VariantDescriptor[]) {
      calls.push({ type: "frames", base, descriptors });
    },
    prefetchSingle(params: Params) {
      calls.push({ type: "single", params });
    },
  };
}

// --- reference: the overlay's generateCatPlus control flow -------------------

/**
 * Replays ObsOverlayClient.generateCatPlus and its spin*Slots functions
 * (after the count reveal) for a fixed mode, recording each render the way
 * the overlay issues it: renderVariantFrames → frames, renderCat/generateCat
 * → single. Descriptor lists come from the builders (checked against the
 * overlay in descriptors.test.ts); the control flow here is the overlay's.
 */
function overlayRenders(
  params: Params,
  spinny: boolean,
  rng: () => number,
): LoaderCall[] {
  const calls: LoaderCall[] = [];
  const frames = (base: Params, descriptors: VariantDescriptor[]) =>
    calls.push({ type: "frames", base: cloneParams(base), descriptors });
  const single = (state: Params) =>
    calls.push({ type: "single", params: cloneParams(state) });

  const { accessorySlots, scarSlots, tortieSlots } = resolveRolledSlots(
    params,
    slotSelections,
  );
  const progressive = createInitialProgressiveParams(params);

  const spinStringLayers = (
    kind: "accessory" | "scar",
    targetSlots: string[],
  ) => {
    if (targetSlots.length === 0) {
      single(progressive);
      return;
    }
    const pool = kind === "accessory" ? pools.accessories : pools.scars;
    const committed: string[] = [];
    for (let i = 0; i < targetSlots.length; i += 1) {
      const target = targetSlots[i] ?? "none";
      let value: string | null;
      if (spinny) {
        const descriptors = buildStringLayerDescriptors(
          kind,
          pool,
          progressive,
          committed,
          target,
          i,
        );
        frames(progressive, descriptors);
        value = stringLayerSlotValue(descriptors.at(-1)?.option.raw);
      } else {
        value = stringLayerSlotValue(target);
      }
      if (value) committed.push(value);
      commitStringLayers(progressive, kind, committed);
      single(progressive);
    }
  };

  const spinRegistry = (definition: RegistryRevealDefinition) => {
    const targetSlots = registrySlotTargets(
      (slotSelections as Record<string, unknown>)[definition.traitId] ??
        getRegistryRevealValue(params, definition),
    );
    if (targetSlots.length === 0) {
      commitRegistrySlots(progressive, definition, []);
      single(progressive);
      return;
    }
    const choices = registrySlotChoices(definition);
    const committed: string[] = [];
    for (let index = 0; index < targetSlots.length; index += 1) {
      const target = targetSlots[index];
      if (spinny) {
        frames(
          progressive,
          buildRegistrySlotDescriptors(
            definition,
            choices,
            progressive,
            committed,
            target,
            index,
          ),
        );
      }
      if (target.toLowerCase() !== "none") committed.push(target);
      commitRegistrySlots(progressive, definition, committed);
      single(progressive);
    }
  };

  const spinTortie = () => {
    if (tortieSlots.length === 0) {
      single(progressive);
      return;
    }
    const committed: TortieSlot[] = [];
    for (let i = 0; i < tortieSlots.length; i += 1) {
      const target = tortieSlots[i];
      if (!target) continue;
      if (spinny) {
        const spin = buildTortieSlotSpin(
          pools,
          progressive,
          committed,
          target,
          i,
          rng,
        );
        for (const stage of spin.stages) frames(progressive, stage.descriptors);
        committed.push({ ...spin.result });
      } else {
        committed.push({ ...target });
      }
      commitTortieSlots(progressive, committed);
      single(progressive);
    }
  };

  for (const definition of sequence) {
    const route = spinParamRoute(definition);
    if (route === "skip") continue;
    if (route === "accessory") {
      spinStringLayers("accessory", accessorySlots);
      continue;
    }
    if (route === "scar") {
      spinStringLayers("scar", scarSlots);
      continue;
    }
    if (route === "registrySlots") {
      spinRegistry(definition);
      continue;
    }
    const rawTargetValue = getParameterRawValue(definition.id, params);
    const displayValue = getParameterValueForDisplay(definition.id, params);
    if (spinny && isAnimatableParam(definition, parameterOptions)) {
      const descriptors = buildParamDescriptors(
        parameterOptions,
        definition.id,
        progressive,
        rawTargetValue,
        displayValue,
      );
      frames(progressive, descriptors);
      applyParamValue(
        progressive,
        definition.id,
        descriptors.at(-1)?.option.raw,
      );
    } else {
      applyParamValue(progressive, definition.id, rawTargetValue);
      single(progressive);
    }
    if (definition.compoundMode === "tortieParts") spinTortie();
  }
  single(params);
  return calls;
}

function plan(spinny: boolean, seed = 11, params = rolledCat()): SpinPlan {
  return buildSpinPlan({
    params,
    slotSelections,
    parameterOptions,
    pools,
    spinny,
    rng: seededRng(seed),
    sequence,
  });
}

// --- tests ------------------------------------------------------------------

describe("buildSpinPlan + prefetchSpin", () => {
  it("prefetches exactly the overlay's flashy renders in reveal order", () => {
    const loader = recordingLoader();
    prefetchSpin(loader, plan(true));
    const expected = overlayRenders(rolledCat(), true, seededRng(11));
    expect(loader.calls.map((call) => call.type)).toEqual(
      expected.map((call) => call.type),
    );
    expect(loader.calls).toEqual(expected);
  });

  it("prefetches only the single renders of a calm spin", () => {
    const loader = recordingLoader();
    prefetchSpin(loader, plan(false));
    expect(loader.calls.every((call) => call.type === "single")).toBe(true);
    expect(loader.calls).toEqual(
      overlayRenders(rolledCat(), false, seededRng(11)),
    );
  });

  it("keys phases for lookup by the client phase functions", () => {
    const flashy = plan(true);
    expect(flashy.phases.map((phase) => phase.key)).toEqual([
      "param:colour",
      "param:pelt",
      "param:eyeColour",
      "param:eyeColour2",
      "param:tortie",
      "tortie:0",
      "tortie:1",
      "tortie:2",
      "param:tint",
      "param:skinColour",
      "param:whitePatches",
      "param:points",
      "param:whitePatchesTint",
      "param:vitiligo",
      "accessory:0",
      "scar:0",
      "scar:1",
      "scar:2",
      "param:sprite",
      "registry:accessories:0",
      "final",
    ]);

    const colour = flashy.phase("param", "colour");
    expect(colour?.animate).toBe(true);
    expect(colour?.descriptors.at(-1)?.params.colour).toBe("GREY");
    expect(colour?.after.colour).toBe("GREY");
    expect(flashy.phase("param", "whitePatchesTint")?.animate).toBe(false);
    expect(flashy.phase("param", "tortie")?.descriptors).toEqual([]);

    const scar = flashy.phase("scar", 1);
    expect(scar).toMatchObject({ target: "none", value: null });
    expect(scar?.committed).toEqual(["SNOUT"]);
    expect(flashy.phase("scar", 2)?.after.scars).toEqual(["SNOUT", "ONE"]);

    const noneLayer = flashy.phase("tortie", 1);
    expect(noneLayer?.spin).toBeNull();
    expect(noneLayer?.after).toBe(noneLayer?.before);
    expect(flashy.phase("tortie", 2)?.after.tortie).toEqual([
      { mask: "TWO", pattern: "Marbled", colour: "BLACK" },
      { mask: "DELILAH", pattern: "Smoke", colour: "WHITE" },
    ]);

    expect(flashy.phase("registry", "accessories", 0)?.target).toBe("HOLLY");
    expect(flashy.phase("final").params).toEqual(rolledCat());
    expect(flashy.slots.scarSlots).toEqual(["SNOUT", "none", "ONE"]);
    expect(flashy.phase("param", "nope")).toBeUndefined();
  });

  it("plans a single render for slot groups with nothing to spin", () => {
    const params = rolledCat();
    const empty = buildSpinPlan({
      params,
      slotSelections: { accessories: [], scars: [], tortie: [] },
      parameterOptions,
      pools,
      spinny: true,
    });
    const keys = empty.phases.map((phase) => phase.key);
    expect(keys).toContain("empty:accessory");
    expect(keys).toContain("empty:scar");
    expect(keys).toContain("empty:tortie");
    expect(empty.phase("empty", "accessory")?.params).toEqual(
      empty.phase("param", "vitiligo")?.after,
    );
    expect(empty.phase("empty", "tortie")?.params).toEqual(
      empty.phase("param", "tortie")?.after,
    );
  });

  it("is deterministic for an injected rng and leaves calm plans lazy", () => {
    const a = plan(true, 5);
    const b = plan(true, 5);
    expect(a.phase("tortie", 0)?.spin?.startColour).toBe(
      b.phase("tortie", 0)?.spin?.startColour,
    );
    expect(a.phase("tortie", 2)?.spin?.maskPatternColour).toBe(
      b.phase("tortie", 2)?.spin?.maskPatternColour,
    );
    const stageA = a.phase("tortie", 2)?.spin?.stages[0].descriptors;
    expect(stageA).toEqual(b.phase("tortie", 2)?.spin?.stages[0].descriptors);
    expect(stageA?.[0].params.tortieColour).toBe(
      a.phase("tortie", 2)?.spin?.maskPatternColour,
    );

    // Descriptors are memoized per phase, so client and prefetch share them.
    const colour = a.phase("param", "colour");
    expect(colour?.descriptors).toBe(colour?.descriptors);

    const calm = plan(false);
    expect(calm.phase("param", "colour")?.animate).toBe(false);
    expect(calm.phase("param", "colour")?.descriptors).toHaveLength(
      parameterOptions.colour.length,
    );
  });
});
