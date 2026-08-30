import { describe, expect, it } from "vitest";
import publicCatalog from "../../../public/cat-system/public-cat-catalog.json";
import {
  type PublicCatalogElement,
  validateGachaCatalogContracts,
} from "../../../scripts/generate-cat-system";
import type { AnyCatTraitDefinition, CatSystemDefinition } from "../definition";
import { catSystem } from "../registry";

const resolvedCatalogs = publicCatalog.catalogs as Record<
  string,
  PublicCatalogElement[]
>;

describe("generated gacha catalog contracts", () => {
  it("accepts the product catalogs, including the projected coat-choice superset", () => {
    expect(() =>
      validateGachaCatalogContracts(catSystem, resolvedCatalogs),
    ).not.toThrow();
  });

  it("rejects a gacha catalog with no non-deprecated selectable value", () => {
    expect(() =>
      validateGachaCatalogContracts(catSystem, {
        ...resolvedCatalogs,
        colours: resolvedCatalogs.colours.map((element) => ({
          ...element,
          deprecated: true,
        })),
      }),
    ).toThrow(/colours has no non-deprecated selectable value/);
  });

  it("rejects a slot catalog that can emit values outside its value catalog", () => {
    const accessories = catSystem.traits.find(
      (trait) => trait.id === "accessories",
    );
    if (!accessories || accessories.gacha.strategy !== "slotList") {
      throw new Error("Product accessories trait is not a slotList");
    }
    const mismatchedTrait = {
      ...accessories,
      gacha: { ...accessories.gacha, catalog: "scars" },
    } as AnyCatTraitDefinition;
    const mismatchedSystem: CatSystemDefinition = {
      ...catSystem,
      traits: [mismatchedTrait],
    };

    expect(() =>
      validateGachaCatalogContracts(mismatchedSystem, resolvedCatalogs),
    ).toThrow(/scars is not compatible with value catalog accessories/);
  });

  it("rejects an unproven value added to a projected catalogChoice superset", () => {
    expect(() =>
      validateGachaCatalogContracts(catSystem, {
        ...resolvedCatalogs,
        coatChoices: [
          ...resolvedCatalogs.coatChoices,
          { id: "unprojected-coat", label: "Unprojected coat" },
        ],
      }),
    ).toThrow(/without a proven projection: unprojected-coat/);
  });

  it("requires pose-selected slots to cover every selectable gacha pose", () => {
    const firstPose = resolvedCatalogs.randomPoses[0]?.id;
    const firstAccessory = resolvedCatalogs.accessories[0];
    if (!firstPose || !firstAccessory) {
      throw new Error("Product pose or accessory catalog is empty");
    }

    expect(() =>
      validateGachaCatalogContracts(catSystem, {
        ...resolvedCatalogs,
        accessories: [{ ...firstAccessory, poses: [firstPose] }],
      }),
    ).toThrow(/accessories has no selectable value for poses/);
  });
});
