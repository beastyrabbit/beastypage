import { z } from "zod";
import type {
  AnyCatTraitDefinition,
  CatDocumentFor,
  CatSystemDefinition,
  JsonValue,
  RenderBinding,
  RenderOperationBinding,
  TraitConsumerCapabilities,
} from "./definition";
import { type CatSystem, type CatTraitId, catSystem } from "./registry";

export type CatDocument = CatDocumentFor<CatSystem>;
export type CatTraits = CatDocument["traits"];

export function createSystemCatDocumentSchema(system: CatSystemDefinition) {
  const shape: Record<string, z.ZodType> = {};
  for (const trait of system.traits) {
    shape[trait.id] = trait.value.required
      ? trait.value.schema
      : trait.value.schema.optional();
  }
  return z
    .object({
      schemaVersion: z.literal(system.schemaVersion),
      traits: z.object(shape).strict(),
      unknownTraits: z.record(z.string(), z.json()).optional(),
    })
    .strict();
}

export const catDocumentSchema = createSystemCatDocumentSchema(catSystem);
export const catTraitsSchema = catDocumentSchema.shape.traits;

const traitById = new Map<string, AnyCatTraitDefinition>(
  catSystem.traits.map((trait) => [trait.id, trait]),
);

export function isCatTraitId(value: string): value is CatTraitId {
  return traitById.has(value);
}

export function getCatTraitDefinition(
  traitId: string,
): AnyCatTraitDefinition | undefined {
  const canonicalId = catSystem.aliases[traitId] ?? traitId;
  return traitById.get(canonicalId);
}

export function getCatTraitsWithCapability<
  TCapability extends keyof TraitConsumerCapabilities,
>(capability: TCapability): AnyCatTraitDefinition[] {
  return getSystemTraitsWithCapability(catSystem, capability);
}

export function getSystemTraitsWithCapability<
  TCapability extends keyof TraitConsumerCapabilities,
>(
  system: CatSystemDefinition,
  capability: TCapability,
): AnyCatTraitDefinition[] {
  return system.traits
    .filter((trait) => Boolean(trait.capabilities[capability]))
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}

export function getSlotTraitDefinitions(): AnyCatTraitDefinition[] {
  return getSystemSlotTraitDefinitions(catSystem);
}

export function getSystemSlotTraitDefinitions(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  return system.traits
    .filter(
      (trait) =>
        trait.gacha?.strategy === "slotList" ||
        trait.gacha?.strategy === "tortieList",
    )
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}

export const getSlotTraits = getSlotTraitDefinitions;

export function getDisplayTraits(): AnyCatTraitDefinition[] {
  return getCatTraitsWithCapability("display");
}

export function getSystemDisplayTraits(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  return getSystemTraitsWithCapability(system, "display");
}

export function getRevealTraits(): AnyCatTraitDefinition[] {
  return getCatTraitsWithCapability("reveal");
}

export function getSystemRevealTraits(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  return getSystemTraitsWithCapability(system, "reveal");
}

export function getSettingsTraits(): AnyCatTraitDefinition[] {
  return getCatTraitsWithCapability("settings").filter((trait) => trait.gacha);
}

export function getSystemSettingsTraits(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  return getSystemTraitsWithCapability(system, "settings").filter(
    (trait) => trait.gacha,
  );
}

export function getEvolutionTraits(): AnyCatTraitDefinition[] {
  return getCatTraitsWithCapability("evolution").filter(
    (trait) => trait.capabilities.evolution !== "none",
  );
}

export function getSystemEvolutionTraits(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  return getSystemTraitsWithCapability(system, "evolution").filter(
    (trait) => trait.capabilities.evolution !== "none",
  );
}

export function getInheritanceTraits(): AnyCatTraitDefinition[] {
  return getCatTraitsWithCapability("inherit").filter(
    (trait) => trait.capabilities.inherit !== "none",
  );
}

export function getSystemInheritanceTraits(
  system: CatSystemDefinition,
): AnyCatTraitDefinition[] {
  return getSystemTraitsWithCapability(system, "inherit").filter(
    (trait) => trait.capabilities.inherit !== "none",
  );
}

function clonePortableValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableValueKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableValueKey(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function accumulateValues(
  current: unknown,
  incoming: unknown,
  maxItems?: number,
): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const value of [
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]) {
    const key = stableValueKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clonePortableValue(value));
    if (maxItems !== undefined && result.length >= maxItems) break;
  }
  return result;
}

/** Applies every declared evolution policy without branching on trait IDs. */
export function applySystemEvolutionStrategies(
  system: CatSystemDefinition,
  current: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const trait of system.traits) {
    const currentValue = current[trait.id];
    const incomingValue = incoming[trait.id];
    switch (trait.capabilities.evolution) {
      case "replace":
        if (incomingValue !== undefined) {
          result[trait.id] = clonePortableValue(incomingValue);
        } else if (currentValue !== undefined) {
          result[trait.id] = clonePortableValue(currentValue);
        }
        break;
      case "accumulate":
        result[trait.id] = accumulateValues(
          currentValue,
          incomingValue,
          trait.value.maxItems,
        );
        break;
      case "preserve":
      case "none":
      default:
        if (currentValue !== undefined) {
          result[trait.id] = clonePortableValue(currentValue);
        } else if (incomingValue !== undefined) {
          result[trait.id] = clonePortableValue(incomingValue);
        }
        break;
    }
    if (result[trait.id] === undefined && trait.value.default !== undefined) {
      result[trait.id] = clonePortableValue(trait.value.default);
    }
  }
  return result;
}

export function evolveCatDocument(
  current: CatDocument,
  incoming: CatDocument,
): CatDocument {
  return catDocumentSchema.parse({
    schemaVersion: catSystem.schemaVersion,
    traits: applySystemEvolutionStrategies(
      catSystem,
      current.traits,
      incoming.traits,
    ),
    unknownTraits: {
      ...(current.unknownTraits ?? {}),
      ...(incoming.unknownTraits ?? {}),
    },
  }) as CatDocument;
}

export interface InheritanceOptions {
  /** Values generated for this child independently of either parent. */
  generated?: Readonly<Record<string, unknown>>;
  /** Trait values already computed by a genetics or mutation plugin. */
  mutations?: Readonly<Record<string, unknown>>;
  random?: () => number;
}

/** Applies copy/mutate/none policies; genetics remains an optional plugin input. */
export function applySystemInheritanceStrategies(
  system: CatSystemDefinition,
  mother: Readonly<Record<string, unknown>>,
  father: Readonly<Record<string, unknown>>,
  options: InheritanceOptions = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const random = options.random ?? Math.random;
  for (const trait of system.traits) {
    const strategy = trait.capabilities.inherit;
    if (strategy === "none" || strategy === undefined) {
      const generated = options.generated?.[trait.id];
      if (generated !== undefined) {
        result[trait.id] = clonePortableValue(generated);
      } else if (trait.value.default !== undefined) {
        result[trait.id] = clonePortableValue(trait.value.default);
      }
      continue;
    }
    const mutation = options.mutations?.[trait.id];
    if (strategy === "mutate" && mutation !== undefined) {
      result[trait.id] = clonePortableValue(mutation);
      continue;
    }
    const motherValue = mother[trait.id];
    const fatherValue = father[trait.id];
    const inherited =
      motherValue === undefined
        ? fatherValue
        : fatherValue === undefined || random() < 0.5
          ? motherValue
          : fatherValue;
    if (inherited !== undefined) {
      result[trait.id] = clonePortableValue(inherited);
    } else if (options.generated?.[trait.id] !== undefined) {
      result[trait.id] = clonePortableValue(options.generated[trait.id]);
    } else if (trait.value.default !== undefined) {
      result[trait.id] = clonePortableValue(trait.value.default);
    }
  }
  return result;
}

export function inheritCatDocument(
  mother: CatDocument,
  father: CatDocument,
  options: InheritanceOptions = {},
): CatDocument {
  return catDocumentSchema.parse({
    schemaVersion: catSystem.schemaVersion,
    traits: applySystemInheritanceStrategies(
      catSystem,
      mother.traits,
      father.traits,
      options,
    ),
    unknownTraits: {
      ...(mother.unknownTraits ?? {}),
      ...(father.unknownTraits ?? {}),
    },
  }) as CatDocument;
}

export interface RevealStage {
  traitId: string;
  label: string;
  strategy: "single" | "slots" | "compoundSlots";
  order: number;
  timingKey: string;
  defaultSteps: number;
  slotIndex?: number;
}

function valueSlotCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 1;
}

/** Shared reveal-plan builder for Single Cat, OBS and Adoption. */
export function getRevealPlan(
  traits: Readonly<Record<string, unknown>>,
): RevealStage[] {
  return getSystemRevealPlan(catSystem, traits);
}

export function getSystemRevealPlan(
  system: CatSystemDefinition,
  traits: Readonly<Record<string, unknown>>,
): RevealStage[] {
  const stages: RevealStage[] = [];
  for (const trait of getSystemRevealTraits(system)) {
    const reveal = trait.capabilities.reveal;
    if (!reveal) continue;
    const value = traits[trait.id];
    if (value === undefined || value === null) continue;
    const slotCount =
      reveal.strategy === "single" ? 1 : Math.max(0, valueSlotCount(value));
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      stages.push({
        traitId: trait.id,
        label: trait.label,
        strategy: reveal.strategy,
        order: trait.order,
        timingKey: reveal.timingKey ?? trait.id,
        defaultSteps: reveal.defaultSteps ?? 1,
        ...(reveal.strategy === "single" ? {} : { slotIndex }),
      });
    }
  }
  return stages;
}

export interface DisplayRow {
  traitId: string;
  label: string;
  value: unknown;
  order: number;
}

export function getDisplayRows(
  traits: Readonly<Record<string, unknown>>,
): DisplayRow[] {
  return getSystemDisplayRows(catSystem, traits);
}

export function getSystemDisplayRows(
  system: CatSystemDefinition,
  traits: Readonly<Record<string, unknown>>,
): DisplayRow[] {
  return getSystemDisplayTraits(system).flatMap((trait) => {
    const value = traits[trait.id];
    if (value === undefined || value === null) return [];
    if (Array.isArray(value) && value.length === 0) return [];
    return [
      { traitId: trait.id, label: trait.label, value, order: trait.order },
    ];
  });
}

export interface SettingsControl {
  traitId: string;
  label: string;
  kind: "range";
  min?: number;
  max?: number;
  defaultValue?: number | boolean;
}

export function getSettingsControls(): SettingsControl[] {
  return getSystemSettingsControls(catSystem);
}

export function getSystemSettingsControls(
  system: CatSystemDefinition,
): SettingsControl[] {
  const controls: SettingsControl[] = [];
  for (const trait of getSystemSettingsTraits(system)) {
    const gacha = trait.gacha;
    if (!gacha) continue;
    if (gacha.strategy === "slotList" || gacha.strategy === "tortieList") {
      controls.push({
        traitId: trait.id,
        label: trait.label,
        kind: "range",
        min: gacha.count.min,
        max: gacha.count.max,
        defaultValue: gacha.count.max,
      });
    }
  }
  return controls;
}

function renderBindings(
  trait: AnyCatTraitDefinition,
): readonly RenderBinding[] {
  return "kind" in trait.render ? [trait.render] : trait.render;
}

export function getRenderOperations(): RenderOperationBinding[] {
  return getSystemRenderOperations(catSystem);
}

export function getSystemRenderOperations(
  system: CatSystemDefinition,
): RenderOperationBinding[] {
  return system.traits
    .flatMap((trait) => renderBindings(trait))
    .filter(
      (binding): binding is RenderOperationBinding =>
        binding.kind === "operation",
    );
}

export function topologicallySort<T>(
  values: readonly T[],
  getId: (value: T) => string,
  getDependencies: (value: T) => readonly string[],
  getOrder: (value: T) => number,
): T[] {
  const byId = new Map(values.map((value) => [getId(value), value]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const value of values) {
    const id = getId(value);
    const dependencies = getDependencies(value);
    indegree.set(id, dependencies.length);
    for (const dependency of dependencies) {
      if (!byId.has(dependency)) {
        throw new Error(`${id} depends on unknown ${dependency}`);
      }
      const entries = dependents.get(dependency) ?? [];
      entries.push(id);
      dependents.set(dependency, entries);
    }
  }

  const compareIds = (left: string, right: string): number => {
    const leftValue = byId.get(left);
    const rightValue = byId.get(right);
    if (!leftValue || !rightValue) return left.localeCompare(right);
    return (
      getOrder(leftValue) - getOrder(rightValue) || left.localeCompare(right)
    );
  };
  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort(compareIds);
  const result: T[] = [];

  while (ready.length > 0) {
    const id = ready.shift();
    if (!id) break;
    const value = byId.get(id);
    if (!value) continue;
    result.push(value);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort(compareIds);
      }
    }
  }

  if (result.length !== values.length) {
    throw new Error("Dependency graph contains a cycle");
  }
  return result;
}

export function getOrderedRenderOperations(): RenderOperationBinding[] {
  return getSystemOrderedRenderOperations(catSystem);
}

export function getSystemOrderedRenderOperations(
  system: CatSystemDefinition,
): RenderOperationBinding[] {
  const rawOperations = getSystemRenderOperations(system);
  const operations = rawOperations.map((operation) => {
    if (
      operation.strategy !== "globalMirror" ||
      !operation.config.affectsPreviousLayers
    ) {
      return operation;
    }
    return {
      ...operation,
      after: rawOperations
        .filter((candidate) => candidate.operationId !== operation.operationId)
        .map((candidate) => candidate.operationId),
    } as RenderOperationBinding;
  });
  const operationOrder = new Map<string, number>();
  for (const trait of system.traits) {
    for (const binding of renderBindings(trait)) {
      if (binding.kind === "operation") {
        operationOrder.set(binding.operationId, trait.order);
      }
    }
  }
  return topologicallySort(
    operations,
    (operation) => operation.operationId,
    (operation) => operation.after ?? [],
    (operation) => operationOrder.get(operation.operationId) ?? 0,
  );
}

export function partitionTraitValues(
  values: Readonly<Record<string, unknown>>,
): {
  known: Record<string, unknown>;
  unknown: Record<string, JsonValue>;
} {
  const known: Record<string, unknown> = {};
  const unknown: Record<string, JsonValue> = {};
  for (const [rawId, value] of Object.entries(values)) {
    const id = catSystem.aliases[rawId] ?? rawId;
    if (isCatTraitId(id)) {
      known[id] = value;
    } else if (!catSystem.tombstones[id] && isJsonValue(value)) {
      unknown[rawId] = value;
    }
  }
  return { known, unknown };
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}
