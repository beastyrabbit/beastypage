import { describe, expect, it } from "vitest";
import {
  buildAdoptionInitialTraits,
  buildAdoptionRevealPlan,
} from "@/lib/adoption/revealPlan";
import {
  applyGeneticsTraitOverrides,
  selectAncestryTraitMutations,
} from "@/lib/ancestry-tree/inheritance";
import { filterUnhandledTraitEditorDefinitions } from "@/lib/cat-builder/genericTraitEditor";
import {
  getTraitEditorDefinitionsFromCatalog,
  type PublicCatTrait,
  publicCatCatalog,
} from "@/lib/cat-system/catalog";
import {
  createGachaCatalogsFromPublicCatalog,
  rollCatFromSystem,
} from "@/lib/cat-system/gacha";
import {
  applySystemInheritanceStrategies,
  getSystemDisplayRows,
  getSystemRevealPlan,
  getSystemSettingsControls,
} from "@/lib/cat-system/runtime";
import {
  EAR_ACCESSORY_PROBE_FIXED_TRAITS,
  EAR_ACCESSORY_PROBE_ID,
  EAR_ACCESSORY_PROBE_POSE,
  EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
  EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
  earAccessoryProbeSystem,
} from "@/lib/cat-system/testing/earAccessoryProbe";
import {
  type EvolutionPools,
  generateEvolutionBatch,
} from "@/lib/evolution/evolutionGenerator";
import { applyEvolutionTraitChanges } from "@/lib/evolution/traitEvolution";
import {
  createStreamSteps,
  getDefaultStreamParams,
  getStepById,
} from "@/lib/streamer/steps";
import { buildRegistryRevealSequence } from "@/utils/spinTiming";
import probeArtifact from "../testing/fixtures/cat-system-ear-accessory-probe.generated.json";

const probeId = EAR_ACCESSORY_PROBE_ID;
const fixture = probeArtifact as typeof probeArtifact & {
  probeId: typeof probeId;
  renderDocument: {
    schemaVersion: number;
    traits: Record<string, unknown>;
  };
  baseDocument: {
    schemaVersion: number;
    traits: Record<string, unknown>;
  };
};
const fixtureCatalogs = createGachaCatalogsFromPublicCatalog({
  catalogs: {
    ...publicCatCatalog.catalogs,
    ...fixture.renderPlan.catalogs,
  },
});
const emptyEvolutionPools: EvolutionPools = {
  tortieMasks: [],
  tortiePatterns: [],
  baseColours: [],
  experimentalColours: [],
  accessories: [],
  scars: [],
};

describe("shared ear-accessory contract probe", () => {
  it("loads the exact generated fixture that the Python renderer test consumes", () => {
    expect(fixture.generatedBy).toBe(
      "frontend/scripts/generate-cat-system-probe.ts",
    );
    expect(fixture.probeId).toBe(probeId);
    expect(fixture.probeDefinition.id).toBe(probeId);
    expect(fixture.probeDefinition.value.catalog).toBe(probeId);
    expect(
      fixture.renderPlan.operations.find(
        (operation) => operation.id === probeId,
      ),
    ).toMatchObject({
      id: probeId,
      layerId: probeId,
      strategy: "catalogSpriteList",
      config: { valueTrait: probeId, catalog: probeId },
    });
    expect(fixture.renderDocument.traits[probeId]).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
    ]);
    expect(fixture.baseDocument.traits[probeId]).toEqual([]);
    expect(publicCatCatalog.traits.some((trait) => trait.id === probeId)).toBe(
      false,
    );
    expect(publicCatCatalog.catalogs[probeId]).toBeUndefined();
  });

  it("rolls the probe through its fixed shared gacha contract", () => {
    const result = rollCatFromSystem(earAccessoryProbeSystem, fixtureCatalogs, {
      seed: fixture.gacha.seed,
      exactLayerCounts: true,
      fixedTraits: EAR_ACCESSORY_PROBE_FIXED_TRAITS,
    });

    expect(result.document).toEqual(fixture.gacha.document);
    expect(result.slotSelections).toEqual(fixture.gacha.slotSelections);
    expect(result.document.traits[probeId]).toHaveLength(2);
    expect(
      getSystemSettingsControls(earAccessoryProbeSystem).some(
        (control) => control.traitId === probeId,
      ),
    ).toBe(false);
  });

  it("discovers the same probe in display, shared reveal, and OBS sequencing", () => {
    expect(
      getSystemDisplayRows(
        earAccessoryProbeSystem,
        fixture.renderDocument.traits,
      ).find((row) => row.traitId === probeId),
    ).toMatchObject({
      traitId: probeId,
      value: [EAR_ACCESSORY_PROBE_PRIMARY_VALUE],
    });
    expect(
      getSystemRevealPlan(
        earAccessoryProbeSystem,
        fixture.renderDocument.traits,
      ).find((stage) => stage.traitId === probeId),
    ).toMatchObject({
      traitId: probeId,
      strategy: "slots",
      slotIndex: 0,
      timingKey: probeId,
    });
    expect(
      buildRegistryRevealSequence(earAccessoryProbeSystem).find(
        (definition) => definition.traitId === probeId,
      ),
    ).toMatchObject({
      id: probeId,
      traitId: probeId,
      strategy: "slots",
      catalogId: probeId,
      layerKey: probeId,
    });
  });

  it("feeds the probe definition into the generic builder fallback", () => {
    const editor = getTraitEditorDefinitionsFromCatalog({
      traits: [fixture.probeDefinition as unknown as PublicCatTrait],
      catalogs: fixture.renderPlan.catalogs,
    })[0];
    expect(filterUnhandledTraitEditorDefinitions([editor], [])).toEqual([
      editor,
    ]);
    expect(editor).toMatchObject({
      traitId: probeId,
      kind: "list",
      valueKind: "stringList",
      maxItems: 2,
    });
    expect(editor.options.map((option) => option.id)).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
      EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    ]);
  });

  it("adds the probe to streamer voting without a trait-specific step", () => {
    const params = getDefaultStreamParams();
    params.poseName = EAR_ACCESSORY_PROBE_POSE;
    const source = {
      schemaVersion: earAccessoryProbeSystem.schemaVersion,
      traits: [
        ...publicCatCatalog.traits,
        fixture.probeDefinition as unknown as PublicCatTrait,
      ],
      catalogs: {
        ...publicCatCatalog.catalogs,
        ...fixture.renderPlan.catalogs,
      },
    };
    const steps = createStreamSteps({ params }, source);
    const step = getStepById(steps, `registry_trait_${probeId}`);

    expect(step).toMatchObject({
      id: `registry_trait_${probeId}`,
      title: "Probe ear accessories",
    });
    const options = step?.getOptions({ params }) ?? [];
    expect(options.map((option) => option.label)).toEqual([
      "None",
      "Wisteria ear",
      "Toast ear",
    ]);

    const selected = options.find((option) => option.label === "Wisteria ear");
    expect(selected).toBeDefined();
    if (!step || !selected) throw new Error("Missing streamer probe option");
    step.apply(selected, { params });
    expect((params.traits as Record<string, unknown>)[probeId]).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
    ]);
    expect(params.traits?.pose).toBe(EAR_ACCESSORY_PROBE_POSE);
    expect(params.traits?.colour).toBe("WHITE");
  });

  it("builds adoption concealment and slot reveals from the probe metadata", () => {
    const initial = buildAdoptionInitialTraits({
      system: earAccessoryProbeSystem,
      finalTraits: fixture.renderDocument.traits,
    });
    const stages = buildAdoptionRevealPlan({
      system: earAccessoryProbeSystem,
      traits: fixture.renderDocument.traits,
    });

    expect(initial[probeId]).toEqual([]);
    expect(stages.find((stage) => stage.traitId === probeId)).toMatchObject({
      id: `${probeId}-0`,
      traitId: probeId,
      type: "slot",
      timingKey: probeId,
      slotIndex: 0,
    });
  });

  it("evolves and inherits the probe through generic strategy dispatch", () => {
    const evolved = applyEvolutionTraitChanges({
      system: earAccessoryProbeSystem,
      parent: fixture.renderDocument,
      changes: [
        { traitId: probeId, value: EAR_ACCESSORY_PROBE_SECONDARY_VALUE },
      ],
    });
    expect((evolved.traits as Record<string, unknown>)[probeId]).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
      EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    ]);

    const mutations = selectAncestryTraitMutations(
      earAccessoryProbeSystem,
      {},
      { [probeId]: [EAR_ACCESSORY_PROBE_SECONDARY_VALUE] },
      { mutationRate: 1, random: () => 0 },
    );
    const inherited = applySystemInheritanceStrategies(
      earAccessoryProbeSystem,
      { [probeId]: [EAR_ACCESSORY_PROBE_PRIMARY_VALUE] },
      { [probeId]: [EAR_ACCESSORY_PROBE_PRIMARY_VALUE] },
      { mutations, random: () => 0 },
    );
    expect(inherited[probeId]).toEqual([EAR_ACCESSORY_PROBE_SECONDARY_VALUE]);
    expect(applyGeneticsTraitOverrides(inherited, {})[probeId]).toEqual([
      EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    ]);
  });

  it("generates the probe in a real evolution batch from registry metadata", () => {
    const result = generateEvolutionBatch(
      fixture.baseDocument,
      {
        branchCount: 1,
        targetLevel: 1,
        torties: { min: 0, max: 0 },
        accessories: { min: 0, max: 0 },
        scars: { min: 0, max: 0 },
        scarsEnabled: false,
      },
      emptyEvolutionPools,
      {
        system: earAccessoryProbeSystem,
        catalogs: fixtureCatalogs,
        archetypes: ["flare"],
        random: () => 0.99,
      },
    );
    const branch = result.cats.find((cat) => cat.level === 1);

    expect(branch?.additions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "trait", traitId: probeId }),
      ]),
    );
    expect(
      (branch?.catData.document.traits as Record<string, unknown>)[probeId],
    ).toEqual([
      EAR_ACCESSORY_PROBE_PRIMARY_VALUE,
      EAR_ACCESSORY_PROBE_SECONDARY_VALUE,
    ]);
  });
});
