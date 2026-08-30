import {
  type CatDocument,
  clearCatTrait,
  createDualCatPayload,
  getCatTrait,
  getTraitEditorDefinitions,
  legacyParamsToCatDocument,
  readCatDocument,
  setCatTrait,
  type TraitEditorDefinition,
} from "@/lib/cat-system";
import type { CatParams } from "@/lib/cat-v3/types";

/** Traits with dedicated, richer controls in the Visual Builder. */
export const VISUAL_BUILDER_SPECIALIZED_TRAITS = [
  "pose",
  "pelt",
  "coatPattern",
  "colour",
  "tortie",
  "tint",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "eyeColour",
  "eyeColour2",
  "scars",
  "shading",
  "skinColour",
  "accessories",
  "reverse",
] as const;

/** Traits with dedicated, richer controls in the Guided Builder. */
export const GUIDED_BUILDER_SPECIALIZED_TRAITS = [
  "pose",
  "pelt",
  "coatPattern",
  "colour",
  "tortie",
  "tint",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "eyeColour",
  "eyeColour2",
  "scars",
  "skinColour",
  "accessories",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value) as T;
}

/**
 * Filters editor metadata without knowing any future trait IDs. Kept separate
 * from the catalog read so probe definitions can exercise the same adapter.
 */
export function filterUnhandledTraitEditorDefinitions(
  definitions: readonly TraitEditorDefinition[],
  specializedTraitIds: readonly string[],
): TraitEditorDefinition[] {
  const specialized = new Set(specializedTraitIds);
  return definitions.filter(
    (definition) => !specialized.has(definition.traitId),
  );
}

/** Reads the generated public catalog through the cat-system editor API. */
export function getUnhandledTraitEditorDefinitions(
  specializedTraitIds: readonly string[],
  pose?: string,
): TraitEditorDefinition[] {
  return filterUnhandledTraitEditorDefinitions(
    getTraitEditorDefinitions(pose),
    specializedTraitIds,
  );
}

/**
 * Reconciles the canonical envelope with legacy projections used by existing
 * specialized controls. Legacy projections win because they are the fields a
 * specialized control has just changed; canonical-only traits stay preserved.
 */
export function builderParamsToCatDocument(params: CatParams): CatDocument {
  const projected = legacyParamsToCatDocument(params);
  if (!params.unknownTraits) return projected;
  return readCatDocument({
    ...projected,
    unknownTraits: {
      ...params.unknownTraits,
      ...(projected.unknownTraits ?? {}),
    },
  });
}

/** Projects a canonical document back to the rollback-safe builder shape. */
export function catDocumentToBuilderParams(
  document: CatDocument,
  previous?: Pick<CatParams, "spriteNumber" | "poseName">,
): CatParams {
  const dual = createDualCatPayload(document);
  return {
    ...dual.params,
    schemaVersion: document.schemaVersion,
    traits: cloneValue(document.traits),
    unknownTraits: document.unknownTraits
      ? cloneValue(document.unknownTraits)
      : undefined,
    spriteNumber: dual.spriteNumber ?? previous?.spriteNumber ?? 0,
    poseName: dual.poseName ?? previous?.poseName,
  } as CatParams;
}

/** Canonicalizes any specialized legacy-field mutation in one operation. */
export function mutateBuilderParams(
  params: CatParams,
  mutator: (draft: CatParams) => void,
): CatParams {
  const draft = cloneValue(params);
  mutator(draft);
  return catDocumentToBuilderParams(builderParamsToCatDocument(draft), draft);
}

export function synchronizeBuilderParams(params: CatParams): CatParams {
  return catDocumentToBuilderParams(builderParamsToCatDocument(params), params);
}

/** Use when loading a canonical envelope before specialized fields are edited. */
export function hydrateBuilderParams(params: CatParams): CatParams {
  if (!isRecord(params.traits)) return synchronizeBuilderParams(params);
  const document = readCatDocument({
    schemaVersion: params.schemaVersion,
    traits: params.traits,
    unknownTraits: params.unknownTraits,
  });
  return catDocumentToBuilderParams(document, params);
}

export function getBuilderTraitValue(
  params: CatParams,
  traitId: string,
): unknown {
  return getCatTrait(builderParamsToCatDocument(params), traitId);
}

export function setBuilderTraitValue(
  params: CatParams,
  traitId: string,
  value: unknown,
): CatParams {
  const document = setCatTrait(
    builderParamsToCatDocument(params),
    traitId,
    value,
  );
  return catDocumentToBuilderParams(document, params);
}

export function clearBuilderTraitValue(
  params: CatParams,
  traitId: string,
): CatParams {
  const document = clearCatTrait(builderParamsToCatDocument(params), traitId);
  return catDocumentToBuilderParams(document, params);
}
