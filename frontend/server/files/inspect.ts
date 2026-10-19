import { createHash } from "node:crypto";
import sharp from "sharp";

export interface StorageMeta {
  id: string;
  creationTime: number | null;
  sha256Hex: string | null;
  size: number | null;
  contentType: string | null;
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
 * Hashes and decodes an image header, returning validation problems instead of
 * throwing. A declared raster type that differs from the decoded one is
 * corrected to the decoded type and reported as a repair.
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
