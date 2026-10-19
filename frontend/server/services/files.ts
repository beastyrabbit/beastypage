import "server-only";

import { sql } from "drizzle-orm";
import type { Database } from "../db/pool";
import { files } from "../db/schema";
import type { Transaction } from "../db/transaction";
import { inspectFile } from "../files/inspect";

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

const STORED_FILE_COLUMNS = {
  id: files.id,
  sha256: files.sha256,
  mimeType: files.mimeType,
  byteSize: files.byteSize,
  width: files.width,
  height: files.height,
};

export interface StoreFileOptions {
  maxBytes: number;
  /** Allowed decoded types; the declared type is only a hint. */
  allowedTypes: ReadonlySet<string>;
  legacyId?: string | null;
}

/**
 * Decodes and stores a raster file, deduplicating by content hash. The import
 * inspector is shared so uploads, generated images and the migration accept
 * exactly the same formats and record the detected type, never the declared
 * one. Rejections throw `Error` with one of EMPTY_UPLOAD, FILE_TOO_LARGE,
 * UNSUPPORTED_MEDIA_TYPE or INVALID_IMAGE as the message.
 */
export async function storeFile(
  db: Database,
  bytes: Buffer,
  declaredType: string,
  options: StoreFileOptions,
): Promise<StoredFile> {
  if (bytes.length === 0) throw new Error("EMPTY_UPLOAD");
  if (bytes.length > options.maxBytes) throw new Error("FILE_TOO_LARGE");

  const inspected = await inspectFile(bytes, {
    id: "upload",
    creationTime: null,
    sha256Hex: null,
    size: bytes.length,
    contentType: declaredType,
  });
  if ("problems" in inspected) throw new Error("INVALID_IMAGE");
  if (!options.allowedTypes.has(inspected.file.mimeType)) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }

  const { sha256Hex: sha256, mimeType, width, height } = inspected.file;
  const findExisting = async () => {
    const [row] = await db
      .select(STORED_FILE_COLUMNS)
      .from(files)
      .where(sql`${files.sha256} = ${sha256}`)
      .limit(1);
    return row;
  };
  const withSize = (row: StoredRow): StoredFile => ({
    id: row.id,
    sha256: row.sha256,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width ?? width,
    height: row.height ?? height,
  });

  const existing = await findExisting();
  if (existing) return withSize(existing);
  const [inserted] = await db
    .insert(files)
    .values({
      sha256,
      mimeType,
      byteSize: bytes.byteLength,
      width,
      height,
      bytes,
      legacyId: options.legacyId ?? null,
    })
    .onConflictDoNothing({ target: files.sha256 })
    .returning(STORED_FILE_COLUMNS);
  if (inserted) return withSize(inserted);
  const raced = await findExisting();
  if (!raced) throw new Error("FILE_STORE_FAILED");
  return withSize(raced);
}

type StoredRow = Omit<StoredFile, "width" | "height"> & {
  width: number | null;
  height: number | null;
};

/** Catdex card uploads: the declared type must already be PNG or JPEG. */
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
  return storeFile(tx, bytes, normalized, {
    maxBytes: MAX_CARD_UPLOAD_BYTES,
    allowedTypes: CARD_UPLOAD_CONTENT_TYPES,
  });
}

/**
 * Public rows that publish a file. PostgreSQL storage URLs were public
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
