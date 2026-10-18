import "server-only";

import { type AnyColumn, and, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { ServiceError } from "./errors";

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  creationAt: z.string().datetime({ offset: true }).optional(),
  id: z.string().uuid(),
});

export type PageCursor = z.infer<typeof cursorSchema>;

type CreationOrderedTable = {
  legacyCreatedAt: AnyColumn;
  createdAt: AnyColumn;
  id: AnyColumn;
};

/** The PostgreSQL `_creationTime` equivalent for imported and new PostgreSQL rows. */
export function creationTimestamp(table: CreationOrderedTable) {
  return sql`coalesce(${table.legacyCreatedAt}, ${table.createdAt})`;
}

/** Descending keyset predicate for PostgreSQL creation-order pagination. */
export function creationOrderBefore(
  table: CreationOrderedTable,
  cursor: PageCursor,
): SQL {
  const timestamp = creationTimestamp(table);
  const createdAt = new Date(cursor.createdAt);
  return or(
    sql`${timestamp} < ${createdAt}`,
    and(sql`${timestamp} = ${createdAt}`, sql`${table.id} < ${cursor.id}`),
  ) as SQL;
}

/** Descending keyset predicate for indexes led by the app `createdAt` field. */
export function createdAtOrderBefore(
  table: CreationOrderedTable,
  cursor: PageCursor,
): SQL {
  const createdAt = new Date(cursor.createdAt);
  const creationAt = new Date(cursor.creationAt ?? cursor.createdAt);
  const timestamp = creationTimestamp(table);
  return or(
    sql`${table.createdAt} < ${createdAt}`,
    and(
      sql`${table.createdAt} = ${createdAt}`,
      or(
        sql`${timestamp} < ${creationAt}`,
        and(sql`${timestamp} = ${creationAt}`, sql`${table.id} < ${cursor.id}`),
      ),
    ),
  ) as SQL;
}

export function rowCreationTimestamp(row: {
  legacyCreatedAt: Date | null;
  createdAt: Date;
}) {
  return row.legacyCreatedAt ?? row.createdAt;
}

export function encodeCursor(cursor: {
  createdAt: Date | string;
  creationAt?: Date | string;
  id: string;
}): string {
  const parsed = cursorSchema.safeParse({
    createdAt:
      cursor.createdAt instanceof Date
        ? cursor.createdAt.toISOString()
        : cursor.createdAt,
    creationAt:
      cursor.creationAt instanceof Date
        ? cursor.creationAt.toISOString()
        : cursor.creationAt,
    id: cursor.id,
  });
  if (!parsed.success) {
    throw new ServiceError("invalid_input", "Invalid pagination cursor");
  }
  return Buffer.from(JSON.stringify(parsed.data), "utf8").toString("base64url");
}

export function decodeCursor(
  value: string | null | undefined,
): PageCursor | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(decoded));
    if (!parsed.success) throw new Error("invalid cursor");
    return parsed.data;
  } catch {
    throw new ServiceError("invalid_input", "Invalid pagination cursor");
  }
}

export function clampPageSize(
  value: unknown,
  options: { defaultSize?: number; maxSize?: number } = {},
): number {
  const defaultSize = options.defaultSize ?? 20;
  const maxSize = options.maxSize ?? 100;
  if (!Number.isInteger(defaultSize) || defaultSize < 1) {
    throw new Error("defaultSize must be a positive integer");
  }
  if (!Number.isInteger(maxSize) || maxSize < defaultSize) {
    throw new Error("maxSize must be an integer at least defaultSize");
  }
  if (value === undefined || value === null || value === "") return defaultSize;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ServiceError("invalid_input", "Invalid page size");
  }
  return Math.max(1, Math.min(maxSize, Math.floor(parsed)));
}

/** Drizzle predicate for descending keyset pages ordered by created_at, id. */
export function createdAtIdBefore<
  T extends { createdAt: AnyColumn; id: AnyColumn },
>(table: T, cursor: PageCursor): SQL {
  return sql`(${table.createdAt}, ${table.id}) < (${new Date(cursor.createdAt)}, ${cursor.id})`;
}
