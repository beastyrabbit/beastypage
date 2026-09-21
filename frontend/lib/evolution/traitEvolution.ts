import type {
  AnyCatTraitDefinition,
  CatSystemDefinition,
  JsonValue,
} from "@/lib/cat-system/definition";
import { catSystem } from "@/lib/cat-system/registry";

export type EvolutionTraitChange = {
  traitId: string;
  value: unknown;
  previous?: unknown;
};

export type EvolutionDocument = {
  schemaVersion: number;
  traits: object;
  unknownTraits?: Record<string, JsonValue>;
};

type EvolutionSystem = Pick<
  CatSystemDefinition,
  "schemaVersion" | "traits" | "aliases"
>;

export type ApplyEvolutionTraitChangesOptions<
  TDocument extends EvolutionDocument,
> = {
  parent: TDocument;
  changes: readonly EvolutionTraitChange[];
  system?: EvolutionSystem;
};

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Cat documents are JSON, so the fallback remains lossless here.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function findEquivalent(values: readonly unknown[], target: unknown): number {
  const expected = canonicalJson(target);
  return values.findIndex((value) => canonicalJson(value) === expected);
}

function uniqueValues(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const value of values) {
    const key = canonicalJson(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function parseTraitValue(
  trait: AnyCatTraitDefinition,
  value: unknown,
): unknown {
  const result = trait.value.schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid evolution value for ${trait.id}: ${result.error.issues[0]?.message ?? "schema validation failed"}`,
    );
  }
  return result.data;
}

function parseAccumulatedItem(
  trait: AnyCatTraitDefinition,
  value: unknown,
): unknown {
  const parsed = parseTraitValue(trait, [value]);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(`Evolution trait ${trait.id} did not parse as a list`);
  }
  return parsed[0];
}

function applyAccumulatedChanges(
  trait: AnyCatTraitDefinition,
  currentValue: unknown,
  changes: readonly EvolutionTraitChange[],
): unknown[] {
  if (trait.value.kind !== "stringList" && trait.value.kind !== "objectList") {
    throw new Error(
      `Evolution trait ${trait.id} uses accumulate with non-list value ${trait.value.kind}`,
    );
  }

  const parsedCurrent = parseTraitValue(trait, currentValue ?? []);
  if (!Array.isArray(parsedCurrent)) {
    throw new Error(`Evolution trait ${trait.id} did not parse as a list`);
  }
  let result = [...parsedCurrent];

  for (const change of changes) {
    const rawItems = Array.isArray(change.value)
      ? change.value
      : [change.value];
    const items = rawItems.map((item) => parseAccumulatedItem(trait, item));

    if (change.previous !== undefined) {
      const index = findEquivalent(result, change.previous);
      if (index >= 0) {
        result.splice(index, 1, ...items);
      } else {
        result.push(...items);
      }
    } else {
      result.push(...items);
    }

    if (trait.value.unique) result = uniqueValues(result);
    if (trait.value.maxItems !== undefined) {
      result = result.slice(0, trait.value.maxItems);
    }
  }

  return parseTraitValue(trait, result) as unknown[];
}

/**
 * Applies evolution changes through each trait's declared capability. The
 * implementation dispatches on value shape and strategy, never on trait IDs.
 */
export function applyEvolutionTraitChanges<
  TDocument extends EvolutionDocument,
>({
  parent,
  changes,
  system = catSystem,
}: ApplyEvolutionTraitChangesOptions<TDocument>): TDocument {
  const next = cloneJson(parent);
  const traits = { ...(next.traits as Record<string, unknown>) };
  const definitionById = new Map(
    system.traits.map((trait) => [trait.id, trait] as const),
  );
  const grouped = new Map<string, EvolutionTraitChange[]>();

  for (const change of changes) {
    const canonicalId = system.aliases[change.traitId] ?? change.traitId;
    const trait = definitionById.get(canonicalId);
    if (!trait) {
      throw new Error(`Unknown evolution trait ${change.traitId}`);
    }
    if (trait.capabilities.evolution === undefined) {
      throw new Error(`Trait ${canonicalId} has no evolution capability`);
    }
    const entries = grouped.get(canonicalId) ?? [];
    entries.push({ ...change, traitId: canonicalId });
    grouped.set(canonicalId, entries);
  }

  for (const [traitId, traitChanges] of grouped) {
    const trait = definitionById.get(traitId);
    if (!trait) continue;
    const strategy = trait.capabilities.evolution;
    if (strategy === "none" || strategy === "preserve") continue;

    if (strategy === "replace") {
      const last = traitChanges.at(-1);
      if (last) traits[traitId] = parseTraitValue(trait, last.value);
      continue;
    }

    if (strategy === "accumulate") {
      traits[traitId] = applyAccumulatedChanges(
        trait,
        traits[traitId],
        traitChanges,
      );
    }
  }

  return {
    ...next,
    traits,
    unknownTraits: next.unknownTraits
      ? cloneJson(next.unknownTraits)
      : undefined,
  } as TDocument;
}
