import "server-only";

import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { z } from "zod";
import { ServiceError } from "./errors";

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export type PageCursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: {
  createdAt: Date | string;
  id: string;
}): string {
  const parsed = cursorSchema.safeParse({
    createdAt:
      cursor.createdAt instanceof Date
        ? cursor.createdAt.toISOString()
        : cursor.createdAt,
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

export const keysetBefore = createdAtIdBefore;
