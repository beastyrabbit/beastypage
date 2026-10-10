import { describe, expect, it } from "vitest";
import {
  applyParamValue,
  buildLayerOptionStrings,
  cloneParams,
  getParameterRawValue,
  getParameterValueForDisplay,
  MAX_SPINNY_VARIATIONS,
  PARAM_SEQUENCE,
  type ParameterOptions,
  sampleValues,
  type TortieSlot,
} from "@/components/stream-control/obs/spinSupport";
import { syncChangedRegistryTraitsFromLegacy } from "@/lib/cat-system";
import { getCoatChoiceValues } from "@/lib/cat-v3/coatPatterns";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  type RegistryRevealDefinition,
  setRegistryRevealValue,
} from "@/utils/spinTiming";
import {
  buildParamDescriptors,
  buildRegistrySlotDescriptors,
  buildStringLayerDescriptors,
  buildTortieSlotSpin,
  commitStringLayers,
  commitTortieSlots,
  createInitialProgressiveParams,
  isAnimatableParam,
  pickTortieColours,
  resolveRolledSlots,
  type SpinPools,
  spinParamRoute,
  TORTIE_STAGES,
} from "../descriptors";
import type { VariantDescriptor } from "../types";

// --- fixtures ---------------------------------------------------------------

const pools: SpinPools = {
  accessories: ["MAPLE LEAF", "HOLLY", "BLUE BERRIES", "CATTAIL"],
  scars: ["ONE", "TWO", "SNOUT", "CHEEK"],
  tortieMasks: ["ONE", "TWO", "THREE", "DELILAH"],
  tortiePatterns: ["SingleColour", "Tabby", "Marbled", "Smoke"],
  tortieColours: ["WHITE", "SILVER", "GREY", "GHOST", "BLACK"],
};

const parameterOptions = {
  sprite: ["adolescent_short0", "adolescent_short1", "adult_short2"],
  pelt: getCoatChoiceValues(["SingleColour", "Tabby", "Marbled"]),
  colour: pools.tortieColours,
  tortie: [true, false],
  tortieMask: pools.tortieMasks,
  tortiePattern: pools.tortiePatterns,
  tortieColour: pools.tortieColours,
  tint: ["none", "pink", "gray"],
  eyeColour: ["YELLOW", "AMBER", "BLUE"],
  eyeColour2: ["YELLOW", "AMBER", "BLUE", "none"],
  skinColour: ["BLACK", "PINK"],
  whitePatches: ["none", "VAN", "ONEEAR"],
  points: ["none", "COLOURPOINT"],
  whitePatchesTint: ["none", "cream"],
  vitiligo: ["none", "MOON"],
  accessory: ["none", ...pools.accessories],
  scar: ["none", ...pools.scars],
  shading: [true, false],
  reverse: [true, false],
} satisfies ParameterOptions;

function rolledCat(): Partial<CatParams> {
  const params: Partial<CatParams> = {
    poseName: "adult_short2",
    spriteNumber: 8,
    peltName: "Tabby",
    colour: "GREY",
    eyeColour: "AMBER",
    skinColour: "PINK",
    whitePatches: "VAN",
    tint: "pink",
    isTortie: true,
    tortie: [
      { mask: "TWO", pattern: "Marbled", colour: "BLACK" },
      { mask: "DELILAH", pattern: "Smoke", colour: "WHITE" },
    ],
    tortieMask: "TWO",
    tortiePattern: "Marbled",
    tortieColour: "BLACK",
    accessories: ["HOLLY", "CATTAIL"],
    accessory: "HOLLY",
    scars: ["SNOUT"],
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

function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function definition(id: string): RegistryRevealDefinition {
  const found = PARAM_SEQUENCE.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing definition ${id}`);
  return found;
}

// --- overlay reference: verbatim descriptor mapping from ObsOverlayClient ----

function overlayParamDescriptors(
  base: Partial<CatParams>,
  paramId: string,
  params: Partial<CatParams>,
): VariantDescriptor[] {
  const variationOptions = sampleValues(
    parameterOptions,
    paramId,
    getParameterRawValue(paramId, params),
    getParameterValueForDisplay(paramId, params),
    MAX_SPINNY_VARIATIONS,
  );
  return variationOptions.map((option, index) => {
    const previewParams = cloneParams(base);
    applyParamValue(previewParams, paramId, option.raw);
    return { id: `param-${paramId}-${index}`, option, params: previewParams };
  });
}

function overlayAccessoryDescriptors(
  base: Partial<CatParams>,
  committed: string[],
  target: string,
  i: number,
): VariantDescriptor[] {
  const variationOptions = buildLayerOptionStrings(
    pools.accessories,
    target,
    true,
    { spinny: true },
  );
  return variationOptions.map((option, variantIndex) => {
    const preview = cloneParams(base);
    const accessoriesList = committed.slice();
    if (typeof option.raw === "string" && option.raw !== "none") {
      accessoriesList.push(option.raw);
    }
    preview.accessories = accessoriesList;
    preview.accessory = accessoriesList[0];
    syncChangedRegistryTraitsFromLegacy(preview, ["accessories"]);
    return {
      id: `accessory-${i}-${variantIndex}`,
      option,
      params: preview,
      label: option.display,
      group: `accessory-${i + 1}`,
    };
  });
}

function overlayScarDescriptors(
  base: Partial<CatParams>,
  committed: string[],
  target: string,
  i: number,
): VariantDescriptor[] {
  const variationOptions = buildLayerOptionStrings(pools.scars, target, true, {
    spinny: true,
  });
  return variationOptions.map((option, variantIndex) => {
    const preview = cloneParams(base);
    const scarsList = committed.slice();
    if (typeof option.raw === "string" && option.raw !== "none") {
      scarsList.push(option.raw);
    }
    preview.scars = scarsList;
    preview.scar = scarsList[0];
    syncChangedRegistryTraitsFromLegacy(preview, ["scars"]);
    return {
      id: `scar-${i}-${variantIndex}`,
      option,
      params: preview,
      label: option.display,
      group: `scar-${i + 1}`,
    };
  });
}

function overlayRegistryDescriptors(
  def: RegistryRevealDefinition,
  choices: string[],
  base: Partial<CatParams>,
  committed: string[],
  target: string,
  index: number,
): VariantDescriptor[] {
  const variations = buildLayerOptionStrings(choices, target, true, {
    spinny: true,
  });
  return variations.map((option, variantIndex) => {
    const preview = cloneParams(base);
    const nextValues = [...committed];
    if (typeof option.raw === "string" && option.raw.toLowerCase() !== "none") {
      nextValues.push(option.raw);
    }
    setRegistryRevealValue(preview, def, nextValues);
    return {
      id: `${def.traitId}-${index}-${variantIndex}`,
      option,
      params: preview,
      label: option.display,
      group: `${def.traitId}-${index + 1}`,
    };
  });
}

/** The overlay's flashy tortie layer: colour picks, stages, final working. */
function overlayTortieLayer(
  base: Partial<CatParams>,
  committed: TortieSlot[],
  target: TortieSlot,
  i: number,
  random: () => number,
) {
  const colours = pools.tortieColours;
  const availableColours = colours.filter((c) => c !== target.colour);
  const startColour =
    availableColours.length > 0
      ? availableColours[Math.floor(random() * availableColours.length)]
      : target.colour;
  const maskPatternColours = colours.filter((c) => c !== target.colour);
  const maskPatternColour =
    maskPatternColours.length > 0
      ? maskPatternColours[Math.floor(random() * maskPatternColours.length)]
      : target.colour;
  let working: TortieSlot = { ...target, colour: startColour };
  const stageConfigs = [
    { kind: "mask" as const, source: pools.tortieMasks },
    { kind: "pattern" as const, source: pools.tortiePatterns },
    { kind: "colour" as const, source: colours },
  ];
  const stages: VariantDescriptor[][] = [];
  for (const stage of stageConfigs) {
    const stageTargetValue = {
      mask: working.mask,
      pattern: working.pattern,
      colour: target.colour,
    }[stage.kind];
    const options = buildLayerOptionStrings(
      stage.source,
      stageTargetValue,
      false,
      { spinny: true },
    );
    const descriptors = options.map((option, variantIndex) => {
      const preview = cloneParams(base);
      const candidateLayer: TortieSlot = {
        mask: stage.kind === "mask" ? (option.raw as string) : working.mask,
        pattern:
          stage.kind === "pattern" ? (option.raw as string) : working.pattern,
        colour:
          stage.kind === "colour" ? (option.raw as string) : maskPatternColour,
      };
      const tortieList = committed.map((layer) => ({ ...layer }));
      tortieList.push(candidateLayer);
      preview.tortie = tortieList;
      preview.isTortie = true;
      preview.tortieMask = candidateLayer.mask;
      preview.tortiePattern = candidateLayer.pattern;
      preview.tortieColour = candidateLayer.colour;
      syncChangedRegistryTraitsFromLegacy(preview, ["tortie"]);
      return {
        id: `tortie-${i}-${stage.kind}-${variantIndex}`,
        option,
        params: preview,
        label: option.display,
        group: `tortie-${i + 1}-${stage.kind}`,
      };
    });
    stages.push(descriptors);
    const finalStageValue = descriptors.at(-1)?.option.raw;
    if (typeof finalStageValue === "string") {
      working = { ...working, [stage.kind]: finalStageValue };
    }
  }
  return { startColour, maskPatternColour, stages, result: working };
}

// --- tests ------------------------------------------------------------------

describe("spin descriptor builders", () => {
  it("routes the param loop like the overlay", () => {
    expect(
      Object.fromEntries(
        PARAM_SEQUENCE.map((entry) => [entry.id, spinParamRoute(entry)]),
      ),
    ).toMatchObject({
      colour: "param",
      tortie: "param",
      accessory: "accessory",
      scar: "scar",
      sprite: "param",
    });
    expect(spinParamRoute({ ...definition("colour"), id: "tortieMask" })).toBe(
      "skip",
    );
    expect(
      spinParamRoute({ ...definition("accessory"), id: "probeSlot" }),
    ).toBe("registrySlots");
    expect(isAnimatableParam(definition("colour"), parameterOptions)).toBe(
      true,
    );
    expect(isAnimatableParam(definition("colour"), null)).toBe(false);
    expect(
      isAnimatableParam(definition("whitePatchesTint"), parameterOptions),
    ).toBe(false);
    expect(isAnimatableParam(definition("tortie"), parameterOptions)).toBe(
      false,
    );
  });

  it("reproduces the overlay's param descriptors with every option, target last", () => {
    const params = rolledCat();
    const base = createInitialProgressiveParams(params);
    for (const id of ["colour", "pelt", "eyeColour2", "tint", "sprite"]) {
      const built = buildParamDescriptors(
        parameterOptions,
        id,
        base,
        getParameterRawValue(id, params),
        getParameterValueForDisplay(id, params),
      );
      expect(built).toEqual(overlayParamDescriptors(base, id, params));
      expect(built.at(-1)?.option.raw).toEqual(
        getParameterRawValue(id, params),
      );
    }
    const colours = buildParamDescriptors(
      parameterOptions,
      "colour",
      base,
      "GREY",
      "Grey",
    );
    expect(colours.map((entry) => entry.option.raw)).toEqual([
      "WHITE",
      "SILVER",
      "GHOST",
      "BLACK",
      "GREY",
    ]);
    expect(colours.map((entry) => entry.id)).toEqual([
      "param-colour-0",
      "param-colour-1",
      "param-colour-2",
      "param-colour-3",
      "param-colour-4",
    ]);
    expect(colours[4].params.colour).toBe("GREY");
  });

  it("reproduces the overlay's accessory and scar slot descriptors", () => {
    const base = createInitialProgressiveParams(rolledCat());
    commitStringLayers(base, "accessory", ["HOLLY"]);
    const accessories = buildStringLayerDescriptors(
      "accessory",
      pools.accessories,
      base,
      ["HOLLY"],
      "CATTAIL",
      1,
    );
    expect(accessories).toEqual(
      overlayAccessoryDescriptors(base, ["HOLLY"], "CATTAIL", 1),
    );
    expect(accessories.map((entry) => entry.option.raw)).toEqual([
      "none",
      "MAPLE LEAF",
      "HOLLY",
      "BLUE BERRIES",
      "CATTAIL",
    ]);
    expect(accessories[0]).toMatchObject({
      id: "accessory-1-0",
      label: "None",
      group: "accessory-2",
    });
    expect(accessories[4].params.accessories).toEqual(["HOLLY", "CATTAIL"]);
    expect(accessories[0].params.accessories).toEqual(["HOLLY"]);

    const scars = buildStringLayerDescriptors(
      "scar",
      pools.scars,
      base,
      [],
      "none",
      0,
    );
    expect(scars).toEqual(overlayScarDescriptors(base, [], "none", 0));
    expect(scars.at(-1)?.option.raw).toBe("none");
  });

  it("reproduces the overlay's registry string slot descriptors", () => {
    const def = { ...definition("accessory"), id: "probeSlot" };
    // Registry writes reject duplicate list items, so the committed value is
    // not among the choices here (the overlay would throw the same way).
    const choices = ["MAPLE LEAF", "BLUE BERRIES", "CATTAIL"];
    const base = createInitialProgressiveParams(rolledCat());
    const built = buildRegistrySlotDescriptors(
      def,
      choices,
      base,
      ["HOLLY"],
      "CATTAIL",
      1,
    );
    expect(built).toEqual(
      overlayRegistryDescriptors(def, choices, base, ["HOLLY"], "CATTAIL", 1),
    );
    expect(built[0]).toMatchObject({
      id: "accessories-1-0",
      group: "accessories-2",
    });
  });

  it("reproduces the overlay's tortie stages with an injected rng", () => {
    const params = rolledCat();
    const base = createInitialProgressiveParams(params);
    applyParamValue(base, "tortie", true);
    const committed: TortieSlot[] = [
      { mask: "TWO", pattern: "Marbled", colour: "BLACK" },
    ];
    commitTortieSlots(base, committed);
    const target = { mask: "DELILAH", pattern: "Smoke", colour: "WHITE" };

    const spin = buildTortieSlotSpin(
      pools,
      base,
      committed,
      target,
      1,
      seededRng(7),
    );
    const reference = overlayTortieLayer(
      base,
      committed,
      target,
      1,
      seededRng(7),
    );
    expect(spin.startColour).toBe(reference.startColour);
    expect(spin.maskPatternColour).toBe(reference.maskPatternColour);
    expect(spin.stages.map((stage) => stage.descriptors)).toEqual(
      reference.stages,
    );
    expect(spin.result).toEqual(reference.result);
    expect(spin.result).toEqual(target);
    expect(spin.stages.map((stage) => stage.kind)).toEqual(
      TORTIE_STAGES.map((stage) => stage.kind),
    );
    expect(spin.stages[1].descriptors[0]).toMatchObject({
      id: "tortie-1-pattern-0",
      group: "tortie-2-pattern",
    });
    expect(spin.stages[0].descriptors[0].params.tortie).toHaveLength(2);
    expect(spin.stages[0].descriptors[0].params.tortieColour).toBe(
      spin.maskPatternColour,
    );
  });

  it("draws tortie colours deterministically from the rng, avoiding the target", () => {
    const target = { mask: "ONE", pattern: "Tabby", colour: "GREY" };
    const first = pickTortieColours(pools.tortieColours, target, seededRng(3));
    const again = pickTortieColours(pools.tortieColours, target, seededRng(3));
    expect(again).toEqual(first);
    const fixed = pickTortieColours(pools.tortieColours, target, () => 0.99);
    expect(fixed).toEqual({ startColour: "BLACK", maskPatternColour: "BLACK" });
    expect(pickTortieColours(["GREY"], target, () => 0.5)).toEqual({
      startColour: "GREY",
      maskPatternColour: "GREY",
    });
  });

  it("resolves rolled slots from selections first, then params", () => {
    const params = rolledCat();
    expect(resolveRolledSlots(params)).toEqual({
      accessorySlots: ["HOLLY", "CATTAIL"],
      scarSlots: ["SNOUT"],
      tortieSlots: params.tortie,
    });
    expect(
      resolveRolledSlots(params, {
        accessories: ["none", "HOLLY"],
        scars: [],
        tortie: [null, { mask: "ONE", pattern: "Tabby", colour: "GREY" }],
      }),
    ).toEqual({
      accessorySlots: ["none", "HOLLY"],
      scarSlots: [],
      tortieSlots: [null, { mask: "ONE", pattern: "Tabby", colour: "GREY" }],
    });
  });
});
