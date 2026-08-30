import type {
  AnyCatTraitDefinition,
  CatSystemDefinition,
} from "@/lib/cat-system/definition";
import { getSystemInheritanceTraits } from "@/lib/cat-system/runtime";

export const ANCESTRY_MUTATION_RATE = 0.05;

/**
 * Catalog candidates keyed by trait ID. Candidates may either be complete
 * trait values or individual catalog entries for list-valued traits.
 */
export type TraitMutationPools = Readonly<Record<string, readonly unknown[]>>;

/**
 * These values are produced by the ancestry genetics plugin. Everything else
 * is handled through the registry's generic inheritance strategy.
 */
export const GENETICS_TRAIT_IDS = new Set<string>([
  "pelt",
  "coatPattern",
  "colour",
  "tortie",
  "whitePatches",
  "eyeColour",
  "skinColour",
]);

interface MutationSelectionOptions {
  mutationRate?: number;
  random?: () => number;
}

function clonePortableValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseMutationCandidate(
  trait: AnyCatTraitDefinition,
  candidate: unknown,
): unknown | undefined {
  const direct = trait.value.schema.safeParse(candidate);
  if (direct.success) return clonePortableValue(direct.data);

  const listCandidate =
    trait.value.kind === "stringList" && typeof candidate === "string"
      ? [candidate]
      : trait.value.kind === "objectList" &&
          candidate !== null &&
          typeof candidate === "object" &&
          !Array.isArray(candidate)
        ? [candidate]
        : undefined;
  if (listCandidate === undefined) return undefined;

  const list = trait.value.schema.safeParse(listCandidate);
  return list.success ? clonePortableValue(list.data) : undefined;
}

/**
 * Selects mutation values without knowing any product trait ID. The only
 * excluded IDs belong to the explicit genetics plugin above.
 */
export function selectAncestryTraitMutations(
  system: CatSystemDefinition,
  generatedTraits: Readonly<Record<string, unknown>>,
  pools: TraitMutationPools,
  options: MutationSelectionOptions = {},
): Record<string, unknown> {
  const mutationRate = options.mutationRate ?? ANCESTRY_MUTATION_RATE;
  if (!Number.isFinite(mutationRate) || mutationRate < 0 || mutationRate > 1) {
    throw new Error("Ancestry mutation rate must be between 0 and 1");
  }

  const random = options.random ?? Math.random;
  const mutations: Record<string, unknown> = {};

  for (const trait of getSystemInheritanceTraits(system)) {
    if (trait.capabilities.inherit !== "mutate") continue;

    if (GENETICS_TRAIT_IDS.has(trait.id)) {
      if (
        Object.hasOwn(generatedTraits, trait.id) &&
        generatedTraits[trait.id] !== undefined
      ) {
        mutations[trait.id] = clonePortableValue(generatedTraits[trait.id]);
      }
      continue;
    }

    const candidates = pools[trait.id] ?? [];
    if (candidates.length === 0 || random() >= mutationRate) continue;

    const startIndex = Math.min(
      candidates.length - 1,
      Math.max(0, Math.floor(random() * candidates.length)),
    );
    for (let offset = 0; offset < candidates.length; offset++) {
      const candidate = parseMutationCandidate(
        trait,
        candidates[(startIndex + offset) % candidates.length],
      );
      if (candidate === undefined) continue;
      mutations[trait.id] = candidate;
      break;
    }
  }

  return mutations;
}

/** Keeps the established pelt/colour/tortie genetics authoritative. */
export function applyGeneticsTraitOverrides(
  inheritedTraits: Readonly<Record<string, unknown>>,
  generatedTraits: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = clonePortableValue({
    ...inheritedTraits,
  });
  for (const traitId of GENETICS_TRAIT_IDS) {
    if (Object.hasOwn(generatedTraits, traitId)) {
      result[traitId] = clonePortableValue(generatedTraits[traitId]);
    } else {
      delete result[traitId];
    }
  }
  return result;
}
