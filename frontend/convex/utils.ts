import type { Id, TableNames } from "./_generated/dataModel.js";

export type AnyId = Id<TableNames>;

export function randomSlug(length: number, alphabet: string): string {
  let slug = "";
  const random = new Uint32Array(1);
  for (let i = 0; i < length; i += 1) {
    crypto.getRandomValues(random);
    slug += alphabet[random[0] % alphabet.length];
  }
  return slug;
}

export function docIdToString(id: AnyId): string {
  return id as unknown as string;
}

export function toId<TableName extends TableNames>(
  _table: TableName,
  value: string | Id<TableName>,
): Id<TableName> {
  return value as unknown as Id<TableName>;
}

export function buildFileUrl(
  collection: string,
  id: string,
  filename: string,
): string {
  return `/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
}

const STORAGE_BASE =
  process.env.CONVEX_STORAGE_ORIGIN ||
  process.env.CONVEX_SITE_ORIGIN ||
  process.env.CONVEX_SELF_HOSTED_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  null;

function resolveAgainstStorageBase(
  urlStr: string,
  storageBase: string,
): string {
  // Normalize storage base - remove trailing slash using regex
  const baseMatch = /^(.+?)\/?$/.exec(storageBase);
  const base = baseMatch ? baseMatch[1] : storageBase;

  // Escape special regex characters in base for safe regex construction
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

  // Check if URL starts with base using regex (avoiding indexOf/charAt which might trigger URL methods)
  const startsWithBase = new RegExp(`^${escapedBase}`).exec(urlStr);
  if (startsWithBase) {
    return urlStr;
  }

  // Check if URL is relative (starts with /) using regex
  const isRelative = /^\//.exec(urlStr);
  if (isRelative) {
    return base + urlStr;
  }

  // If URL is absolute but different origin, extract path manually using regex
  const absoluteMatch = /^https?:\/\/[^/]+(\/.*)$/.exec(urlStr);
  if (absoluteMatch?.[1]) {
    return base + absoluteMatch[1];
  }

  // Fallback: treat as relative
  return `${base}/${urlStr}`;
}

export function normalizeStorageUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    // Use JSON serialization to force conversion to primitive string
    // This completely avoids any URL object property access that Convex restricts
    // JSON.stringify will serialize the URL to a string, then we parse it back
    const urlStr = JSON.parse(JSON.stringify(url)) as string;

    // If we have a storage base, ensure the URL uses it
    const storageBase = STORAGE_BASE ? String(STORAGE_BASE) : null;
    if (storageBase && storageBase !== "null" && storageBase !== "undefined") {
      return resolveAgainstStorageBase(urlStr, storageBase);
    }

    // No storage base - extract path from absolute URLs, keep relative as-is
    const absoluteMatch = /^https?:\/\/[^/]+(\/.*)$/.exec(urlStr);
    if (absoluteMatch?.[1]) {
      return absoluteMatch[1];
    }

    // Check if already relative using regex
    const isRelative = /^\//.exec(urlStr);
    return isRelative ? urlStr : `/${urlStr}`;
  } catch {
    // If normalization fails (e.g., due to Convex restrictions), try direct conversion
    // This ensures the function never throws and always returns a string or null
    try {
      // Last resort: try JSON serialization which should work even for URL objects
      return JSON.parse(JSON.stringify(url)) as string;
    } catch {
      return null;
    }
  }
}
