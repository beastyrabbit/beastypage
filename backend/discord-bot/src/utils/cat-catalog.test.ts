import assert from "node:assert/strict";
import test from "node:test";
import {
  getTraitChoicesFromCatalog,
  getTraitValueChoicesFromCatalog,
  type PublicCatCatalog,
} from "./cat-catalog.js";

const probeId = "__probe_a81f";
const catalog: PublicCatCatalog = {
  catalogHash: "0".repeat(64),
  formatVersion: 1,
  schemaVersion: 1,
  traits: [
    {
      id: probeId,
      label: "Probe ear accessories",
      order: 999,
      value: {
        kind: "stringList",
        catalog: probeId,
        required: false,
        maxItems: 2,
      },
      gacha: { strategy: "slotList", catalog: probeId },
      capabilities: { display: true, edit: "list", settings: true },
    },
    {
      id: "__probe_compound",
      label: "Probe compound layers",
      order: 1000,
      value: {
        kind: "objectList",
        required: false,
        maxItems: 2,
      },
      gacha: {
        strategy: "tortieList",
        maskCatalog: "probeMasks",
        peltCatalog: "probePatterns",
        colourCatalog: "probeColours",
      },
      capabilities: {
        display: true,
        edit: "compoundList",
        settings: true,
      },
    },
    {
      id: "__probe_unsupported_compound",
      label: "Unsupported compound layers",
      order: 1001,
      value: {
        kind: "objectList",
        required: false,
        maxItems: 2,
      },
      gacha: { strategy: "none" },
      capabilities: {
        display: true,
        edit: "compoundList",
        settings: true,
      },
    },
  ],
  catalogs: {
    [probeId]: [
      { id: "EAR-FERN", label: "Ear Fern" },
      { id: "EAR-TOAST", label: "Ear Toast" },
      { id: "EAR-OLD", label: "Old Ear", deprecated: true },
    ],
    probeMasks: [
      { id: "EAR-FERN", label: "Ear Fern" },
      { id: "EAR-OLD", label: "Old Ear", deprecated: true },
    ],
    probePatterns: [{ id: "SPOTS", label: "Spots" }],
    probeColours: [{ id: "GINGER", label: "Ginger" }],
  },
};

test("a generated trait automatically reaches Discord choices", () => {
  assert.deepEqual(getTraitChoicesFromCatalog(catalog, "ear", {
    settingsOnly: true,
    overrideableOnly: true,
  }), [{ name: "Probe ear accessories", value: probeId }]);
  assert.deepEqual(getTraitValueChoicesFromCatalog(catalog, probeId, "fern"), [
    { name: "Ear Fern", value: "EAR-FERN" },
  ]);
  assert.deepEqual(getTraitValueChoicesFromCatalog(catalog, probeId, "old"), []);
});

test("a supported compound trait reaches Discord as a validated JSON value", () => {
  assert.deepEqual(
    getTraitChoicesFromCatalog(catalog, "compound", {
      settingsOnly: true,
      overrideableOnly: true,
    }),
    [{ name: "Probe compound layers", value: "__probe_compound" }],
  );
  assert.deepEqual(
    getTraitValueChoicesFromCatalog(catalog, "__probe_compound", "fern"),
    [
      {
        name: "Ear Fern / Spots / Ginger",
        value:
          '{"mask":"EAR-FERN","pattern":"SPOTS","colour":"GINGER"}',
      },
    ],
  );
  assert.deepEqual(
    getTraitValueChoicesFromCatalog(catalog, "__probe_compound", "old"),
    [],
  );
});

test("an unsupported compound contract is excluded from Discord overrides", () => {
  assert.deepEqual(
    getTraitChoicesFromCatalog(catalog, "unsupported", {
      overrideableOnly: true,
    }),
    [],
  );
});
