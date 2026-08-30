import {
  type CatDocument,
  createDualCatPayload,
  type DisplayRow,
  getCatTraitDefinition,
  getDisplayRows,
  getTraitCatalogElements,
  isJsonValue,
  preserveUnknownTraits,
  readCatDocument,
  setCatTrait,
} from "@/lib/cat-system";
import type { CatRenderParams, TortieLayer } from "@/lib/cat-v3/types";
import type { EncodePayload } from "@/lib/catShare";

export interface CanonicalCatViewPayload {
  document: CatDocument;
  params: Record<string, unknown>;
  traitSlots: Record<string, unknown[]>;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieLayer | null)[];
  counts: Record<string, number> & {
    accessories: number;
    scars: number;
    tortie: number;
  };
}

export interface CatTraitDisplayRow {
  key: string;
  traitId: string;
  label: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value) as T;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function normalizeStringSlots(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" &&
      entry.trim().length > 0 &&
      entry.toLowerCase() !== "none",
  );
}

function normalizeTortieSlots(value: unknown): (TortieLayer | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isRecord(entry)) return null;
    const mask = cleanString(entry.mask);
    const pattern = cleanString(entry.pattern ?? entry.peltName);
    const colour = cleanString(entry.colour ?? entry.color);
    if (!mask || !pattern || !colour) return null;
    return { mask, pattern, colour };
  });
}

function getRawParams(root: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(root.params)) return root.params;
  if (isRecord(root.finalParams)) return root.finalParams;
  return root;
}

function getInputSlots(
  root: Record<string, unknown>,
): Record<string, unknown[]> {
  const rawSlots = isRecord(root.traitSlots)
    ? root.traitSlots
    : isRecord(root.slots)
      ? root.slots
      : {};
  const result: Record<string, unknown[]> = {};
  for (const [traitId, value] of Object.entries(rawSlots)) {
    if (Array.isArray(value)) result[traitId] = cloneValue(value);
  }
  if (Array.isArray(root.accessorySlots)) {
    result.accessories = cloneValue(root.accessorySlots);
  }
  if (Array.isArray(root.scarSlots)) {
    result.scars = cloneValue(root.scarSlots);
  }
  if (Array.isArray(root.tortieSlots)) {
    result.tortie = cloneValue(root.tortieSlots);
  }
  return result;
}

function mergeLegacySlots(
  rawParams: Record<string, unknown>,
  slots: Readonly<Record<string, unknown[]>>,
): Record<string, unknown> {
  const merged = { ...rawParams };
  for (const [traitId, values] of Object.entries(slots)) {
    if (merged[traitId] === undefined) merged[traitId] = cloneValue(values);
  }
  if (merged.accessories === undefined && slots.accessories) {
    merged.accessories = cloneValue(slots.accessories);
  }
  if (merged.scars === undefined && slots.scars) {
    merged.scars = cloneValue(slots.scars);
  }
  if (merged.tortie === undefined && slots.tortie) {
    merged.tortie = cloneValue(slots.tortie);
    merged.isTortie = slots.tortie.length > 0;
  }
  return merged;
}

function activeSlotValues(values: readonly unknown[]): unknown[] {
  return values.filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      !(typeof value === "string" && value.toLowerCase() === "none"),
  );
}

function mergeCanonicalSlots(
  source: CatDocument,
  slots: Readonly<Record<string, unknown[]>>,
): CatDocument {
  let document = source;
  for (const [traitId, rawValues] of Object.entries(slots)) {
    const values = activeSlotValues(rawValues);
    if (values.length === 0) continue;
    const current = (document.traits as Record<string, unknown>)[traitId];
    if (
      current !== undefined &&
      (!Array.isArray(current) || current.length > 0)
    ) {
      continue;
    }
    if (!getCatTraitDefinition(traitId)) {
      if (isJsonValue(values)) {
        document = preserveUnknownTraits(document, { [traitId]: values });
      }
      continue;
    }
    try {
      document = setCatTrait(document, traitId, values);
    } catch (error) {
      // A malformed legacy projection must not invalidate a sound document.
      console.warn(`Ignoring invalid ${traitId} slot projection`, error);
    }
  }
  return document;
}

export function catDocumentToViewParams(
  document: CatDocument,
  fallback?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const dual = createDualCatPayload(document);
  const poseName =
    dual.poseName ??
    cleanString(fallback?.poseName) ??
    cleanString(fallback?.pose_name);
  const spriteNumber =
    dual.spriteNumber ??
    firstNumber(
      fallback?.spriteNumber,
      fallback?.sprite_number,
      fallback?.sprite,
    ) ??
    0;
  return {
    ...dual.params,
    schemaVersion: document.schemaVersion,
    traits: cloneValue(document.traits),
    unknownTraits: document.unknownTraits
      ? cloneValue(document.unknownTraits)
      : undefined,
    spriteNumber,
    ...(poseName ? { poseName } : {}),
  };
}

/**
 * Tolerant boundary for saved cats. Legacy wrappers and slot projections are
 * accepted once, then every consumer receives the same canonical document.
 */
export function normalizeCatViewPayload(
  input: unknown,
): CanonicalCatViewPayload {
  if (!isRecord(input)) throw new Error("Cat payload must be an object");
  const root = input;
  const rawParams = getRawParams(root);
  const inputSlots = getInputSlots(root);
  const legacySource = mergeLegacySlots(
    {
      ...rawParams,
      ...(rawParams.poseName === undefined && root.poseName !== undefined
        ? { poseName: root.poseName }
        : {}),
      ...(rawParams.spriteNumber === undefined &&
      root.spriteNumber !== undefined
        ? { spriteNumber: root.spriteNumber }
        : {}),
    },
    inputSlots,
  );
  const explicitDocument = isRecord(root.document)
    ? root.document
    : isRecord(rawParams.document)
      ? rawParams.document
      : null;
  const legacyDocumentInput = isRecord(legacySource.traits)
    ? legacySource
    : rawParams === root
      ? legacySource
      : { ...root, params: legacySource };
  const document = mergeCanonicalSlots(
    readCatDocument(explicitDocument ?? legacyDocumentInput),
    inputSlots,
  );
  const params = catDocumentToViewParams(document, legacySource);
  const traits = document.traits as Record<string, unknown>;
  const traitSlots: Record<string, unknown[]> = { ...inputSlots };
  for (const [traitId, value] of Object.entries(traits)) {
    if (Array.isArray(value) && traitSlots[traitId] === undefined) {
      traitSlots[traitId] = cloneValue(value);
    }
  }

  const accessorySlots = normalizeStringSlots(
    traitSlots.accessories ?? traits.accessories,
  );
  const scarSlots = normalizeStringSlots(traitSlots.scars ?? traits.scars);
  const tortieSlots = normalizeTortieSlots(traitSlots.tortie ?? traits.tortie);
  traitSlots.accessories = accessorySlots;
  traitSlots.scars = scarSlots;
  traitSlots.tortie = tortieSlots;

  const rawCounts = isRecord(root.counts) ? root.counts : {};
  const counts: Record<string, number> = {};
  for (const [traitId, value] of Object.entries(rawCounts)) {
    counts[traitId] = normalizeCount(value);
  }
  for (const [traitId, values] of Object.entries(inputSlots)) {
    counts[traitId] = Math.max(counts[traitId] ?? 0, values.length);
  }
  for (const [traitId, values] of Object.entries(traitSlots)) {
    counts[traitId] = Math.max(counts[traitId] ?? 0, values.length);
  }

  return {
    document,
    params,
    traitSlots,
    accessorySlots,
    scarSlots,
    tortieSlots,
    counts: {
      ...counts,
      accessories: Math.max(counts.accessories ?? 0, accessorySlots.length),
      scars: Math.max(counts.scars ?? 0, scarSlots.length),
      tortie: Math.max(counts.tortie ?? 0, tortieSlots.length),
    },
  };
}

export function toCanonicalRenderPayload(input: unknown): CatRenderParams {
  const canonical = normalizeCatViewPayload(input);
  const {
    poseName,
    spriteNumber,
    schemaVersion: _schemaVersion,
    traits: _traits,
    unknownTraits: _unknownTraits,
    ...legacyParams
  } = canonical.params;
  return {
    spriteNumber:
      typeof spriteNumber === "number" && Number.isFinite(spriteNumber)
        ? spriteNumber
        : 0,
    poseName: cleanString(poseName),
    document: canonical.document,
    params: legacyParams,
  } as CatRenderParams;
}

export function catViewPayloadToShareSeed(
  payload: CanonicalCatViewPayload,
): EncodePayload {
  return {
    document: payload.document,
    params: payload.params,
    traitSlots: Object.fromEntries(
      Object.entries(payload.traitSlots).map(([traitId, values]) => [
        traitId,
        values.filter(isJsonValue),
      ]),
    ),
    accessorySlots: payload.accessorySlots,
    scarSlots: payload.scarSlots,
    tortieSlots: payload.tortieSlots,
    counts: payload.counts,
  };
}

export function setCanonicalViewTrait(
  payload: CanonicalCatViewPayload,
  traitId: string,
  value: unknown,
): CanonicalCatViewPayload {
  const document = setCatTrait(payload.document, traitId, value);
  return normalizeCatViewPayload({ document });
}

function humanize(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return "";
  const normalized = /^[A-Z0-9 ]+$/.test(spaced)
    ? spaced.toLowerCase()
    : spaced;
  return normalized.replace(/^./, (character) => character.toUpperCase());
}

function formatScalar(traitId: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : null;
  if (typeof value === "string") {
    if (value.toLowerCase() === "none") return null;
    const option = getTraitCatalogElements(traitId).find(
      (candidate) => candidate.id === value,
    );
    return option?.label || humanize(value);
  }
  if (typeof value === "number") return String(value);
  if (isRecord(value)) {
    const parts = Object.values(value)
      .map((entry) => formatScalar(traitId, entry))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length > 0 ? parts.join(" • ") : null;
  }
  return humanize(String(value));
}

/** Formats metadata-driven display rows without branching on trait IDs. */
export function formatCatDisplayRows(
  rows: readonly DisplayRow[],
): CatTraitDisplayRow[] {
  return rows.flatMap((row) => {
    if (Array.isArray(row.value)) {
      return row.value.flatMap((entry, index) => {
        const value = formatScalar(row.traitId, entry);
        return value
          ? [
              {
                key: `${row.traitId}-${index}`,
                traitId: row.traitId,
                label: `${row.label} ${index + 1}`,
                value,
              },
            ]
          : [];
      });
    }
    const value = formatScalar(row.traitId, row.value);
    return value
      ? [
          {
            key: row.traitId,
            traitId: row.traitId,
            label: row.label,
            value,
          },
        ]
      : [];
  });
}

export function getCatViewDisplayRows(
  input: CanonicalCatViewPayload | CatDocument | unknown,
): CatTraitDisplayRow[] {
  const document =
    isRecord(input) && "document" in input
      ? normalizeCatViewPayload(input).document
      : isRecord(input) && "schemaVersion" in input && "traits" in input
        ? readCatDocument(input)
        : normalizeCatViewPayload(input).document;
  return formatCatDisplayRows(
    getDisplayRows(document.traits as Record<string, unknown>),
  );
}
