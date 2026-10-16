import "server-only";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { inspectFile } from "../../scripts/migration/import/files";
import type { Database } from "../db/pool";
import { files } from "../db/schema";
import type { Transaction } from "../db/transaction";

export interface FileMeta {
  id: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
}

export const MAX_CARD_UPLOAD_BYTES = 10 * 1024 * 1024;
export const CARD_UPLOAD_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);

export interface StoredFile {
  id: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
}

/**
 * Stores a validated raster file, deduplicating by content hash. The import
 * inspector is shared so upload and migration accept exactly the same decoded
 * formats and dimension rules.
 */
export async function storeUploadedFile(
  tx: Transaction,
  bytes: Buffer,
  contentType: string,
): Promise<StoredFile> {
  if (bytes.length === 0) throw new Error("EMPTY_UPLOAD");
  if (bytes.length > MAX_CARD_UPLOAD_BYTES) throw new Error("FILE_TOO_LARGE");
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized || !CARD_UPLOAD_CONTENT_TYPES.has(normalized)) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }

  const inspected = await inspectFile(bytes, {
    id: "upload",
    creationTime: null,
    sha256Hex: null,
    size: bytes.length,
    contentType: normalized,
  });
  if ("problems" in inspected) {
    throw new Error("INVALID_IMAGE");
  }
  if (!CARD_UPLOAD_CONTENT_TYPES.has(inspected.file.mimeType)) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await tx
    .select({
      id: files.id,
      sha256: files.sha256,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      width: files.width,
      height: files.height,
    })
    .from(files)
    .where(sql`${files.sha256} = ${sha256}`)
    .limit(1);
  if (existing) {
    return {
      id: existing.id,
      sha256: existing.sha256,
      mimeType: existing.mimeType,
      byteSize: existing.byteSize,
      width: existing.width ?? inspected.file.width,
      height: existing.height ?? inspected.file.height,
    };
  }

  const [inserted] = await tx
    .insert(files)
    .values({
      sha256,
      mimeType: inspected.file.mimeType,
      byteSize: bytes.byteLength,
      width: inspected.file.width,
      height: inspected.file.height,
      bytes,
    })
    .onConflictDoNothing({ target: files.sha256 })
    .returning({
      id: files.id,
      sha256: files.sha256,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      width: files.width,
      height: files.height,
    });
  if (inserted) {
    return {
      id: inserted.id,
      sha256: inserted.sha256,
      mimeType: inserted.mimeType,
      byteSize: inserted.byteSize,
      width: inserted.width ?? inspected.file.width,
      height: inserted.height ?? inspected.file.height,
    };
  }

  const [raced] = await tx
    .select({
      id: files.id,
      sha256: files.sha256,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      width: files.width,
      height: files.height,
    })
    .from(files)
    .where(sql`${files.sha256} = ${sha256}`)
    .limit(1);
  if (!raced) throw new Error("FILE_STORE_FAILED");
  return {
    id: raced.id,
    sha256: raced.sha256,
    mimeType: raced.mimeType,
    byteSize: raced.byteSize,
    width: raced.width ?? inspected.file.width,
    height: raced.height ?? inspected.file.height,
  };
}

/**
 * Public rows that publish a file. Convex storage URLs were public
 * capabilities for exactly these images; staged catdex uploads and orphaned
 * files are never served (ADR §7).
 */
const PUBLIC_REFERENCES = sql`
  select card_back_file_id as file_id from card_season
  union all select default_card_file_id from catdex where approved = true
  union all select default_card_thumb_file_id from catdex where approved = true
  union all select custom_card_file_id from catdex where approved = true
  union all select custom_card_thumb_file_id from catdex where approved = true
  union all select blur_img_file_id from collection
  union all select preview_img_file_id from collection
  union all select full_img_file_id from collection
  union all select file_id from cat_images
  union all select image_file_id from palette_generator_settings
`;

/** Metadata only; bytes are loaded separately so 304 responses never read them. */
export async function findServableFile(
  db: Database,
  id: string,
): Promise<FileMeta | null> {
  const result = await db.execute<{
    id: string;
    sha256: string;
    mime_type: string;
    byte_size: number;
  }>(sql`
    select f.id, f.sha256, f.mime_type, f.byte_size
    from files f
    where f.id = ${id}
      and exists (select 1 from (${PUBLIC_REFERENCES}) refs where refs.file_id = f.id)
  `);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        sha256: row.sha256,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
      }
    : null;
}

export async function readFileBytes(
  db: Database,
  id: string,
): Promise<Buffer | null> {
  const result = await db.execute<{ bytes: Buffer }>(
    sql`select bytes from files where id = ${id}`,
  );
  return result.rows[0]?.bytes ?? null;
}
