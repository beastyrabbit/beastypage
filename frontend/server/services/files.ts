import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "../db/pool";

export interface FileMeta {
  id: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
}

/**
 * Public rows that publish a file. Convex storage URLs were public
 * capabilities for exactly these images; staged catdex uploads and orphaned
 * files are never served (ADR §7).
 */
const PUBLIC_REFERENCES = sql`
  select card_back_file_id as file_id from card_season
  union all select default_card_file_id from catdex
  union all select default_card_thumb_file_id from catdex
  union all select custom_card_file_id from catdex
  union all select custom_card_thumb_file_id from catdex
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
