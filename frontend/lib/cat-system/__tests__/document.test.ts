import { describe, expect, it } from "vitest";
import {
  catDataToLegacyPersistence,
  catDocumentToLegacyParams,
  catParamsToLegacyPersistence,
  clearCatTrait,
  decodeCatDocumentLegacy,
  getDisplayRows,
  getRevealPlan,
  getSettingsControls,
  parseCatDocumentStrict,
  preserveUnknownTraits,
  setCatTrait,
  syncChangedRegistryTraitsFromLegacy,
} from "@/lib/cat-system";

const legacyCat = {
  spriteNumber: 8,
  peltName: "SingleColour",
  colour: "WHITE",
  eyeColour: "BLUE",
  skinColour: "PINK",
  shading: false,
  reverse: false,
};

describe("CatDocument", () => {
  it("imports legacy params and writes a strict canonical document", () => {
    const document = decodeCatDocumentLegacy(legacyCat);

    expect(document).toMatchObject({
      schemaVersion: 1,
      traits: {
        pose: "adult_short2",
        pelt: "SingleColour",
        colour: "WHITE",
        eyeColour: "BLUE",
        skinColour: "PINK",
        shading: false,
        reverse: false,
      },
    });
    expect(parseCatDocumentStrict(document)).toEqual(document);
  });

  it("normalizes legacy none sentinels before catalog validation", () => {
    const document = decodeCatDocumentLegacy({
      ...legacyCat,
      coatPattern: "none",
      eyeColour2: "none",
      whitePatches: "none",
      points: "NONE",
      vitiligo: " null ",
      tint: "none",
      whitePatchesTint: "none",
    });

    expect(document.traits).not.toHaveProperty("coatPattern");
    expect(document.traits).not.toHaveProperty("eyeColour2");
    expect(document.traits).not.toHaveProperty("whitePatches");
    expect(document.traits).not.toHaveProperty("points");
    expect(document.traits).not.toHaveProperty("vitiligo");
    expect(document.traits.tint).toBe("none");
    expect(document.traits.whitePatchesTint).toBe("none");
  });

  it("rejects unsupported catalog values at TypeScript writer boundaries", () => {
    const document = decodeCatDocumentLegacy(legacyCat);
    expect(() =>
      parseCatDocumentStrict({
        ...document,
        traits: { ...document.traits, colour: "NOT_A_REAL_COLOUR" },
      }),
    ).toThrow(/traits\.colour contains unsupported value/);
    expect(() =>
      parseCatDocumentStrict({
        ...document,
        traits: {
          ...document.traits,
          tortie: [
            { mask: "ONE", pattern: "SingleColour", colour: "NOT_REAL" },
          ],
        },
      }),
    ).toThrow(/traits\.tortie\[0\]\.colour contains unsupported value/);
  });

  it("rejects structurally duplicate items for unique list traits", () => {
    const document = decodeCatDocumentLegacy(legacyCat);
    expect(() =>
      parseCatDocumentStrict({
        ...document,
        traits: {
          ...document.traits,
          accessories: ["FERN", "FERN"],
        },
      }),
    ).toThrow(/Duplicate list item/);

    expect(() =>
      parseCatDocumentStrict({
        ...document,
        traits: {
          ...document.traits,
          tortie: [
            { mask: "ONE", pattern: "SingleColour", colour: "BLACK" },
            { colour: "BLACK", pattern: "SingleColour", mask: "ONE" },
          ],
        },
      }),
    ).toThrow(/Duplicate list item/);
  });

  it("preserves future traits while rejecting them as active strict keys", () => {
    const futureValue = { slots: ["EAR-FERN"] };
    const document = decodeCatDocumentLegacy({
      schemaVersion: 2,
      traits: {
        ...decodeCatDocumentLegacy(legacyCat).traits,
        earAccessory: futureValue,
      },
    });

    expect(document.unknownTraits?.earAccessory).toEqual(futureValue);
    expect(() =>
      parseCatDocumentStrict({
        ...document,
        traits: { ...document.traits, earAccessory: futureValue },
      }),
    ).toThrow();
    expect(
      preserveUnknownTraits(document, { anotherFutureTrait: ["value"] })
        .unknownTraits,
    ).toMatchObject({
      earAccessory: futureValue,
      anotherFutureTrait: ["value"],
    });
  });

  it("round-trips all registered legacy bindings", () => {
    const document = setCatTrait(
      setCatTrait(decodeCatDocumentLegacy(legacyCat), "accessories", ["FERN"]),
      "scars",
      ["FACE"],
    );
    const params = catDocumentToLegacyParams(document);
    const restored = decodeCatDocumentLegacy(params);

    expect(restored.traits).toEqual(document.traits);
    expect(params).toMatchObject({
      accessory: "FERN",
      accessories: ["FERN"],
      scar: "FACE",
      scars: ["FACE"],
    });
    expect(
      clearCatTrait(document, "accessories").traits.accessories,
    ).toBeUndefined();
    expect(() => clearCatTrait(document, "colour")).toThrow(
      "Required cat trait colour",
    );
  });

  it("restores compact Convex payloads without losing flattened future traits", () => {
    const futureValue = { slots: ["EAR-FERN"] };
    const document = decodeCatDocumentLegacy({
      ...legacyCat,
      earAccessory: futureValue,
    });
    const canonicalParams = {
      ...catDocumentToLegacyParams(document),
      schemaVersion: document.schemaVersion,
      traits: document.traits,
      unknownTraits: document.unknownTraits,
    };
    const catData = {
      document,
      params: canonicalParams,
      counts: { accessories: 0 },
    };

    const persisted = catDataToLegacyPersistence(catData);

    expect(persisted).not.toHaveProperty("document");
    expect(persisted.params).not.toHaveProperty("schemaVersion");
    expect(persisted.params).not.toHaveProperty("traits");
    expect(persisted.params).not.toHaveProperty("unknownTraits");
    expect(persisted.params).toHaveProperty("earAccessory", futureValue);
    expect(persisted).toHaveProperty("counts.accessories", 0);
    expect(catData).toHaveProperty("document", document);
    expect(catData.params).toHaveProperty("traits", document.traits);
  });

  it("projects unknown traits before stripping a direct params envelope", () => {
    const persisted = catParamsToLegacyPersistence({
      schemaVersion: 2,
      traits: decodeCatDocumentLegacy(legacyCat).traits,
      unknownTraits: { earAccessory: ["EAR-FERN"] },
      source: "test",
    });

    expect(persisted).toMatchObject({
      earAccessory: ["EAR-FERN"],
      source: "test",
    });
    expect(persisted).not.toHaveProperty("schemaVersion");
    expect(persisted).not.toHaveProperty("traits");
    expect(persisted).not.toHaveProperty("unknownTraits");
  });

  it("updates only the explicitly changed legacy projections", () => {
    const document = decodeCatDocumentLegacy({
      ...legacyCat,
      spriteNumber: 8,
      darkForest: true,
      darkMode: true,
      dead: true,
    });
    const params: Record<string, unknown> = {
      ...catDocumentToLegacyParams(document),
      schemaVersion: 2,
      traits: { ...document.traits, futureEarAccessory: ["EAR-FERN"] },
      unknownTraits: { futureMarking: { id: "future" } },
    };

    params.spriteNumber = 12;
    params.poseName = undefined;
    params.colour = "BLACK";
    const returned = syncChangedRegistryTraitsFromLegacy(params, ["pose"]);

    expect(returned).toBe(params);
    expect(params.traits).toMatchObject({
      pose: "senior0",
      colour: "WHITE",
      futureEarAccessory: ["EAR-FERN"],
    });
    expect(params.poseName).toBe("senior0");
    expect(params.spriteNumber).toBe(12);
    expect(params.schemaVersion).toBe(2);
    expect(params.colour).toBe("WHITE");
    expect(params.unknownTraits).toMatchObject({
      futureEarAccessory: ["EAR-FERN"],
      futureMarking: { id: "future" },
    });
  });

  it("synchronizes aliases, lists, tortie layers and explicit clears", () => {
    const document = decodeCatDocumentLegacy({
      ...legacyCat,
      peltName: "SingleColour",
      coatPattern: "bengal-rosettes",
      darkForest: true,
      darkMode: true,
      dead: true,
      accessories: ["FERN"],
      accessory: "FERN",
      tortie: [{ mask: "ONE", pattern: "SingleColour", colour: "BLACK" }],
    });
    const params: Record<string, unknown> = {
      ...catDocumentToLegacyParams(document),
      schemaVersion: document.schemaVersion,
      traits: document.traits,
      unknownTraits: document.unknownTraits,
    };

    params.peltName = "Tabby";
    delete params.coatPattern;
    params.darkForest = false;
    params.darkMode = false;
    params.dead = false;
    params.accessories = [];
    params.accessory = undefined;
    params.tortie = [];
    params.isTortie = false;
    syncChangedRegistryTraitsFromLegacy(params, [
      "pelt",
      "coatPattern",
      "darkForest",
      "dead",
      "accessories",
      "tortie",
    ]);

    expect(params.traits).toMatchObject({
      pelt: "Tabby",
      darkForest: false,
      dead: false,
      accessories: [],
      tortie: [],
    });
    expect(params.traits).not.toHaveProperty("coatPattern");
    expect(params).not.toHaveProperty("coatPattern");
    expect(params).toMatchObject({
      darkForest: false,
      darkMode: false,
      dead: false,
      accessories: [],
      isTortie: false,
      tortie: [],
    });
    expect(params.accessory).toBeUndefined();
  });

  it("upgrades a legacy-only payload without losing future flat values", () => {
    const params: Record<string, unknown> = {
      ...legacyCat,
      poseName: "adult_long0",
      spriteNumber: 9,
      futureEarAccessory: ["EAR-FERN"],
    };

    syncChangedRegistryTraitsFromLegacy(params, ["pose"]);

    expect(params.traits).toHaveProperty("pose", "adult_long0");
    expect(params.unknownTraits).toMatchObject({
      futureEarAccessory: ["EAR-FERN"],
    });
    expect(params.futureEarAccessory).toEqual(["EAR-FERN"]);
  });

  it("derives consumer metadata from capabilities", () => {
    const traits = {
      ...decodeCatDocumentLegacy(legacyCat).traits,
      accessories: ["FERN", "FEATHER"],
    };

    expect(getSettingsControls().map((control) => control.traitId)).toContain(
      "accessories",
    );
    expect(
      getRevealPlan(traits).filter((stage) => stage.traitId === "accessories"),
    ).toHaveLength(2);
    expect(getDisplayRows(traits).map((row) => row.traitId)).toContain(
      "accessories",
    );
  });
});
