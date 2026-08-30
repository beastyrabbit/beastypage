import { isCoatPatternId, resolveCoatChoice } from "@/lib/cat-v3/coatPatterns";
import {
  legacySpriteNumberForPoseName,
  poseNameForLegacySpriteNumber,
} from "@/lib/cat-v3/poseOptions";
import type { CatalogDefinition, JsonValue } from "./definition";
import generatedCatCatalogValues from "./generated/catalog-values.generated.json";
import { type CatTraitId, catSystem } from "./registry";
import {
  type CatDocument,
  catDocumentSchema,
  isJsonValue,
  partitionTraitValues,
} from "./runtime";

const LEGACY_ENVELOPE_KEYS = new Set([
  "schemaVersion",
  "traits",
  "unknownTraits",
  "params",
  "finalParams",
  "accessorySlots",
  "scarSlots",
  "tortieSlots",
  "counts",
  "slots",
  "v",
]);

const LEGACY_TRAIT_KEYS = new Set<string>();
for (const trait of catSystem.traits) {
  switch (trait.legacy.strategy) {
    case "direct":
      LEGACY_TRAIT_KEYS.add(trait.legacy.key);
      break;
    case "list":
      LEGACY_TRAIT_KEYS.add(trait.legacy.key);
      if (trait.legacy.singleKey) LEGACY_TRAIT_KEYS.add(trait.legacy.singleKey);
      break;
    case "pose":
      LEGACY_TRAIT_KEYS.add(trait.legacy.key);
      LEGACY_TRAIT_KEYS.add(trait.legacy.spriteKey);
      LEGACY_TRAIT_KEYS.add("sprite");
      LEGACY_TRAIT_KEYS.add("sprite_number");
      LEGACY_TRAIT_KEYS.add("pose_name");
      break;
    case "tortie":
      for (const key of [
        "tortie",
        "isTortie",
        "tortieMask",
        "tortiePattern",
        "tortieColour",
      ]) {
        LEGACY_TRAIT_KEYS.add(key);
      }
      break;
    case "booleanAlias":
      LEGACY_TRAIT_KEYS.add(trait.legacy.key);
      for (const alias of trait.legacy.aliases) LEGACY_TRAIT_KEYS.add(alias);
      break;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withoutCanonicalEnvelope(
  params: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const legacy = { ...params };
  delete legacy.schemaVersion;
  delete legacy.traits;
  delete legacy.unknownTraits;
  return legacy;
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // JSON fallback is intentional for the portable CatDocument subset.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeStringList(value: unknown, single: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (entry: unknown): void => {
    if (typeof entry !== "string") return;
    const normalized = entry.trim();
    if (
      !normalized ||
      normalized.toLowerCase() === "none" ||
      seen.has(normalized)
    ) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  };
  if (Array.isArray(value)) value.forEach(add);
  add(single);
  return result;
}

function normalizeDirectLegacyValue(
  trait: (typeof catSystem.traits)[number],
  value: unknown,
): unknown {
  const catalogAllowsNone = (
    catalogId: string,
    seen = new Set<string>(),
  ): boolean => {
    if (seen.has(catalogId)) return false;
    seen.add(catalogId);
    const catalog = (
      catSystem.catalogs as Readonly<Record<string, CatalogDefinition>>
    )[catalogId];
    if (!catalog) return false;
    if (catalog.source === "tintData") return true;
    if (catalog.source === "static") {
      return catalog.elements.some(
        (element) => element.id.trim().toLowerCase() === "none",
      );
    }
    if (catalog.source === "composite") {
      return catalog.catalogs.some((entry) => catalogAllowsNone(entry, seen));
    }
    return false;
  };
  if (
    !trait.value.required &&
    trait.value.kind === "string" &&
    trait.value.default === undefined &&
    (!trait.value.catalog || !catalogAllowsNone(trait.value.catalog)) &&
    typeof value === "string" &&
    ["", "none", "null"].includes(value.trim().toLowerCase())
  ) {
    return undefined;
  }
  return value;
}

function normalizeTortieLayers(params: Record<string, unknown>): unknown[] {
  if (Array.isArray(params.tortie)) {
    return params.tortie.filter(isRecord).map((layer) => ({
      mask: String(layer.mask ?? "ONE"),
      pattern: String(layer.pattern ?? "SingleColour"),
      colour: String(layer.colour ?? "GINGER"),
    }));
  }
  if (!params.isTortie) return [];
  if (!params.tortieMask && !params.tortiePattern && !params.tortieColour) {
    return [];
  }
  return [
    {
      mask: String(params.tortieMask ?? "ONE"),
      pattern: String(params.tortiePattern ?? "SingleColour"),
      colour: String(params.tortieColour ?? "GINGER"),
    },
  ];
}

function resolveLegacySource(
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (isRecord(input.params)) return input.params;
  if (isRecord(input.finalParams)) return input.finalParams;
  return input;
}

function applyRequiredDefaults(traits: Record<string, unknown>): void {
  for (const trait of catSystem.traits) {
    if (traits[trait.id] !== undefined) continue;
    if (trait.value.default !== undefined) {
      traits[trait.id] = cloneJson(trait.value.default);
    }
  }
}

const catalogValueSets = new Map(
  Object.entries(generatedCatCatalogValues).map(([catalogId, values]) => [
    catalogId,
    new Set(values),
  ]),
);

function assertCatalogValue(
  traitId: string,
  path: string,
  catalogId: string,
  value: unknown,
): void {
  const values = catalogValueSets.get(catalogId);
  if (!values) {
    throw new Error(`${traitId} uses unresolved catalog ${catalogId}`);
  }
  if (typeof value !== "string" || !values.has(value)) {
    throw new Error(
      `${path} contains unsupported value ${JSON.stringify(value)} for catalog ${catalogId}`,
    );
  }
}

/** Mirrors the generated JSON-Schema catalog enums at synchronous TS boundaries. */
function assertCatalogTraitValues(
  traits: Readonly<Record<string, unknown>>,
): void {
  for (const trait of catSystem.traits) {
    const value = traits[trait.id];
    if (value === undefined) continue;

    if (trait.value.catalog) {
      if (trait.value.kind === "string") {
        assertCatalogValue(
          trait.id,
          `traits.${trait.id}`,
          trait.value.catalog,
          value,
        );
      } else if (trait.value.kind === "stringList") {
        for (const [index, entry] of (value as unknown[]).entries()) {
          assertCatalogValue(
            trait.id,
            `traits.${trait.id}[${index}]`,
            trait.value.catalog,
            entry,
          );
        }
      }
    }

    if (trait.gacha.strategy !== "tortieList") continue;
    for (const [index, layer] of (value as unknown[]).entries()) {
      if (!isRecord(layer)) continue;
      assertCatalogValue(
        trait.id,
        `traits.${trait.id}[${index}].mask`,
        trait.gacha.maskCatalog,
        layer.mask,
      );
      assertCatalogValue(
        trait.id,
        `traits.${trait.id}[${index}].pattern`,
        trait.gacha.peltCatalog,
        layer.pattern,
      );
      assertCatalogValue(
        trait.id,
        `traits.${trait.id}[${index}].colour`,
        trait.gacha.colourCatalog,
        layer.colour,
      );
    }
  }
}

function parseKnownCatDocument(input: unknown): CatDocument {
  const document = catDocumentSchema.parse(input) as CatDocument;
  assertCatalogTraitValues(
    document.traits as Readonly<Record<string, unknown>>,
  );
  return document;
}

export function legacyParamsToCatDocument(input: unknown): CatDocument {
  if (!isRecord(input)) throw new Error("Cat payload must be an object");
  const params = resolveLegacySource(input);
  const traits: Record<string, unknown> = {};

  for (const trait of catSystem.traits) {
    const legacy = trait.legacy;
    let value: unknown;
    switch (legacy.strategy) {
      case "direct":
        value = normalizeDirectLegacyValue(trait, params[legacy.key]);
        break;
      case "list":
        value = normalizeStringList(
          params[legacy.key],
          legacy.singleKey ? params[legacy.singleKey] : undefined,
        );
        break;
      case "pose": {
        const rawPose = params[legacy.key] ?? params.pose_name;
        if (typeof rawPose === "string" && rawPose.trim()) {
          value = rawPose.trim();
        } else {
          value =
            poseNameForLegacySpriteNumber(
              params[legacy.spriteKey] ?? params.sprite_number ?? params.sprite,
            ) ?? undefined;
        }
        break;
      }
      case "tortie":
        value = normalizeTortieLayers(params);
        break;
      case "booleanAlias":
        value = [legacy.key, ...legacy.aliases].some((key) =>
          Boolean(params[key]),
        );
        break;
    }
    if (value !== undefined) traits[trait.id] = value;
  }

  if (isCoatPatternId(traits.pelt)) {
    const resolved = resolveCoatChoice(traits.pelt);
    traits.pelt = resolved.peltName;
    if (resolved.coatPattern) traits.coatPattern = resolved.coatPattern;
  }

  applyRequiredDefaults(traits);

  const unknownTraits: Record<string, JsonValue> = {};
  const sources = params === input ? [params] : [input, params];
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (
        LEGACY_TRAIT_KEYS.has(key) ||
        LEGACY_ENVELOPE_KEYS.has(key) ||
        !isJsonValue(value)
      ) {
        continue;
      }
      unknownTraits[key] = cloneJson(value);
    }
  }

  return parseKnownCatDocument({
    schemaVersion: catSystem.schemaVersion,
    traits,
    unknownTraits:
      Object.keys(unknownTraits).length > 0 ? unknownTraits : undefined,
  }) as CatDocument;
}

export interface ReadCatDocumentOptions {
  strict?: boolean;
}

/**
 * Strict writer boundary for newly-created CatDocuments. It rejects unknown
 * active trait keys; forward-compatible values belong in `unknownTraits`.
 */
export function parseCatDocumentStrict(input: unknown): CatDocument {
  return readCatDocument(input, { strict: true });
}

/**
 * Tolerant reader used at persistence and API boundaries. Despite the legacy
 * name this also accepts future canonical documents and preserves their
 * unknown traits losslessly.
 */
export function decodeCatDocumentLegacy(input: unknown): CatDocument {
  return readCatDocument(input);
}

export function readCatDocument(
  input: unknown,
  options: ReadCatDocumentOptions = {},
): CatDocument {
  if (!isRecord(input)) throw new Error("Cat document must be an object");
  if (!isRecord(input.traits)) return legacyParamsToCatDocument(input);

  if (options.strict) {
    return parseKnownCatDocument(input);
  }

  const partitioned = partitionTraitValues(input.traits);
  applyRequiredDefaults(partitioned.known);
  const existingUnknown = isRecord(input.unknownTraits)
    ? Object.fromEntries(
        Object.entries(input.unknownTraits).filter(
          (entry): entry is [string, JsonValue] => isJsonValue(entry[1]),
        ),
      )
    : {};

  return parseKnownCatDocument({
    schemaVersion: catSystem.schemaVersion,
    traits: partitioned.known,
    unknownTraits: {
      ...existingUnknown,
      ...partitioned.unknown,
    },
  }) as CatDocument;
}

export function catDocumentToLegacyParams(
  documentInput: CatDocument | unknown,
): Record<string, unknown> {
  const document = readCatDocument(documentInput);
  const params: Record<string, unknown> = document.unknownTraits
    ? cloneJson(document.unknownTraits)
    : {};

  for (const trait of catSystem.traits) {
    const value = (document.traits as Record<string, unknown>)[trait.id];
    if (value === undefined) continue;
    const legacy = trait.legacy;
    switch (legacy.strategy) {
      case "direct":
        params[legacy.key] = cloneJson(value);
        break;
      case "list": {
        const list = Array.isArray(value) ? cloneJson(value) : [];
        params[legacy.key] = list;
        if (legacy.singleKey && list.length > 0)
          params[legacy.singleKey] = list[0];
        break;
      }
      case "pose": {
        params[legacy.key] = value;
        const spriteNumber = legacySpriteNumberForPoseName(String(value));
        if (spriteNumber !== null) params[legacy.spriteKey] = spriteNumber;
        break;
      }
      case "tortie": {
        const layers = Array.isArray(value) ? cloneJson(value) : [];
        params.tortie = layers;
        params.isTortie = layers.length > 0;
        const primary = isRecord(layers[0]) ? layers[0] : undefined;
        if (primary) {
          params.tortieMask = primary.mask;
          params.tortiePattern = primary.pattern;
          params.tortieColour = primary.colour;
        }
        break;
      }
      case "booleanAlias":
        params[legacy.key] = Boolean(value);
        for (const alias of legacy.aliases) params[alias] = Boolean(value);
        break;
    }
  }
  return params;
}

/**
 * Hydrates the registered flat projection from a canonical envelope without
 * rewriting that envelope. This is safe before an intentional legacy edit and
 * keeps forward traits in the exact location supplied by a newer catalog.
 */
export function projectCanonicalRegistryTraitsToLegacy<T extends object>(
  paramsInput: T,
): T {
  if (!isRecord(paramsInput)) throw new Error("Cat params must be an object");
  const params = paramsInput;
  if (!isRecord(params.traits)) return paramsInput;

  const schemaVersion = params.schemaVersion;
  const traits = params.traits;
  const unknownTraits = params.unknownTraits;
  const document = readCatDocument({
    schemaVersion,
    traits,
    unknownTraits,
  });
  for (const key of LEGACY_TRAIT_KEYS) delete params[key];
  Object.assign(params, catDocumentToLegacyParams(document), {
    schemaVersion: schemaVersion ?? document.schemaVersion,
    traits,
    unknownTraits,
  });
  return paramsInput;
}

/**
 * Rebuilds canonical known traits after a caller intentionally edits the
 * legacy projection. Call this directly after the flat mutation, while its
 * authority is still explicit; a later render boundary cannot infer which
 * side of an inconsistent dual payload was edited.
 *
 * Canonical-only and forward-compatible traits are retained. Only the traits
 * explicitly named by the caller replace their canonical value; a later
 * render boundary cannot safely guess which side of a dual payload changed.
 */
export function syncChangedRegistryTraitsFromLegacy<T extends object>(
  paramsInput: T,
  changedTraitIds: readonly CatTraitId[],
): T {
  if (!isRecord(paramsInput)) throw new Error("Cat params must be an object");
  if (changedTraitIds.length === 0) {
    throw new Error("At least one changed cat trait must be named");
  }
  const params = paramsInput;
  const legacyParams = withoutCanonicalEnvelope(params);
  const legacyDocument = legacyParamsToCatDocument(legacyParams);
  const canonicalTraits = isRecord(params.traits) ? params.traits : {};
  const traits: Record<string, unknown> = {
    ...legacyDocument.traits,
    ...canonicalTraits,
  };

  for (const traitId of new Set(changedTraitIds)) {
    const value = (legacyDocument.traits as Record<string, unknown>)[traitId];
    if (value === undefined) delete traits[traitId];
    else traits[traitId] = value;
  }

  const canonicalUnknown = isRecord(params.unknownTraits)
    ? Object.fromEntries(
        Object.entries(params.unknownTraits).filter(
          (entry): entry is [string, JsonValue] => isJsonValue(entry[1]),
        ),
      )
    : {};
  const document = readCatDocument({
    schemaVersion: catSystem.schemaVersion,
    traits,
    unknownTraits: {
      ...(legacyDocument.unknownTraits ?? {}),
      ...canonicalUnknown,
    },
  });
  const previousUnknown = isRecord(params.unknownTraits)
    ? Object.keys(params.unknownTraits)
    : [];
  for (const key of [...LEGACY_TRAIT_KEYS, ...previousUnknown]) {
    delete params[key];
  }
  Object.assign(params, catDocumentToLegacyParams(document), {
    schemaVersion: params.schemaVersion ?? document.schemaVersion,
    // Keep forward traits in their original canonical projection as well as
    // the tolerant document's flat rollback projection.
    traits,
    unknownTraits: document.unknownTraits,
  });
  return paramsInput;
}

/**
 * Restores the compact, pre-canonical params shape at database boundaries.
 *
 * Canonical params deliberately carry a complete document envelope while they
 * are edited and rendered. Persisting that envelope alongside its legacy
 * projection would duplicate every trait. Re-projecting before stripping also
 * keeps future values lossless: `unknownTraits.foo` becomes the flat legacy
 * `foo` field instead of disappearing with the envelope.
 */
export function catParamsToLegacyPersistence(
  paramsInput: Readonly<Record<string, unknown>>,
  documentInput?: unknown,
): Record<string, unknown> {
  const inputParams: Record<string, unknown> = {
    ...cloneJson(paramsInput),
  };
  const canonicalInput =
    documentInput ??
    (isRecord(inputParams.traits)
      ? {
          schemaVersion: inputParams.schemaVersion,
          traits: inputParams.traits,
          unknownTraits: inputParams.unknownTraits,
        }
      : undefined);
  // Flat values are the live compatibility state and may have been edited
  // after the canonical snapshot (for example an afterlife override). Use the
  // projection only to fill future/unknown flat keys that are otherwise absent.
  const params: Record<string, unknown> =
    canonicalInput === undefined
      ? inputParams
      : { ...catDocumentToLegacyParams(canonicalInput), ...inputParams };

  delete params.schemaVersion;
  delete params.traits;
  delete params.unknownTraits;
  return params;
}

/**
 * Converts a known cat-data wrapper for Convex without mutating the local
 * render/share payload. Only the canonical document and duplicated params
 * envelopes are removed; slots, counts, metadata and flattened future traits
 * remain untouched.
 */
export function catDataToLegacyPersistence(
  catDataInput: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { document, ...rest } = catDataInput;
  const catData: Record<string, unknown> = { ...rest };
  if (isRecord(catData.params)) {
    catData.params = catParamsToLegacyPersistence(catData.params, document);
  }
  if (isRecord(catData.finalParams)) {
    catData.finalParams = catParamsToLegacyPersistence(catData.finalParams);
  }
  return catData;
}

export function createDualCatPayload(documentInput: CatDocument | unknown): {
  document: CatDocument;
  params: Record<string, unknown>;
  poseName?: string;
  spriteNumber?: number;
} {
  const document = readCatDocument(documentInput);
  const params = catDocumentToLegacyParams(document);
  const poseName =
    typeof params.poseName === "string" ? params.poseName : undefined;
  const spriteNumber =
    typeof params.spriteNumber === "number" ? params.spriteNumber : undefined;
  delete params.poseName;
  delete params.spriteNumber;
  return { document, params, poseName, spriteNumber };
}

export function setCatTrait(
  documentInput: CatDocument | unknown,
  traitId: string,
  value: unknown,
): CatDocument {
  const document = readCatDocument(documentInput);
  const canonicalId = catSystem.aliases[traitId] ?? traitId;
  const trait = catSystem.traits.find(
    (candidate) => candidate.id === canonicalId,
  );
  if (!trait) throw new Error(`Unknown cat trait ${traitId}`);
  const parsed = trait.value.schema.parse(value);
  return readCatDocument(
    {
      ...document,
      traits: { ...document.traits, [canonicalId]: parsed },
    },
    { strict: true },
  );
}

export function getCatTrait(
  documentInput: CatDocument | unknown,
  traitId: string,
): unknown {
  const document = readCatDocument(documentInput);
  const canonicalId = catSystem.aliases[traitId] ?? traitId;
  return (document.traits as Record<string, unknown>)[canonicalId];
}

export function clearCatTrait(
  documentInput: CatDocument | unknown,
  traitId: string,
): CatDocument {
  const document = readCatDocument(documentInput);
  const canonicalId = catSystem.aliases[traitId] ?? traitId;
  const trait = catSystem.traits.find(
    (candidate) => candidate.id === canonicalId,
  );
  if (!trait) throw new Error(`Unknown cat trait ${traitId}`);
  if (trait.value.required) {
    throw new Error(`Required cat trait ${canonicalId} cannot be cleared`);
  }
  const traits = { ...document.traits } as Record<string, unknown>;
  delete traits[canonicalId];
  return parseCatDocumentStrict({ ...document, traits });
}

export function preserveUnknownTraits(
  documentInput: CatDocument | unknown,
  unknownTraits: Readonly<Record<string, JsonValue>>,
): CatDocument {
  const document = readCatDocument(documentInput);
  return parseCatDocumentStrict({
    ...document,
    unknownTraits: {
      ...(document.unknownTraits ?? {}),
      ...cloneJson(unknownTraits),
    },
  });
}

/** @deprecated Prefer `catDocumentToLegacyParams` only at rollback boundaries. */
export const toLegacyRenderPayload = catDocumentToLegacyParams;
