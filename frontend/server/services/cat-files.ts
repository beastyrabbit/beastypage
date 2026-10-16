import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/pool";
import { files } from "../db/schema";
import { ServiceError } from "../errors";

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

export async function storeCatDataUrl(
  db: Database,
  dataUrl: string,
  options: {
    legacyId?: string;
    width?: number | null;
    height?: number | null;
  } = {},
): Promise<StoredCatFile> {
  const { mimeType, bytes } = parseDataUrl(dataUrl);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await db
    .select({
      id: files.id,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      sha256: files.sha256,
    })
    .from(files)
    .where(eq(files.sha256, sha256))
    .limit(1);
  if (existing) return existing;
  const [inserted] = await db
    .insert(files)
    .values({
      sha256,
      mimeType,
      byteSize: bytes.length,
      width: options.width ?? null,
      height: options.height ?? null,
      bytes,
      legacyId: options.legacyId ?? null,
    })
    .onConflictDoNothing({ target: files.sha256 })
    .returning({
      id: files.id,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      sha256: files.sha256,
    });
  if (inserted) return inserted;
  const [raced] = await db
    .select({
      id: files.id,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      sha256: files.sha256,
    })
    .from(files)
    .where(and(eq(files.sha256, sha256)))
    .limit(1);
  if (!raced) throw new ServiceError("unavailable", "Failed to store image");
  return raced;
}

export function dataUrlInfo(dataUrl: string) {
  return parseDataUrl(dataUrl);
}
