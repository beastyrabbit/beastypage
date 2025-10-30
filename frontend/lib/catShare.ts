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

export type TortieLayer = {
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

export type CatShareCounts = {
  accessories: number;
  scars: number;
  tortie: number;
};

type CatShareParams = Record<string, unknown>;

type SanitizedParams = Record<string, unknown>;

function sanitizeCounts(counts?: Partial<CatShareCounts>): CatShareCounts {
  return {
    accessories: Number.isFinite(counts?.accessories) ? Math.max(0, Math.trunc(counts!.accessories!)) : 0,
    scars: Number.isFinite(counts?.scars) ? Math.max(0, Math.trunc(counts!.scars!)) : 0,
    tortie: Number.isFinite(counts?.tortie) ? Math.max(0, Math.trunc(counts!.tortie!)) : 0,
  };
}

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

export type CatShareStoredPayload = {
  v: number;
  params: SanitizedParams;
  slots: {
    accessories: string[];
    scars: string[];
    tortie: (TortieLayer | null)[];
  };
  counts: CatShareCounts;
};

export type CatSharePayload = {
  params: SanitizedParams;
  accessorySlots: string[];
  scarSlots: string[];
  tortieSlots: (TortieLayer | null)[];
  counts: CatShareCounts;
};

type EncodePayload = {
  params: CatShareParams;
  accessorySlots?: string[];
  scarSlots?: string[];
  tortieSlots?: (Record<string, unknown> | null)[];
  counts?: Partial<CatShareCounts>;
};

export function prepareCatShare(data: EncodePayload): CatShareStoredPayload {
  if (!data || !data.params) {
    throw new Error("encodeCatShare: params are required");
  }

  const counts = sanitizeCounts(data.counts);
  const slots = {
    accessories: sanitizeStringArray(data.accessorySlots, counts.accessories),
    scars: sanitizeStringArray(data.scarSlots, counts.scars),
    tortie: sanitizeTortieArray(data.tortieSlots, counts.tortie),
  };

  return {
    v: SHARE_VERSION,
    params: sanitizeParams(data.params),
    slots,
    counts: {
      accessories: slots.accessories.length,
      scars: slots.scars.length,
      tortie: slots.tortie.length,
    },
  };
}

export type CreateCatShareResult = {
  slug: string;
  id?: string | null;
  payload: CatShareStoredPayload;
};

type CreateCatShareOptions = {
  slug?: string;
};

export async function createCatShare(data: EncodePayload, options?: CreateCatShareOptions): Promise<CreateCatShareResult | null> {
  if (typeof fetch !== "function") {
    console.warn("createCatShare: fetch is unavailable in this environment");
    return null;
  }

  try {
    const payload = prepareCatShare(data);
    const response = await fetch("/api/cat-share", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        slug: options?.slug,
        data: payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`createCatShare: unexpected status ${response.status}`);
    }

    const json = (await response.json()) as { slug?: string; id?: string | null };
    const slug = json?.slug;
    if (!slug) {
      throw new Error("createCatShare: response missing slug");
    }

    return {
      slug,
      id: json?.id ?? null,
      payload,
    };
  } catch (error) {
    console.error("Failed to create cat share", error);
    return null;
  }
}

function normalizeStoredPayload(payload: any): CatSharePayload | null {
  if (!payload || typeof payload !== "object") return null;
  if (payload.v !== SHARE_VERSION) return null;
  return {
    params: sanitizeParams(payload.params || {}),
    accessorySlots: sanitizeStringArray(payload.slots?.accessories, payload.counts?.accessories),
    scarSlots: sanitizeStringArray(payload.slots?.scars, payload.counts?.scars),
    tortieSlots: sanitizeTortieArray(payload.slots?.tortie, payload.counts?.tortie),
    counts: sanitizeCounts(payload.counts),
  };
}

export function encodeCatShare(data: EncodePayload): string {
  const payload = prepareCatShare(data);
  return toBase64(JSON.stringify(payload));
}

function decodeLegacyCatShare(encoded: string): CatSharePayload | null {
  try {
    const payload = JSON.parse(fromBase64(encoded));
    return normalizeStoredPayload(payload);
  } catch (error) {
    console.error("decodeCatShare: failed to parse payload", error);
    return null;
  }
}

function isLikelySlug(value: string): boolean {
  if (!value) return false;
  if (value.length < 4 || value.length > 12) return false;
  if (/[^0-9A-Za-z]/.test(value)) return false;
  return !value.includes("=");
}

async function fetchShareBySlug(slug: string): Promise<CatSharePayload | null> {
  try {
    const response = await fetch(`/api/cat-share?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const json = await response.json();
    return normalizeStoredPayload(json?.data ?? json);
  } catch (error) {
    console.error("Failed to fetch cat share", error);
    return null;
  }
}

export async function decodeCatShare(value: string | null | undefined): Promise<CatSharePayload | null> {
  if (!value) return null;
  if (isLikelySlug(value)) {
    return fetchShareBySlug(value);
  }
  return decodeLegacyCatShare(value);
}

export async function resolveCatShareValue(value: string | null | undefined): Promise<CatSharePayload | null> {
  return decodeCatShare(value);
}

export { sanitizeCounts }; // exported for tests if needed
