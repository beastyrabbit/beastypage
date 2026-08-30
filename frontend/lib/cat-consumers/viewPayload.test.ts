import { describe, expect, it } from "vitest";
import {
  defineCatSystem,
  defineCatTrait,
  getSystemDisplayRows,
  stringListValue,
} from "@/lib/cat-system";
import {
  formatCatDisplayRows,
  normalizeCatViewPayload,
  toCanonicalRenderPayload,
} from "./viewPayload";

const LEGACY_CAT = {
  spriteNumber: 8,
  poseName: "adult_short0",
  peltName: "SingleColour",
  colour: "WHITE",
  eyeColour: "YELLOW",
  skinColour: "PINK",
  shading: false,
  reverse: false,
};

describe("canonical view payload", () => {
  it("reads legacy slot wrappers into one canonical document", () => {
    const canonical = normalizeCatViewPayload({
      params: { ...LEGACY_CAT, viewerMetadata: "keep-me" },
      integrationMetadata: "also-keep-me",
      accessorySlots: ["MAPLE LEAF"],
      scarSlots: ["ONE"],
      counts: { accessories: 1, scars: 1 },
    });

    expect(canonical.document.traits.accessories).toEqual(["MAPLE LEAF"]);
    expect(canonical.document.traits.scars).toEqual(["ONE"]);
    expect(canonical.document.unknownTraits?.viewerMetadata).toBe("keep-me");
    expect(canonical.document.unknownTraits?.integrationMetadata).toBe(
      "also-keep-me",
    );
    expect(canonical.params.traits).toEqual(canonical.document.traits);
  });

  it("keeps legacy reveal counts even when their slots are placeholders", () => {
    const canonical = normalizeCatViewPayload({
      params: LEGACY_CAT,
      accessorySlots: ["none", "none"],
      counts: { accessories: 2 },
    });

    expect(canonical.accessorySlots).toEqual([]);
    expect(canonical.counts.accessories).toBe(2);
  });

  it("recovers mixed-rollout slots beside a canonical envelope", () => {
    const base = normalizeCatViewPayload(LEGACY_CAT).document;
    const canonical = normalizeCatViewPayload({
      document: base,
      accessorySlots: ["MAPLE LEAF"],
      traitSlots: { earAccessory: ["EAR_RIBBON"] },
    });

    expect(canonical.document.traits.accessories).toEqual(["MAPLE LEAF"]);
    expect(canonical.document.unknownTraits?.earAccessory).toEqual([
      "EAR_RIBBON",
    ]);
  });

  it("preserves future traits for an older tolerant reader and render payload", () => {
    const canonical = normalizeCatViewPayload({
      schemaVersion: 2,
      traits: {
        ...normalizeCatViewPayload(LEGACY_CAT).document.traits,
        earAccessory: ["EAR_RIBBON"],
      },
    });
    const renderPayload = toCanonicalRenderPayload(canonical);

    expect(canonical.document.unknownTraits?.earAccessory).toEqual([
      "EAR_RIBBON",
    ]);
    expect(renderPayload.document?.unknownTraits?.earAccessory).toEqual([
      "EAR_RIBBON",
    ]);
  });

  it("formats a future display-capable list without a trait-id branch", () => {
    const earAccessory = defineCatTrait({
      id: "earAccessory",
      label: "Ear accessories",
      order: 10,
      value: stringListValue({
        required: false,
        default: [],
        catalog: "earAccessories",
        maxItems: 2,
        unique: true,
      }),
      legacy: { strategy: "list", key: "earAccessory" },
      render: { kind: "context" },
      gacha: { strategy: "none" },
      capabilities: {
        display: true,
        edit: "list",
        reveal: false,
        evolution: "none",
        inherit: "none",
        settings: false,
      },
    });
    const probeSystem = defineCatSystem({
      schemaVersion: 1,
      traits: [earAccessory],
      catalogs: {
        earAccessories: {
          source: "static",
          elements: [{ id: "EAR_RIBBON", label: "Ear ribbon" }],
        },
      },
      aliases: {},
      tombstones: {},
    });
    const rows = formatCatDisplayRows(
      getSystemDisplayRows(probeSystem, {
        earAccessory: ["EAR_RIBBON"],
      }),
    );

    expect(rows).toEqual([
      {
        key: "earAccessory-0",
        traitId: "earAccessory",
        label: "Ear accessories 1",
        value: "Ear ribbon",
      },
    ]);
  });
});
