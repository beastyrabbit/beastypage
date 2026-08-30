import { describe, expect, it } from "vitest";
import {
  getCatalogElementsFromCatalog,
  getSelectableCatalogElementsFromCatalog,
  getSelectableTraitCatalogElementsFromCatalog,
  getTraitCatalogElementsFromCatalog,
  getTraitEditorDefinitionsFromCatalog,
} from "../catalog";

describe("cat catalog selection", () => {
  const source = {
    catalogs: {
      earAccessories: [
        { id: "ribbon", label: "Ribbon", poses: ["adult"] },
        {
          id: "retired-bow",
          label: "Retired bow",
          poses: ["adult"],
          deprecated: true,
        },
        { id: "kit-flower", label: "Kit flower", poses: ["kitten"] },
      ],
    },
  };

  it("keeps deprecated values in canonical access for existing cats", () => {
    expect(
      getCatalogElementsFromCatalog(source, "earAccessories", "adult").map(
        (element) => element.id,
      ),
    ).toEqual(["ribbon", "retired-bow"]);
  });

  it("excludes deprecated and pose-incompatible values from new choices", () => {
    expect(
      getSelectableCatalogElementsFromCatalog(
        source,
        "earAccessories",
        "adult",
      ).map((element) => element.id),
    ).toEqual(["ribbon"]);
  });

  it("keeps mutation candidates selectable without narrowing canonical validation", () => {
    const trait = {
      value: {
        kind: "stringList" as const,
        required: false,
        catalog: "earAccessories",
      },
      gacha: { strategy: "slotList", catalog: "earAccessories" },
    };

    expect(
      getTraitCatalogElementsFromCatalog(source, trait, "adult").map(
        (element) => element.id,
      ),
    ).toEqual(["ribbon", "retired-bow"]);
    expect(
      getSelectableTraitCatalogElementsFromCatalog(source, trait, "adult").map(
        (element) => element.id,
      ),
    ).toEqual(["ribbon"]);
  });

  it("does not offer deprecated values as new editor choices", () => {
    const editorSource = {
      ...source,
      traits: [
        {
          id: "earAccessories",
          label: "Ear accessories",
          order: 1,
          value: {
            kind: "stringList" as const,
            required: false,
            catalog: "earAccessories",
          },
          capabilities: {
            display: true,
            edit: "list" as const,
            reveal: false as const,
            evolution: "none" as const,
            inherit: "none" as const,
            settings: true,
          },
          gacha: { strategy: "none" },
          renderOperations: [],
        },
      ],
    };

    expect(
      getTraitEditorDefinitionsFromCatalog(
        editorSource,
        "adult",
      )[0]?.options.map((element) => element.id),
    ).toEqual(["ribbon"]);
  });
});
