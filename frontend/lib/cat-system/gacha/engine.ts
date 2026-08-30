import { resolveCoatChoice } from "@/lib/cat-v3/coatPatterns";
import type {
  AnyCatTraitDefinition,
  CatSystemDefinition,
  CountDistribution,
} from "../definition";
import { parseCatDocumentStrict } from "../document";
import { type CatTraitId, catSystem } from "../registry";
import { createSystemCatDocumentSchema, topologicallySort } from "../runtime";
import {
  createRandomSource,
  createUnseededGachaSeed,
  GACHA_RNG_VERSION,
} from "./rng";
import {
  materializeSlots,
  pickFromPools,
  resolveCount,
  roll,
  uniformInteger,
  weightedChoiceIndex,
} from "./strategies";
import type {
  GachaCatalog,
  GachaCatalogs,
  GachaCountMode,
  GachaGenerationOptions,
  GachaRollResult,
  GachaSlotSelections,
  GachaSlotTraitId,
  RandomSource,
  SystemGachaRollResult,
} from "./types";

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function catalogFor(
  catalogs: GachaCatalogs,
  catalogId: string,
  pose: unknown,
): GachaCatalog | undefined {
  const catalog = catalogs[catalogId];
  if (!catalog) return undefined;
  const canonicalValues =
    typeof pose === "string" && catalog.canonicalByPose?.[pose] !== undefined
      ? catalog.canonicalByPose[pose]
      : catalog.canonicalValues;
  if (
    catalog.byPose &&
    typeof pose === "string" &&
    catalog.byPose[pose] !== undefined
  ) {
    return {
      ...catalog,
      pools: [catalog.byPose[pose]],
      canonicalValues,
    };
  }
  return canonicalValues === catalog.canonicalValues
    ? catalog
    : { ...catalog, canonicalValues };
}

function catalogWeight(
  catalog: GachaCatalog | undefined,
  choice: string,
): number {
  return catalog?.weights?.[choice] ?? 1;
}

function catalogValues(catalog: GachaCatalog | undefined): string[] {
  if (!catalog) return [];
  return Array.from(new Set(catalog.pools.flatMap((pool) => [...pool])));
}

function pickFromCatalog(
  random: RandomSource,
  catalog: GachaCatalog,
  flattenSelection: boolean,
): string {
  if (flattenSelection) {
    const values = catalogValues(catalog);
    return values[
      weightedChoiceIndex(
        random,
        values.map((choice) => catalogWeight(catalog, choice)),
      )
    ];
  }
  return pickFromPools(random, catalog.pools, (choice) =>
    catalogWeight(catalog, choice),
  );
}

function supplementalConditionMatches(
  whenTrait: string,
  condition: "nonEmptyList",
  traits: Readonly<Record<string, unknown>>,
): boolean {
  if (condition === "nonEmptyList") {
    const value = traits[whenTrait];
    return Array.isArray(value) && value.length > 0;
  }
  return false;
}

function catalogChoiceCatalog(
  catalogs: GachaCatalogs,
  binding: Extract<
    AnyCatTraitDefinition["gacha"],
    { strategy: "catalogChoice" }
  >,
  traits: Readonly<Record<string, unknown>>,
): GachaCatalog | undefined {
  const conditional = (binding.conditionalCatalogs ?? [])
    .filter((candidate) =>
      supplementalConditionMatches(
        candidate.whenTrait,
        candidate.condition,
        traits,
      ),
    )
    .map((candidate) => catalogFor(catalogs, candidate.catalog, traits.pose))
    .find((catalog): catalog is GachaCatalog => catalog !== undefined);
  return conditional ?? catalogFor(catalogs, binding.catalog, traits.pose);
}

function canonicalCatalogValues(catalog: GachaCatalog | undefined): string[] {
  if (!catalog?.canonicalValues) return catalogValues(catalog);
  return Array.from(new Set(catalog.canonicalValues));
}

function modeForTrait(
  traitId: GachaSlotTraitId,
  options: GachaGenerationOptions,
): GachaCountMode | undefined {
  if (typeof options.countsMode === "string") return options.countsMode;
  return options.countsMode?.[traitId];
}

function hasExplicitCountMode(
  traitId: GachaSlotTraitId,
  options: GachaGenerationOptions,
): boolean {
  return (
    typeof options.countsMode === "string" ||
    options.countsMode?.[traitId] !== undefined
  );
}

function resolveSlotCount(
  random: RandomSource,
  traitId: GachaSlotTraitId,
  distribution: CountDistribution,
  options: GachaGenerationOptions,
): number {
  const override = options.slotOverrides?.[traitId];
  if (override !== undefined && Number.isFinite(override)) {
    return Math.max(0, Math.trunc(override));
  }
  if (hasExplicitCountMode(traitId, options)) {
    return Math.max(
      0,
      resolveCount(random, distribution, modeForTrait(traitId, options)),
    );
  }
  const range = options.slotRanges?.[traitId];
  if (range) {
    return Math.max(0, uniformInteger(random, range.min, range.max));
  }
  const legacyDefault = options.defaultSlotCounts?.[traitId];
  if (legacyDefault !== undefined && Number.isFinite(legacyDefault)) {
    return Math.max(0, Math.trunc(legacyDefault));
  }
  return Math.max(0, resolveCount(random, distribution));
}

function hasNumericSlotOverride(
  traitId: GachaSlotTraitId,
  options: GachaGenerationOptions,
): boolean {
  const value = options.slotOverrides?.[traitId];
  return value !== undefined && Number.isFinite(value);
}

function probabilityForTrait(
  traitId: string,
  fallback: number,
  options: GachaGenerationOptions,
): number {
  const candidate =
    options.traitProbabilities?.[traitId as CatTraitId] ?? fallback;
  return Number.isFinite(candidate)
    ? Math.min(1, Math.max(0, candidate))
    : fallback;
}

function hasGateOverride(
  traitId: string,
  declaredProbability: number | undefined,
  options: GachaGenerationOptions,
): boolean {
  if (declaredProbability === undefined) return false;
  return (
    options.traitProbabilities !== undefined &&
    Object.hasOwn(options.traitProbabilities, traitId)
  );
}

function assignCatalogChoice(
  traitId: string,
  choice: string,
  traits: Record<string, unknown>,
): void {
  traits[traitId] = choice;
}

type DerivedGachaBinding = Extract<
  AnyCatTraitDefinition["gacha"],
  { strategy: "derived" }
>;

interface DerivedResolverContext {
  binding: DerivedGachaBinding;
  targetTrait: AnyCatTraitDefinition;
  targetIsFixed: boolean;
  traits: Record<string, unknown>;
}

type DerivedResolver = (context: DerivedResolverContext) => void;

const DERIVED_RESOLVERS = {
  coatChoiceProjection: ({ binding, targetTrait, targetIsFixed, traits }) => {
    const sourceValue = traits[binding.sourceTrait];
    if (typeof sourceValue !== "string") {
      if (!targetIsFixed) resetTraitToDefault(targetTrait, traits);
      return;
    }
    const resolved = resolveCoatChoice(sourceValue);
    traits[binding.sourceTrait] = resolved.peltName;
    if (targetIsFixed) return;
    if (resolved.coatPattern !== undefined) {
      traits[targetTrait.id] = resolved.coatPattern;
    } else {
      resetTraitToDefault(targetTrait, traits);
    }
  },
} satisfies Record<DerivedGachaBinding["resolver"], DerivedResolver>;

function resolveDerivedTrait(
  targetTrait: AnyCatTraitDefinition,
  binding: DerivedGachaBinding,
  targetIsFixed: boolean,
  traits: Record<string, unknown>,
): void {
  DERIVED_RESOLVERS[binding.resolver]({
    binding,
    targetTrait,
    targetIsFixed,
    traits,
  });
}

function fixedValueBelongsToCatalog(
  trait: AnyCatTraitDefinition,
  value: unknown,
  catalogs: GachaCatalogs,
  pose: unknown,
): boolean {
  const catalogIds = Array.from(
    new Set(
      [
        trait.value.catalog,
        trait.gacha.strategy === "catalogChoice"
          ? trait.gacha.catalog
          : undefined,
      ].filter((catalogId): catalogId is string => catalogId !== undefined),
    ),
  );
  if (catalogIds.length === 0) return true;
  const allowed = new Set(
    catalogIds.flatMap((catalogId) =>
      canonicalCatalogValues(catalogFor(catalogs, catalogId, pose)),
    ),
  );
  if (trait.value.kind === "string") {
    return typeof value === "string" && allowed.has(value);
  }
  if (trait.value.kind === "stringList") {
    return (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "string" && allowed.has(entry))
    );
  }
  return true;
}

function applyFixedTrait(
  trait: AnyCatTraitDefinition,
  rawValue: unknown,
  catalogs: GachaCatalogs,
  traits: Record<string, unknown>,
): boolean {
  const parsed = trait.value.schema.safeParse(rawValue);
  if (!parsed.success) return false;

  if (!fixedValueBelongsToCatalog(trait, parsed.data, catalogs, traits.pose)) {
    return false;
  }
  if (trait.gacha.strategy === "catalogChoice") {
    if (typeof parsed.data !== "string") return false;
    assignCatalogChoice(trait.id, parsed.data, traits);
    return true;
  }

  traits[trait.id] = cloneValue(parsed.data);
  return true;
}

function initializeDefaults(
  traits: Record<string, unknown>,
  definitions: readonly AnyCatTraitDefinition[],
): void {
  for (const trait of definitions) {
    if (trait.value.default !== undefined) {
      traits[trait.id] = cloneValue(trait.value.default);
    }
  }
}

function resetTraitToDefault(
  trait: AnyCatTraitDefinition,
  traits: Record<string, unknown>,
): void {
  if (trait.value.default === undefined) {
    delete traits[trait.id];
  } else {
    traits[trait.id] = cloneValue(trait.value.default);
  }
}

function orderedTraitDefinitions(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  const definitions = system.traits as readonly AnyCatTraitDefinition[];
  return topologicallySort(
    definitions,
    (trait) => trait.id,
    (trait) =>
      trait.gacha.strategy === "none" ? [] : (trait.gacha.dependsOn ?? []),
    (trait) => trait.order,
  );
}

export function rollCatFromRegistry(
  catalogs: GachaCatalogs,
  options: GachaGenerationOptions = {},
): GachaRollResult {
  const result = rollCatFromSystem(catSystem, catalogs, options);
  return {
    ...result,
    document: parseCatDocumentStrict(result.document),
  } as GachaRollResult;
}

/** Testable generic entry point. Product callers normally use rollCatFromRegistry. */
export function rollCatFromSystem(
  system: CatSystemDefinition,
  catalogs: GachaCatalogs,
  options: GachaGenerationOptions = {},
): SystemGachaRollResult {
  const seed = options.seed ?? createUnseededGachaSeed();
  const random = createRandomSource(seed);
  const definitions = orderedTraitDefinitions(system);
  const definitionById = new Map(
    definitions.map((trait) => [trait.id, trait] as const),
  );
  const traits: Record<string, unknown> = {};
  const slotSelections: GachaSlotSelections = {};
  const gateResults = new Map<string, boolean>();
  initializeDefaults(traits, definitions);

  const fixedTraits = options.fixedTraits ?? {};
  const fixedIds = new Set<string>();
  for (const [traitId, rawValue] of Object.entries(fixedTraits)) {
    const definition = definitionById.get(traitId);
    if (definition && applyFixedTrait(definition, rawValue, catalogs, traits)) {
      fixedIds.add(traitId);
    }
  }

  for (const trait of definitions) {
    const binding = trait.gacha;
    if (binding.strategy === "none") continue;
    if (binding.strategy === "derived") {
      resolveDerivedTrait(trait, binding, fixedIds.has(trait.id), traits);
      continue;
    }
    if (fixedIds.has(trait.id)) continue;

    const declaredProbability =
      binding.strategy === "boolean"
        ? binding.probability
        : binding.strategy === "catalogChoice"
          ? binding.optionalProbability
          : undefined;
    if (
      binding.gate &&
      !hasGateOverride(trait.id, declaredProbability, options)
    ) {
      let active = gateResults.get(binding.gate.group);
      if (active === undefined) {
        active = roll(random, binding.gate.probability);
        gateResults.set(binding.gate.group, active);
      }
      if (!active) {
        resetTraitToDefault(trait, traits);
        if (
          binding.strategy === "slotList" ||
          binding.strategy === "tortieList"
        ) {
          slotSelections[trait.id as GachaSlotTraitId] = [];
        }
        continue;
      }
    }

    if (binding.strategy === "boolean") {
      const probability = probabilityForTrait(
        trait.id,
        binding.probability,
        options,
      );
      traits[trait.id] = roll(random, probability);
      continue;
    }

    if (binding.strategy === "catalogChoice") {
      if (
        binding.optionalProbability !== undefined &&
        !roll(
          random,
          probabilityForTrait(trait.id, binding.optionalProbability, options),
        )
      ) {
        delete traits[trait.id];
        continue;
      }
      const catalog = catalogChoiceCatalog(catalogs, binding, traits);
      if (!catalog || catalogValues(catalog).length === 0) {
        if (trait.value.required) {
          throw new Error(`Gacha catalog ${binding.catalog} is empty`);
        }
        delete traits[trait.id];
        continue;
      }
      if (binding.includeUnsetChoice) {
        const values = catalogValues(catalog);
        const selectedIndex = weightedChoiceIndex(random, [
          1,
          ...values.map((choice) => catalogWeight(catalog, choice)),
        ]);
        if (selectedIndex === 0) {
          resetTraitToDefault(trait, traits);
        } else {
          assignCatalogChoice(trait.id, values[selectedIndex - 1], traits);
        }
      } else {
        assignCatalogChoice(
          trait.id,
          pickFromCatalog(random, catalog, binding.flattenSelection === true),
          traits,
        );
      }
      continue;
    }

    const slotTraitId = trait.id as GachaSlotTraitId;

    if (binding.strategy === "slotList") {
      const slotCount = resolveSlotCount(
        random,
        slotTraitId,
        binding.count,
        options,
      );
      const catalog = catalogFor(catalogs, binding.catalog, traits.pose);
      const choices = catalogValues(catalog);
      const result = materializeSlots({
        random,
        slotCount,
        availableChoices: choices,
        unique: binding.unique,
        exactCount: options.exactLayerCounts === true,
        placeholder: "none",
        shouldFillSlot: () => roll(random, binding.fillProbability ?? 1),
        choiceWeight: (choice) => catalogWeight(catalog, choice),
        mapChoice: (choice) => choice,
        mapValueToSlot: (choice) => choice,
      });
      traits[trait.id] = result.selectedValues;
      slotSelections[slotTraitId] = result.slotSelections;
      continue;
    }

    const numericOverride = hasNumericSlotOverride(slotTraitId, options);
    const explicitCountMode = hasExplicitCountMode(slotTraitId, options);
    const usesSlotRange =
      !numericOverride &&
      !explicitCountMode &&
      options.slotRanges?.[slotTraitId] !== undefined;
    if (
      !numericOverride &&
      usesSlotRange &&
      !roll(random, binding.activationProbability)
    ) {
      traits[trait.id] = [];
      slotSelections[slotTraitId] = [];
      continue;
    }
    const slotCount = resolveSlotCount(
      random,
      slotTraitId,
      binding.count,
      options,
    );
    const active =
      slotCount > 0 &&
      (numericOverride ||
        explicitCountMode ||
        usesSlotRange ||
        options.exactLayerCounts === true ||
        roll(random, binding.activationProbability));
    if (!active) {
      traits[trait.id] = [];
      slotSelections[slotTraitId] = [];
      continue;
    }

    const masks = catalogValues(
      catalogFor(catalogs, binding.maskCatalog, traits.pose),
    );
    const peltCatalog = catalogFor(catalogs, binding.peltCatalog, traits.pose);
    const colourCatalog = catalogFor(
      catalogs,
      binding.colourCatalog,
      traits.pose,
    );
    const result = materializeSlots({
      random,
      slotCount,
      availableChoices: masks,
      unique: binding.uniqueMasks,
      exactCount: options.exactLayerCounts === true,
      placeholder: null,
      shouldFillSlot: (slotIndex) =>
        slotIndex === 0 || roll(random, binding.fillProbability),
      choiceWeight: (choice) =>
        catalogWeight(
          catalogFor(catalogs, binding.maskCatalog, traits.pose),
          choice,
        ),
      mapChoice: (mask) => ({
        mask,
        pattern: pickFromPools(random, peltCatalog?.pools ?? [], (choice) =>
          catalogWeight(peltCatalog, choice),
        ),
        colour: pickFromPools(random, colourCatalog?.pools ?? [], (choice) =>
          catalogWeight(colourCatalog, choice),
        ),
      }),
      mapValueToSlot: (layer) => layer,
    });
    traits[trait.id] = result.selectedValues;
    slotSelections[slotTraitId] = result.slotSelections;
  }

  const document = createSystemCatDocumentSchema(system).parse({
    schemaVersion: system.schemaVersion,
    traits,
  });

  return {
    document,
    slotSelections,
    seed,
    rngVersion: GACHA_RNG_VERSION,
  };
}
