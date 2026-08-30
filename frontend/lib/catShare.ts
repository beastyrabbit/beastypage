import {
  type CatDocument,
  catDocumentToLegacyParams,
  parseCatDocumentStrict,
  readCatDocument,
} from "@/lib/cat-system";
import type { JsonValue } from "@/lib/cat-system/definition";
import { getSlotTraits, isJsonValue } from "@/lib/cat-system/runtime";
import type { TortieLayer as SharedTortieLayer } from "@/lib/cat-v3/types";

// Keep the wire version readable by v7.3.1 during rolling deploys and
// rollbacks. New readers use the embedded document; old readers ignore it and
// consume the legacy projection.
const SHARE_VERSION = 1 as const;
const CANONICAL_ONLY_SHARE_VERSION = 2;

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const nodeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
    .Buffer;
  if (nodeBuffer) return nodeBuffer.from(bytes).toString("base64");
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  throw new Error("Base64 encoding not supported in this environment");
}

function fromBase64(value: string): string {
  const nodeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
    .Buffer;
  if (nodeBuffer) return nodeBuffer.from(value, "base64").toString("utf8");
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  throw new Error("Base64 decoding not supported in this environment");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const stringValue = String(value).trim();
  return stringValue === "" ? undefined : stringValue;
}

function sanitizeStringArray(values: unknown, fallbackLength = 0): string[] {
  if (!Array.isArray(values)) return new Array(fallbackLength).fill("none");
  return values.map((entry) => cleanString(entry) || "none");
}

export type TortieLayer = {
  mask: string;
  pattern: string;
  colour: string;
};

function sanitizeTortieArray(
  values: unknown,
  fallbackLength = 0,
): (TortieLayer | null)[] {
  if (!Array.isArray(values)) return new Array(fallbackLength).fill(null);
  return values.map((value) => {
    if (!isRecord(value)) return null;
    return {
      mask: cleanString(value.mask) || "ONE",
      pattern: cleanString(value.pattern) || "SingleColour",
      colour: cleanString(value.colour) || "GINGER",
    };
  });
}

export type CatShareCounts = Record<string, number> & {
  accessories: number;
  scars: number;
  tortie: number;
};

export type CatShareSlots = Record<string, JsonValue[]>;
type SanitizedParams = Record<string, unknown>;

function normalizeCount(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? Math.max(0, Math.trunc(numberValue))
    : 0;
}

function normalizeCounts(
  input: unknown,
  slots: Readonly<CatShareSlots> = {},
): CatShareCounts {
  const source = isRecord(input) ? input : {};
  const result: Record<string, number> = {};
  for (const [traitId, value] of Object.entries(source)) {
    result[traitId] = normalizeCount(value);
  }
  for (const [traitId, values] of Object.entries(slots)) {
    result[traitId] = values.length;
  }
  return {
    ...result,
    accessories: result.accessories ?? 0,
    scars: result.scars ?? 0,
    tortie: result.tortie ?? 0,
  };
}

function normalizeSlots(input: unknown): CatShareSlots {
  if (!isRecord(input)) return {};
  const slots: CatShareSlots = {};
  for (const [traitId, value] of Object.entries(input)) {
    if (!Array.isArray(value)) continue;
    const entries = value.filter(isJsonValue).map(cloneJson);
    slots[traitId] = entries;
  }
  return slots;
}

function buildSlots(data: EncodePayload, document: CatDocument): CatShareSlots {
  const slots = normalizeSlots(data.traitSlots);
  if (data.accessorySlots) {
    slots.accessories = sanitizeStringArray(data.accessorySlots);
  }
  if (data.scarSlots) slots.scars = sanitizeStringArray(data.scarSlots);
  if (data.tortieSlots) {
    slots.tortie = sanitizeTortieArray(data.tortieSlots) as JsonValue[];
  }

  const traits = document.traits as Record<string, unknown>;
  for (const trait of getSlotTraits()) {
    if (slots[trait.id]) continue;
    const value = traits[trait.id];
    if (Array.isArray(value)) {
      slots[trait.id] = value.filter(isJsonValue).map(cloneJson);
    }
  }

  const requestedCounts = normalizeCounts(data.counts);
  for (const [traitId, count] of Object.entries(requestedCounts)) {
    if (count <= 0 || slots[traitId]?.length) continue;
    slots[traitId] = new Array(count).fill(
      traitId === "tortie" ? null : "none",
    );
  }
  return slots;
}

export interface CatShareStoredPayloadV1 {
  v: typeof SHARE_VERSION;
  document: CatDocument;
  params: SanitizedParams;
  slots: CatShareSlots;
  counts: Record<string, number>;
}

export type CatShareStoredPayload = CatShareStoredPayloadV1;

export interface CatSharePayload {
  document: CatDocument;
  params: SanitizedParams;
  traitSlots: CatShareSlots;
  traitCounts: Record<string, number>;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieLayer | null)[];
  counts: CatShareCounts;
}

export type EncodePayload = {
  document?: CatDocument | unknown;
  params?: Record<string, unknown>;
  traitSlots?: Readonly<Record<string, readonly JsonValue[]>>;
  accessorySlots?: (string | null)[];
  scarSlots?: (string | null)[];
  tortieSlots?: (
    | SharedTortieLayer
    | TortieLayer
    | Record<string, unknown>
    | null
  )[];
  counts?: Partial<Record<string, number>>;
};

export function prepareCatShare(data: EncodePayload): CatShareStoredPayload {
  if (!data || (!data.document && !data.params)) {
    throw new Error("encodeCatShare: document or params are required");
  }
  let document = parseCatDocumentStrict(
    readCatDocument(data.document ?? data.params),
  );
  // Named poses no longer always have a legacy numeric index. Keep an incoming
  // index as rollback metadata so old viewers receive exactly what was shared.
  const legacySpriteNumber = data.params?.spriteNumber;
  if (
    typeof legacySpriteNumber === "number" &&
    Number.isFinite(legacySpriteNumber)
  ) {
    document = parseCatDocumentStrict({
      ...document,
      unknownTraits: {
        ...(document.unknownTraits ?? {}),
        spriteNumber: legacySpriteNumber,
      },
    });
  }
  const slots = buildSlots(data, document);
  const counts = normalizeCounts(data.counts, slots);
  return {
    v: SHARE_VERSION,
    document,
    params: catDocumentToLegacyParams(document),
    slots,
    counts,
  };
}

export type CreateCatShareResult = {
  slug: string;
  id?: string | null;
  payload: CatShareStoredPayload;
};

type CreateCatShareOptions = { slug?: string };

export async function createCatShare(
  data: EncodePayload,
  options?: CreateCatShareOptions,
): Promise<CreateCatShareResult | null> {
  if (typeof fetch !== "function") {
    console.warn("createCatShare: fetch is unavailable in this environment");
    return null;
  }
  try {
    const payload = prepareCatShare(data);
    const response = await fetch("/api/cat-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ slug: options?.slug, data: payload }),
    });
    if (!response.ok) {
      throw new Error(`createCatShare: unexpected status ${response.status}`);
    }
    const json = (await response.json()) as {
      slug?: string;
      id?: string | null;
    };
    if (!json.slug) throw new Error("createCatShare: response missing slug");
    return { slug: json.slug, id: json.id ?? null, payload };
  } catch (error) {
    console.error("Failed to create cat share", error);
    return null;
  }
}

function projectPayload(
  documentInput: unknown,
  slotsInput: unknown,
  countsInput: unknown,
): CatSharePayload | null {
  try {
    const document = readCatDocument(documentInput);
    const slots = normalizeSlots(slotsInput);
    const counts = normalizeCounts(countsInput, slots);
    return {
      document,
      params: catDocumentToLegacyParams(document),
      traitSlots: slots,
      traitCounts: { ...counts },
      accessorySlots: sanitizeStringArray(
        slots.accessories,
        counts.accessories,
      ),
      scarSlots: sanitizeStringArray(slots.scars, counts.scars),
      tortieSlots: sanitizeTortieArray(slots.tortie, counts.tortie),
      counts,
    };
  } catch {
    return null;
  }
}

function normalizeStoredPayload(payload: unknown): CatSharePayload | null {
  if (!isRecord(payload)) return null;
  if (payload.v === SHARE_VERSION) {
    return projectPayload(
      payload.document ?? payload.params,
      payload.slots,
      payload.counts,
    );
  }
  if (payload.v === CANONICAL_ONLY_SHARE_VERSION) {
    return projectPayload(payload.document, payload.slots, payload.counts);
  }
  return null;
}

export function encodeCatShare(data: EncodePayload): string {
  return toBase64(JSON.stringify(prepareCatShare(data)));
}

function decodeInlineCatShare(encoded: string): CatSharePayload | null {
  try {
    return normalizeStoredPayload(JSON.parse(fromBase64(encoded)));
  } catch (error) {
    console.error("decodeCatShare: failed to parse payload", error);
    return null;
  }
}

function isLikelySlug(value: string): boolean {
  return (
    value.length >= 4 &&
    value.length <= 16 &&
    !/[^0-9A-Za-z]/.test(value) &&
    !value.includes("=")
  );
}

function resolveApiBase(): string {
  if (typeof window !== "undefined") return "";
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_HUB_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : undefined,
    "http://localhost:3000",
  ];
  return (
    candidates
      .find(
        (candidate) =>
          candidate?.startsWith("http://") || candidate?.startsWith("https://"),
      )
      ?.replace(/\/$/, "") ?? ""
  );
}

async function fetchShareBySlug(slug: string): Promise<CatSharePayload | null> {
  try {
    const base = resolveApiBase();
    const response = await fetch(
      `${base}/api/cat-share?slug=${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const json = await response.json();
    return normalizeStoredPayload(json?.data ?? json);
  } catch (error) {
    console.error("Failed to fetch cat share", error);
    return null;
  }
}

export async function decodeCatShare(
  value: string | null | undefined,
): Promise<CatSharePayload | null> {
  if (!value) return null;
  return isLikelySlug(value)
    ? fetchShareBySlug(value)
    : decodeInlineCatShare(value);
}

export const resolveCatShareValue = decodeCatShare;
export const sanitizeCounts = normalizeCounts;
