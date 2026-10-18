import { text, timestamp, uuid } from "drizzle-orm/pg-core";

/** `timestamptz` read and written as a JS Date. */
export const tstz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date", precision: 3 });

/** Random v4 primary key; imported rows use a deterministic v5 instead. */
export const primaryId = () => uuid("id").primaryKey().defaultRandom();

/**
 * PostgreSQL bookkeeping kept on every imported table: the original `_id` for
 * legacy links and idempotent imports, and `_creationTime`.
 */
export const legacyColumns = () => ({
  legacyId: text("legacy_id").unique(),
  legacyCreatedAt: tstz("legacy_created_at"),
});

export const createdUpdated = () => ({
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});
