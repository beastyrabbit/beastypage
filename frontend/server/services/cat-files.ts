import "server-only";
import type { Database } from "../db/pool";
import { ServiceError } from "../errors";
import { storeFile } from "./files";

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export interface StoredCatFile {
  id: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

function parseDataUrl(value: string): { mimeType: string; bytes: Buffer } {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!match)
    throw new ServiceError("invalid_input", "Invalid data URL payload");
  const mimeType = match[1].toLowerCase();
  if (!MIME_TYPES.has(mimeType)) {
    throw new ServiceError(
      "invalid_input",
      "Only raster image data URLs are accepted",
    );
  }
  const base64 = match[2].replace(/\s+/g, "");
  if (
    !base64 ||
    base64.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    throw new ServiceError("invalid_input", "Invalid image payload");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
    throw new ServiceError("invalid_input", "Image payload is too large");
  }
  return { mimeType, bytes };
}

/** Stores a generated image from a data URL; the decoded type is recorded. */
export async function storeCatDataUrl(
  db: Database,
  dataUrl: string,
  options: { legacyId?: string } = {},
): Promise<StoredCatFile> {
  const { mimeType, bytes } = parseDataUrl(dataUrl);
  try {
    const {
      id,
      sha256,
      byteSize,
      mimeType: stored,
    } = await storeFile(db, bytes, mimeType, {
      maxBytes: MAX_FILE_BYTES,
      allowedTypes: MIME_TYPES,
      legacyId: options.legacyId,
    });
    return { id, sha256, byteSize, mimeType: stored };
  } catch (error) {
    if (error instanceof Error && error.message === "FILE_STORE_FAILED")
      throw new ServiceError("unavailable", "Failed to store image");
    throw new ServiceError("invalid_input", "Invalid image payload");
  }
}

export function dataUrlInfo(dataUrl: string) {
  return parseDataUrl(dataUrl);
}
