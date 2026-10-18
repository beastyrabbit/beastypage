import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { JobKindDefinition } from "../types";

const payloadSchema = z.object({});

/** Every schema-level files FK is listed here and asserted in the job. */
export const FILE_REFERENCE_COLUMNS = [
  ["card_season", "card_back_file_id"],
  ["catdex", "default_card_file_id"],
  ["catdex", "default_card_thumb_file_id"],
  ["catdex", "custom_card_file_id"],
  ["catdex", "custom_card_thumb_file_id"],
  ["catdex_uploads", "file_id"],
  ["collection", "blur_img_file_id"],
  ["collection", "preview_img_file_id"],
  ["collection", "full_img_file_id"],
  ["cat_images", "file_id"],
  ["palette_generator_settings", "image_file_id"],
] as const;

const filesOrphanCleanup: JobKindDefinition<z.infer<typeof payloadSchema>> = {
  kind: "files.orphan-cleanup",
  payloadSchema,
  maxAttempts: 5,
  leaseMs: 5 * 60_000,
  recurringIntervalMs: 24 * 60 * 60_000,
  recurringDedupeKey: "singleton",
  recurringPayload: {},
  async handler(_payload, { db }) {
    const fkRows = await db.execute<{
      table_name: string;
      column_name: string;
    }>(sql`
      -- pg_catalog, not information_schema: the latter only lists constraints
      -- on tables the current role owns, and the app role owns none.
      select rel.relname as table_name, att.attname as column_name
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = any (con.conkey)
      where con.contype = 'f'
        and con.confrelid = 'public.files'::regclass
        and ns.nspname = 'public'
    `);
    const actual = new Set(
      fkRows.rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    const expected = new Set(
      FILE_REFERENCE_COLUMNS.map(([table, column]) => `${table}.${column}`),
    );
    if (
      actual.size !== expected.size ||
      [...expected].some((value) => !actual.has(value))
    ) {
      throw new Error(
        `files reference coverage mismatch (expected ${expected.size}, found ${actual.size})`,
      );
    }
    // The grace period protects a file uploaded immediately before a retry
    // attaches its reservation. Staged uploads remain references until their
    // retention job removes them.
    const refs = sql.join(
      FILE_REFERENCE_COLUMNS.map(([table, column]) => {
        const quotedColumn = sql.raw(`"${column}"`);
        const quotedTable = sql.raw(`"${table}"`);
        return sql`select ${quotedColumn} as file_id from ${quotedTable}`;
      }),
      sql` union all `,
    );
    const result = await db.execute(sql`
      delete from files f
      where f.created_at < now() - interval '24 hours'
        and not exists (select 1 from (${refs}) refs where refs.file_id = f.id)
    `);
    return { deleted: result.rowCount ?? 0 };
  },
};

export default filesOrphanCleanup;
