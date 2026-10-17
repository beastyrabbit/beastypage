import { createHash } from "node:crypto";
import sharp from "sharp";

/** One line of `_storage/documents.jsonl`. */
export interface StorageMeta {
  id: string;
  creationTime: number | null;
  sha256Hex: string | null;
  size: number | null;
  contentType: string | null;
}

/** Convex documents sha256 as hex; accept base64 too until #106 confirms the export encoding. */
function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    const hex = Buffer.from(value, "base64").toString("hex");
    return hex.length === 64 ? hex : null;
  }
  return null;
}

export function parseStorageMeta(document: unknown): StorageMeta | string {
  if (!document || typeof document !== "object")
    return "storage metadata is not an object";
  const record = document as Record<string, unknown>;
  if (typeof record._id !== "string" || record._id === "")
    return "storage metadata has no _id";
  const sha256Hex = normalizeSha256(record.sha256);
  if (record.sha256 !== undefined && !sha256Hex)
    return "storage sha256 is not hex or base64";
  return {
    id: record._id,
    creationTime:
      typeof record._creationTime === "number" ? record._creationTime : null,
    sha256Hex,
    size: typeof record.size === "number" ? record.size : null,
    contentType:
      typeof record.contentType === "string" ? record.contentType : null,
  };
}

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heif: "image/avif",
};

/** Raster formats only; SVG served from our origin would be an XSS vector. */
export const ALLOWED_MIME = new Set(Object.values(MIME_BY_FORMAT));

export interface InspectedFile {
  sha256Hex: string;
  byteSize: number;
  mimeType: string;
  width: number;
  height: number;
}

function normalizeMime(value: string): string {
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

async function decodeImage(bytes: Buffer): Promise<{
  mimeType?: string;
  width: number;
  height: number;
  error?: string;
}> {
  try {
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    return {
      mimeType: metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    };
  } catch (error) {
    return {
      width: 0,
      height: 0,
      error: `not a decodable image (${error instanceof Error ? error.message : "unknown"})`,
    };
  }
}

/**
 * Hashes and decodes the image header; returns problems instead of throwing.
 * A declared raster type that differs from the decoded one is corrected to the
 * decoded type and reported as a repair; any other declared type is a problem.
 */
export async function inspectFile(
  bytes: Buffer,
  meta: StorageMeta,
): Promise<
  { file: InspectedFile; repairs: string[] } | { problems: string[] }
> {
  const problems: string[] = [];
  const repairs: string[] = [];
  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  if (meta.sha256Hex && meta.sha256Hex !== sha256Hex)
    problems.push("sha256 mismatch");
  if (meta.size !== null && meta.size !== bytes.length) {
    problems.push(
      `size mismatch (metadata ${meta.size}, bytes ${bytes.length})`,
    );
  }

  const decoded = await decodeImage(bytes);
  const { mimeType, width, height } = decoded;
  if (decoded.error) problems.push(decoded.error);
  if (!mimeType) {
    problems.push("unsupported image format");
  } else if (meta.contentType && normalizeMime(meta.contentType) !== mimeType) {
    const declared = normalizeMime(meta.contentType);
    if (ALLOWED_MIME.has(declared)) {
      repairs.push(
        `content type ${declared} corrected to detected ${mimeType}`,
      );
    } else {
      problems.push(
        `content type ${meta.contentType} does not match detected ${mimeType}`,
      );
    }
  }
  if (mimeType && (width <= 0 || height <= 0))
    problems.push("image has no dimensions");

  if (problems.length > 0 || !mimeType) return { problems };
  return {
    file: { sha256Hex, byteSize: bytes.length, mimeType, width, height },
    repairs,
  };
}
