const SHARE_VERSION = 1;

function toBase64(str: string): string {
  if (typeof btoa === "function") {
    return btoa(str);
  }
  const nodeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(str, "utf-8").toString("base64");
  }
  throw new Error("Base64 encoding not supported in this environment");
}

function fromBase64(str: string): string {
  if (typeof atob === "function") {
    return atob(str);
  }
  const nodeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(str, "base64").toString("utf-8");
  }
  throw new Error("Base64 decoding not supported in this environment");
}

const PARAM_KEYS = [
  "spriteNumber",
  "peltName",
  "colour",
  "eyeColour",
  "eyeColour2",
  "tint",
  "skinColour",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "accessories",
  "accessory",
  "scars",
  "scar",
  "tortie",
  "isTortie",
  "tortieMask",
  "tortiePattern",
  "tortieColour",
  "shading",
  "reverse",
  "darkForest",
  "darkMode",
  "dead",
] as const;

type ParamKey = (typeof PARAM_KEYS)[number];

const BOOLEAN_KEYS: Set<ParamKey> = new Set(["isTortie", "shading", "reverse", "darkForest", "darkMode", "dead"]);
const NUMBER_KEYS: Set<ParamKey> = new Set(["spriteNumber"]);

function cleanString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str === "" ? undefined : str;
}

function sanitizeStringArray(values: unknown, fallbackLength = 0): string[] {
  const result: string[] = [];
  if (!Array.isArray(values)) {
    if (fallbackLength > 0) {
      return new Array(fallbackLength).fill("none");
    }
    return result;
  }
  for (const entry of values) {
    const cleaned = cleanString(entry) || "none";
    result.push(cleaned);
  }
  return result;
}

type TortieLayer = {
  mask: string;
  pattern: string;
  colour: string;
};

function sanitizeTortieArray(values: unknown, fallbackLength = 0): (TortieLayer | null)[] {
  if (!Array.isArray(values)) {
    return new Array(fallbackLength).fill(null);
  }
  const result: (TortieLayer | null)[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") {
      result.push(null);
      continue;
    }
    const record = value as Record<string, unknown>;
    const cleaned: TortieLayer = {
      mask: cleanString(record.mask) || "ONE",
      pattern: cleanString(record.pattern) || "SingleColour",
      colour: cleanString(record.colour) || "GINGER",
    };
    if (!cleaned.mask && !cleaned.pattern && !cleaned.colour) {
      result.push(null);
    } else {
      result.push(cleaned);
    }
  }
  return result;
}

type Counts = {
  accessories: number;
  scars: number;
  tortie: number;
};

type CatShareParams = Record<string, unknown>;

function sanitizeCounts(counts?: Partial<Counts>): Counts {
  return {
    accessories: Number.isFinite(counts?.accessories) ? Math.max(0, Math.trunc(counts!.accessories!)) : 0,
    scars: Number.isFinite(counts?.scars) ? Math.max(0, Math.trunc(counts!.scars!)) : 0,
    tortie: Number.isFinite(counts?.tortie) ? Math.max(0, Math.trunc(counts!.tortie!)) : 0,
  };
}

type SanitizedParams = Record<string, unknown>;

function sanitizeParams(params: CatShareParams = {}): SanitizedParams {
  const clean: SanitizedParams = {};
  for (const key of PARAM_KEYS) {
    if (!(key in params)) continue;
    const value = params[key];
    if (BOOLEAN_KEYS.has(key)) {
      clean[key] = Boolean(value);
      continue;
    }
    if (NUMBER_KEYS.has(key)) {
      const num = Number(value);
      if (Number.isFinite(num)) {
        clean[key] = num;
      }
      continue;
    }
    if (key === "accessories" || key === "scars") {
      const arr = sanitizeStringArray(value);
      if (arr.length) {
        clean[key] = arr.filter((entry) => entry !== "none");
      }
      continue;
    }
    if (key === "tortie") {
      const arr = sanitizeTortieArray(value);
      if (arr.some((entry) => entry)) {
        clean[key] = arr.filter((entry): entry is TortieLayer => !!entry);
      }
      continue;
    }
    if (key === "accessory" || key === "scar") {
      const str = cleanString(value);
      if (str) clean[key] = str;
      continue;
    }
    const strValue = cleanString(value);
    if (strValue !== undefined) {
      clean[key] = strValue;
    }
  }

  if (!clean.accessory && Array.isArray(clean.accessories) && clean.accessories.length > 0) {
    clean.accessory = clean.accessories[0];
  }
  if (!clean.scar && Array.isArray(clean.scars) && clean.scars.length > 0) {
    clean.scar = clean.scars[0];
  }

  if (clean.isTortie) {
    if (!clean.tortieMask && Array.isArray(clean.tortie) && clean.tortie.length > 0) {
      const primary = clean.tortie[0] as TortieLayer | undefined;
      clean.tortieMask = primary?.mask || undefined;
      clean.tortiePattern = primary?.pattern || undefined;
      clean.tortieColour = primary?.colour || undefined;
    }
  } else {
    delete clean.tortieMask;
    delete clean.tortiePattern;
    delete clean.tortieColour;
  }

  return clean;
}

type EncodePayload = {
  params: CatShareParams;
  accessorySlots?: string[];
  scarSlots?: string[];
  tortieSlots?: (Record<string, unknown> | null)[];
  counts?: Partial<Counts>;
};

export function encodeCatShare(data: EncodePayload): string {
  if (!data || !data.params) {
    throw new Error("encodeCatShare: params are required");
  }

  const counts = sanitizeCounts(data.counts);
  const slots = {
    accessories: sanitizeStringArray(data.accessorySlots, counts.accessories),
    scars: sanitizeStringArray(data.scarSlots, counts.scars),
    tortie: sanitizeTortieArray(data.tortieSlots, counts.tortie),
  };

  const payload = {
    v: SHARE_VERSION,
    params: sanitizeParams(data.params),
    slots,
    counts: {
      accessories: slots.accessories.length,
      scars: slots.scars.length,
      tortie: slots.tortie.length,
    },
  };

  const json = JSON.stringify(payload);
  return toBase64(json);
}

type DecodedPayload = {
  params: SanitizedParams;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieLayer | null)[];
  counts: Counts;
};

export function decodeCatShare(encoded: string | null | undefined): DecodedPayload | null {
  if (!encoded) return null;

  let payload: any;
  try {
    payload = JSON.parse(fromBase64(encoded));
  } catch (error) {
    console.error("decodeCatShare: failed to parse payload", error);
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.v !== SHARE_VERSION) {
    console.warn(`decodeCatShare: unsupported version ${payload.v}`);
    return null;
  }

  return {
    params: sanitizeParams(payload.params || {}),
    accessorySlots: sanitizeStringArray(payload.slots?.accessories, payload.counts?.accessories),
    scarSlots: sanitizeStringArray(payload.slots?.scars, payload.counts?.scars),
    tortieSlots: sanitizeTortieArray(payload.slots?.tortie, payload.counts?.tortie),
    counts: sanitizeCounts(payload.counts),
  };
}
import type { Buffer } from "buffer";
