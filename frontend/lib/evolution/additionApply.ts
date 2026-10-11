/**
 * Pure helpers around one evolution addition: apply it truly (the landed
 * frame), find the base a roll starts from, and build the WRONG candidates
 * a roll strobes through. Candidates never contain the true value, so no
 * strobe frame can spoil the land.
 */

import { formatAddition } from "@/components/evolution/evolutionDisplay";
import {
  catDocumentToLegacyParams,
  readCatDocument,
} from "@/lib/cat-system/document";
import type { CatDocument } from "@/lib/cat-system/runtime";
import { legacySpriteNumberForPoseName } from "@/lib/cat-v3/poseOptions";
import type { CatParams, TortieLayer } from "@/lib/cat-v3/types";
import {
  applyEvolutionAdditions,
  type EvolutionAddition,
  type EvolutionArchetype,
  type EvolutionCatData,
  type EvolutionPools,
  LONG_HAIR_POSE,
  normalizeEvolutionStarter,
  WILD_ARCHETYPES,
} from "./evolutionGenerator";
import { applyEvolutionTraitChanges } from "./traitEvolution";

/** Params-only input (what the command carries) → EvolutionCatData with `additions` applied truly. */
export function applyAdditions(
  parentInput: unknown,
  additions: readonly EvolutionAddition[],
): EvolutionCatData {
  return applyEvolutionAdditions(
    normalizeEvolutionStarter(parentInput),
    additions,
  );
}

/** Render params of applyAdditions (the landed frame of a roll, or the base of the next). */
export function applyAdditionsParams(
  parentInput: unknown,
  additions: readonly EvolutionAddition[],
): CatParams {
  return applyAdditions(parentInput, additions).params;
}

/**
 * The parent chain for command cat `index`: level ≤ 1 → cats[0] (starter),
 * else cats[index − 1]. Returns that cat's catData.
 */
export function rollParentFor<T extends { level: number; catData: unknown }>(
  cats: readonly T[],
  index: number,
): unknown {
  const cat = cats[index];
  if (!cat) return null;
  const parent = cat.level <= 1 ? cats[0] : cats[index - 1];
  return parent?.catData ?? null;
}

/** Base for roll (index, j): parent chain with additions[0..j−1] applied truly. */
export function rollBaseParams(
  cats: readonly {
    level: number;
    catData: unknown;
    additions: EvolutionAddition[];
  }[],
  index: number,
  j: number,
): CatParams | null {
  const parent = rollParentFor(cats, index);
  const cat = cats[index];
  if (parent === null || !cat) return null;
  return applyAdditionsParams(parent, cat.additions.slice(0, j));
}

/** Short-hair poses a "coat" roll strobes through (minus the parent's own pose). */
export const COAT_ROLL_POSES: readonly string[] = [
  "adult_short0",
  "adult_short1",
  "adult_short2",
  "adolescent_short0",
  "adolescent_short1",
  "adolescent_short2",
];

const WILD_ARCHETYPE_SET = new Set<string>(WILD_ARCHETYPES);
/** Same as the generator: wild clans open up to the full pool half the time. */
const WILD_OPEN_CHANCE = 0.5;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function uniqueClean(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanString(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function pickOne<T>(items: readonly T[], random: () => number): T | null {
  if (!items.length) return null;
  const index = Math.floor(random() * items.length);
  return items[Math.min(index, items.length - 1)] ?? null;
}

/** Same projection as the generator's documentToEvolutionParams (module-private there). */
function documentToParams(document: CatDocument): CatParams {
  const legacy = catDocumentToLegacyParams(document);
  return {
    ...legacy,
    schemaVersion: document.schemaVersion,
    traits: structuredClone(document.traits),
    // readCatDocument yields `unknownTraits: {}`; the generator's projection
    // omits an empty one, so candidates must too or they differ from base.
    ...(document.unknownTraits && Object.keys(document.unknownTraits).length > 0
      ? { unknownTraits: structuredClone(document.unknownTraits) }
      : {}),
  } as unknown as CatParams;
}

function valueKey(value: unknown): string {
  return typeof value === "string"
    ? value.toUpperCase()
    : JSON.stringify(value);
}

function tortieKey(layer: TortieLayer): string {
  return [layer.mask, layer.pattern, layer.colour]
    .map((part) => (part ?? "").toUpperCase())
    .join("/");
}

/** Coat roll: the short-hair poses minus the base's own (never long hair), as full params. */
function coatRollCandidates(base: CatParams, count: number): CatParams[] {
  const basePose = base.poseName ?? null;
  const poses = COAT_ROLL_POSES.filter(
    (pose) => pose !== basePose && pose !== LONG_HAIR_POSE,
  );
  return poses.slice(0, count).map((poseName) => ({
    ...base,
    poseName,
    spriteNumber: legacySpriteNumberForPoseName(poseName) ?? base.spriteNumber,
    ...(base.traits ? { traits: { ...base.traits, pose: poseName } } : {}),
  }));
}

/**
 * Tortie colour picker: the clan palette (+ base colours) when `archetype`
 * has one — wild clans open up to the full pool half the time — else the
 * full pool.
 */
function tortieColourPicker(
  pools: EvolutionPools,
  archetype: string | null | undefined,
  random: () => number,
): () => string | null {
  const fullColours = uniqueClean([
    ...pools.baseColours,
    ...pools.experimentalColours,
  ]);
  const clanAssigned = archetype
    ? pools.clanColours?.[archetype as EvolutionArchetype]
    : undefined;
  const clanColours =
    clanAssigned && clanAssigned.length > 0
      ? uniqueClean([...clanAssigned, ...pools.baseColours])
      : null;
  const wild = archetype ? WILD_ARCHETYPE_SET.has(archetype) : false;
  return () => {
    if (!clanColours) return pickOne(fullColours, random);
    if (wild && random() < WILD_OPEN_CHANCE)
      return pickOne(fullColours, random);
    return pickOne(clanColours, random);
  };
}

/**
 * `count` WRONG candidates for `addition` on `base`: only that addition's slot
 * varies. tortie → random {mask, pattern, colour} (clan palette when
 * `archetype` is given); accessory/scar → their pools; replacement → the
 * matching pool with previousValue kept; coat → COAT_ROLL_POSES minus the
 * base pose; trait (generic registry) → [] (no safe candidate source).
 * De-duplicated, the true value excluded, deterministic for a given `random`.
 */
export function rollCandidates(
  base: CatParams,
  addition: EvolutionAddition,
  pools: EvolutionPools,
  random: () => number,
  count = 12,
  archetype?: string | null,
): CatParams[] {
  if (addition.kind === "trait") return [];

  if (addition.kind === "coat") return coatRollCandidates(base, count);

  const parent = normalizeEvolutionStarter(base);
  const teaseColour = tortieColourPicker(pools, archetype, random);
  const randomLayer = (): TortieLayer | null => {
    const mask = pickOne(pools.tortieMasks, random);
    const pattern = pickOne(pools.tortiePatterns, random);
    const colour = teaseColour();
    return mask && pattern && colour ? { mask, pattern, colour } : null;
  };

  // The slot's candidate pool: what one wrong pick looks like.
  const slot: "tortie" | "accessory" | "scar" =
    addition.kind === "replacement" ? addition.slot : addition.kind;
  const draw = (): unknown => {
    if (slot === "tortie") return randomLayer();
    if (slot === "accessory") return pickOne(pools.accessories, random);
    return pickOne(pools.scars, random);
  };
  const keyOf = (value: unknown): string =>
    slot === "tortie" ? tortieKey(value as TortieLayer) : valueKey(value);
  const trueKey = keyOf(addition.traitValue);
  const previous =
    addition.kind === "replacement" ? addition.previousValue : undefined;

  const seen = new Set<string>();
  const candidates: CatParams[] = [];
  const attempts = Math.max(1, count) * 20;
  for (
    let attempt = 0;
    attempt < attempts && candidates.length < count;
    attempt += 1
  ) {
    const value = draw();
    if (value === null || value === undefined) continue;
    const key = keyOf(value);
    if (key === trueKey || seen.has(key)) continue;
    seen.add(key);
    const document = applyEvolutionTraitChanges({
      parent: parent.document,
      changes: [
        {
          traitId: addition.traitId,
          value,
          ...(previous !== undefined ? { previous } : {}),
        },
      ],
    });
    candidates.push(documentToParams(readCatDocument(document)));
  }
  return candidates;
}

/** Label for the plaque: "ACCESSORY", "SCAR", "TORTIE", "COAT", "REPLACEMENT · ACCESSORY", or the registry trait label. */
export function rollTraitLabel(addition: EvolutionAddition): string {
  switch (addition.kind) {
    case "accessory":
      return "ACCESSORY";
    case "scar":
      return "SCAR";
    case "tortie":
      return "TORTIE";
    case "coat":
      return "COAT";
    case "replacement":
      return `REPLACEMENT · ${addition.slot.toUpperCase()}`;
    case "trait":
      return addition.label.toUpperCase();
  }
}

/** Full-word value for the plaque at land: formatAddition, never truncated. */
export function rollValueLabel(addition: EvolutionAddition): string {
  return formatAddition(addition);
}
