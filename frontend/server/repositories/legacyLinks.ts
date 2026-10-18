import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "../db/pool";
import { adoptionBatch, catProfile, streamSessions } from "../db/schema";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Public links contain a slug, an old PostgreSQL `_id`, or a new UUID. Lookup
 * order matches the PostgreSQL `slugOrId` queries: slug first, then id.
 */
export async function findCatProfileByLink(db: Database, slugOrId: string) {
  const [bySlug] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.slug, slugOrId))
    .limit(1);
  if (bySlug) return bySlug;
  const [byLegacy] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.legacyId, slugOrId))
    .limit(1);
  if (byLegacy) return byLegacy;
  if (!isUuid(slugOrId)) return null;
  const [byId] = await db
    .select()
    .from(catProfile)
    .where(eq(catProfile.id, slugOrId))
    .limit(1);
  return byId ?? null;
}

export async function findAdoptionBatchByLink(db: Database, slugOrId: string) {
  const [bySlug] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.slug, slugOrId))
    .limit(1);
  if (bySlug) return bySlug;
  const [byLegacy] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.legacyId, slugOrId))
    .limit(1);
  if (byLegacy) return byLegacy;
  if (!isUuid(slugOrId)) return null;
  const [byId] = await db
    .select()
    .from(adoptionBatch)
    .where(eq(adoptionBatch.id, slugOrId))
    .limit(1);
  return byId ?? null;
}

/** Host links carry the session id; callers still apply the owner check. */
export async function findStreamSessionByLink(db: Database, id: string) {
  const [byLegacy] = await db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.legacyId, id))
    .limit(1);
  if (byLegacy) return byLegacy;
  if (!isUuid(id)) return null;
  const [byId] = await db
    .select()
    .from(streamSessions)
    .where(eq(streamSessions.id, id))
    .limit(1);
  return byId ?? null;
}
