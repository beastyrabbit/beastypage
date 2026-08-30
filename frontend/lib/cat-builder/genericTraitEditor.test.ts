import { describe, expect, it } from "vitest";
import {
  createDualCatPayload,
  getTraitEditorDefinitions,
  type TraitEditorDefinition,
} from "@/lib/cat-system";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  builderParamsToCatDocument,
  clearBuilderTraitValue,
  filterUnhandledTraitEditorDefinitions,
  getBuilderTraitValue,
  hydrateBuilderParams,
  mutateBuilderParams,
  setBuilderTraitValue,
  synchronizeBuilderParams,
} from "./genericTraitEditor";

const BASE_PARAMS: CatParams = {
  spriteNumber: 8,
  poseName: "adult_short0",
  peltName: "SingleColour",
  colour: "WHITE",
  isTortie: false,
  tortie: [],
  eyeColour: "YELLOW",
  skinColour: "PINK",
  shading: false,
  reverse: false,
  accessories: [],
  scars: [],
};

describe("generic builder trait adapter", () => {
  it("discovers a new stringList editor without a trait-id branch", () => {
    const earAccessoryProbe: TraitEditorDefinition = {
      traitId: "earAccessory",
      label: "Ear accessories",
      description: "Probe trait",
      kind: "list",
      valueKind: "stringList",
      required: false,
      maxItems: 2,
      options: [
        { id: "EAR_FERN", label: "Ear fern" },
        { id: "EAR_FEATHER", label: "Ear feather" },
      ],
    };

    const fallback = filterUnhandledTraitEditorDefinitions(
      [...getTraitEditorDefinitions(), earAccessoryProbe],
      ["pose", "pelt", "accessories"],
    );

    expect(fallback).toContainEqual(earAccessoryProbe);
  });

  it("writes a list through CatDocument and keeps it in the render payload", () => {
    const params = synchronizeBuilderParams(BASE_PARAMS);
    const updated = setBuilderTraitValue(params, "accessories", [
      "MAPLE LEAF",
      "HOLLY",
    ]);
    const document = builderParamsToCatDocument(updated);
    const renderPayload = createDualCatPayload(document);

    expect(getBuilderTraitValue(updated, "accessories")).toEqual([
      "MAPLE LEAF",
      "HOLLY",
    ]);
    expect(updated.traits?.accessories).toEqual(["MAPLE LEAF", "HOLLY"]);
    expect(renderPayload.document.traits.accessories).toEqual([
      "MAPLE LEAF",
      "HOLLY",
    ]);
    expect(renderPayload.params.accessories).toEqual(["MAPLE LEAF", "HOLLY"]);
  });

  it("reconciles later specialized mutations into the canonical envelope", () => {
    const withGenericEdit = setBuilderTraitValue(
      synchronizeBuilderParams(BASE_PARAMS),
      "lighting",
      true,
    );
    const afterSpecializedEdit = mutateBuilderParams(
      withGenericEdit,
      (draft) => {
        draft.colour = "BLACK";
      },
    );

    expect(afterSpecializedEdit.colour).toBe("BLACK");
    expect(afterSpecializedEdit.traits?.colour).toBe("BLACK");
    expect(afterSpecializedEdit.traits?.lighting).toBe(true);
  });

  it("does not restore a default-free optional trait after it is cleared", () => {
    const withSecondEye = setBuilderTraitValue(
      synchronizeBuilderParams(BASE_PARAMS),
      "eyeColour2",
      "BLUE",
    );
    const cleared = clearBuilderTraitValue(withSecondEye, "eyeColour2");
    const resynchronized = synchronizeBuilderParams(cleared);

    expect(getBuilderTraitValue(resynchronized, "eyeColour2")).toBeUndefined();
    expect(resynchronized.traits).not.toHaveProperty("eyeColour2");
  });

  it("hydrates canonical slot lists before legacy builder controls use them", () => {
    const canonical = builderParamsToCatDocument({
      ...BASE_PARAMS,
      accessories: ["MAPLE LEAF", "HOLLY"],
      scars: ["ONE"],
    });
    const hydrated = hydrateBuilderParams({
      ...BASE_PARAMS,
      schemaVersion: canonical.schemaVersion,
      traits: canonical.traits,
    });

    expect(hydrated.accessories).toEqual(["MAPLE LEAF", "HOLLY"]);
    expect(hydrated.scars).toEqual(["ONE"]);
    expect(hydrated.traits?.accessories).toEqual(["MAPLE LEAF", "HOLLY"]);
  });
});
