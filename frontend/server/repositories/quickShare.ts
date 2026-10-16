import "server-only";

import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import {
  quickShareBans,
  quickShareJobs,
  quickShareParts,
  quickShareUploads,
  quickShareUsage,
} from "../db/schema";
import type { Transaction } from "../db/transaction";

export type UploadRow = typeof quickShareUploads.$inferSelect;
export type PartRow = typeof quickShareParts.$inferSelect;
export type JobRow = typeof quickShareJobs.$inferSelect;
export type UsageRow = typeof quickShareUsage.$inferSelect;
export type BanRow = typeof quickShareBans.$inferSelect;

export async function getUpload(
  tx: Transaction,
  id: string,
  lock = false,
): Promise<UploadRow | null> {
  let query = tx
    .select()
    .from(quickShareUploads)
    .where(eq(quickShareUploads.id, id))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function getParts(
  tx: Transaction,
  uploadId: string,
): Promise<PartRow[]> {
  return tx
    .select()
    .from(quickShareParts)
    .where(eq(quickShareParts.uploadId, uploadId))
    .orderBy(asc(quickShareParts.partNumber))
    .limit(200);
}

export async function findUploadsBySlug(
  tx: Transaction,
  slug: string,
  limit = 100,
  lock = false,
): Promise<UploadRow[]> {
  let query = tx
    .select()
    .from(quickShareUploads)
    .where(eq(quickShareUploads.slug, slug))
    .orderBy(desc(quickShareUploads.createdAt))
    .limit(limit);
  if (lock) query = query.for("update") as typeof query;
  return query;
}

export async function findActiveRetainedUploadsBySlug(
  tx: Transaction,
  slug: string,
  now: Date,
  limit = 101,
  lock = false,
): Promise<UploadRow[]> {
  let query = tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.slug, slug),
        eq(quickShareUploads.active, true),
        gt(quickShareUploads.retainedUntil, now),
      ),
    )
    .orderBy(asc(quickShareUploads.retainedUntil), asc(quickShareUploads.id))
    .limit(limit);
  if (lock) query = query.for("update") as typeof query;
  return query;
}

export async function findFirstUploadBySlug(
  tx: Transaction,
  slug: string,
): Promise<UploadRow | null> {
  const [row] = await tx
    .select()
    .from(quickShareUploads)
    .where(eq(quickShareUploads.slug, slug))
    .orderBy(asc(quickShareUploads.createdAt), asc(quickShareUploads.id))
    .limit(1);
  return row ?? null;
}

export async function findPublicCollectionUploads(
  tx: Transaction,
  slug: string,
  now: Date,
  limit = 100,
): Promise<UploadRow[]> {
  return tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.slug, slug),
        eq(quickShareUploads.active, true),
        eq(quickShareUploads.state, "ready"),
        gt(quickShareUploads.publicExpiresAt, now),
      ),
    )
    .orderBy(desc(quickShareUploads.createdAt), desc(quickShareUploads.id))
    .limit(limit);
}

export async function findUploadsByReceipt(
  tx: Transaction,
  receiptHash: string,
  limit = 101,
): Promise<UploadRow[]> {
  return tx
    .select()
    .from(quickShareUploads)
    .where(eq(quickShareUploads.receiptHash, receiptHash))
    .limit(limit);
}

export async function findActiveByRateIdentity(
  tx: Transaction,
  identity: string,
  limit: number,
  lock = false,
): Promise<UploadRow[]> {
  let query = tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.rateIdentity, identity),
        eq(quickShareUploads.active, true),
      ),
    )
    .limit(limit);
  if (lock) query = query.for("update") as typeof query;
  return query;
}

export async function findActiveBan(
  tx: Transaction,
  ipHash: string,
  lock = false,
): Promise<BanRow | null> {
  let query = tx
    .select()
    .from(quickShareBans)
    .where(
      and(eq(quickShareBans.ipHash, ipHash), eq(quickShareBans.active, true)),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function getUsage(
  tx: Transaction,
  identity: string,
  kind: "hour" | "day",
  windowStart: Date,
  lock = false,
): Promise<UsageRow | null> {
  let query = tx
    .select()
    .from(quickShareUsage)
    .where(
      and(
        eq(quickShareUsage.identity, identity),
        eq(quickShareUsage.kind, kind),
        eq(quickShareUsage.windowStart, windowStart),
      ),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function insertUsage(
  tx: Transaction,
  values: typeof quickShareUsage.$inferInsert,
) {
  const [row] = await tx.insert(quickShareUsage).values(values).returning();
  return row;
}

export async function updateUsage(
  tx: Transaction,
  id: string,
  values: Partial<typeof quickShareUsage.$inferInsert>,
) {
  const [row] = await tx
    .update(quickShareUsage)
    .set(values)
    .where(eq(quickShareUsage.id, id))
    .returning();
  return row ?? null;
}

export async function insertUpload(
  tx: Transaction,
  values: typeof quickShareUploads.$inferInsert,
) {
  const [row] = await tx.insert(quickShareUploads).values(values).returning();
  return row;
}

export async function updateUpload(
  tx: Transaction,
  id: string,
  values: Partial<typeof quickShareUploads.$inferInsert>,
) {
  const [row] = await tx
    .update(quickShareUploads)
    .set(values)
    .where(eq(quickShareUploads.id, id))
    .returning();
  return row ?? null;
}

export async function upsertPart(
  tx: Transaction,
  values: {
    uploadId: string;
    partNumber: number;
    etag: string;
    size: number;
    createdAt: Date;
  },
) {
  const [row] = await tx
    .insert(quickShareParts)
    .values(values)
    .onConflictDoUpdate({
      target: [quickShareParts.uploadId, quickShareParts.partNumber],
      set: {
        etag: values.etag,
        size: values.size,
        createdAt: values.createdAt,
      },
    })
    .returning();
  return row;
}

export async function getJob(
  tx: Transaction,
  id: string,
  lock = false,
): Promise<JobRow | null> {
  let query = tx
    .select()
    .from(quickShareJobs)
    .where(eq(quickShareJobs.id, id))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function getJobForUploadKind(
  tx: Transaction,
  uploadId: string,
  kind: "process" | "delete",
  lock = false,
): Promise<JobRow | null> {
  let query = tx
    .select()
    .from(quickShareJobs)
    .where(
      and(eq(quickShareJobs.uploadId, uploadId), eq(quickShareJobs.kind, kind)),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function insertJob(
  tx: Transaction,
  values: typeof quickShareJobs.$inferInsert,
) {
  const [row] = await tx
    .insert(quickShareJobs)
    .values(values)
    .onConflictDoNothing({
      target: [quickShareJobs.uploadId, quickShareJobs.kind],
    })
    .returning();
  return row ?? null;
}

export async function updateJob(
  tx: Transaction,
  id: string,
  values: Partial<typeof quickShareJobs.$inferInsert>,
) {
  const [row] = await tx
    .update(quickShareJobs)
    .set(values)
    .where(eq(quickShareJobs.id, id))
    .returning();
  return row ?? null;
}

export async function listPendingJobs(
  tx: Transaction,
  limit = 25,
): Promise<JobRow[]> {
  return tx
    .select()
    .from(quickShareJobs)
    .where(eq(quickShareJobs.status, "pending"))
    .orderBy(asc(quickShareJobs.createdAt), asc(quickShareJobs.id))
    .limit(limit);
}

export async function listExpiredLeases(
  tx: Transaction,
  now: Date,
  limit = 50,
): Promise<JobRow[]> {
  return tx
    .select()
    .from(quickShareJobs)
    .where(
      and(
        eq(quickShareJobs.status, "leased"),
        lte(quickShareJobs.leaseExpiresAt, now),
      ),
    )
    .orderBy(asc(quickShareJobs.updatedAt))
    .limit(limit);
}

export async function listExpiredUploads(
  tx: Transaction,
  now: Date,
  limit = 50,
): Promise<UploadRow[]> {
  return tx
    .select()
    .from(quickShareUploads)
    .where(lte(quickShareUploads.retainedUntil, now))
    .orderBy(asc(quickShareUploads.retainedUntil))
    .limit(limit);
}

export async function listAbandonedUploads(
  tx: Transaction,
  cutoff: Date,
  limit = 50,
): Promise<UploadRow[]> {
  return tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.state, "uploading"),
        lte(quickShareUploads.updatedAt, cutoff),
      ),
    )
    .orderBy(asc(quickShareUploads.updatedAt))
    .limit(limit);
}

export async function listExpiredPublicUploads(
  tx: Transaction,
  now: Date,
  limit = 50,
): Promise<UploadRow[]> {
  return tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.active, true),
        lte(quickShareUploads.publicExpiresAt, now),
      ),
    )
    .orderBy(asc(quickShareUploads.publicExpiresAt))
    .limit(limit);
}

export async function listExpiredUsage(
  tx: Transaction,
  now: Date,
  limit = 100,
): Promise<UsageRow[]> {
  return tx
    .select()
    .from(quickShareUsage)
    .where(lte(quickShareUsage.expiresAt, now))
    .limit(limit);
}

export async function listExpiredBanRawIps(
  tx: Transaction,
  now: Date,
  limit = 100,
): Promise<BanRow[]> {
  return tx
    .select()
    .from(quickShareBans)
    .where(
      and(
        eq(quickShareBans.active, true),
        gt(quickShareBans.rawIpExpiresAt, new Date(0)),
        lte(quickShareBans.rawIpExpiresAt, now),
      ),
    )
    .limit(limit);
}

export async function listUploadsByIp(
  tx: Transaction,
  ipHash: string,
  limit = 100,
  lock = false,
): Promise<UploadRow[]> {
  let query = tx
    .select()
    .from(quickShareUploads)
    .where(eq(quickShareUploads.ipHash, ipHash))
    .orderBy(desc(quickShareUploads.createdAt))
    .limit(limit);
  if (lock) query = query.for("update") as typeof query;
  return query;
}

export async function listActiveUploadsByIp(
  tx: Transaction,
  ipHash: string,
  limit = 50,
  lock = false,
): Promise<UploadRow[]> {
  let query = tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.ipHash, ipHash),
        eq(quickShareUploads.active, true),
      ),
    )
    .orderBy(asc(quickShareUploads.createdAt))
    .limit(limit);
  if (lock) query = query.for("update") as typeof query;
  return query;
}

export async function listUploadsByOwner(
  tx: Transaction,
  owner: string,
  now: Date,
): Promise<UploadRow[]> {
  return tx
    .select()
    .from(quickShareUploads)
    .where(
      and(
        eq(quickShareUploads.ownerTokenIdentifier, owner),
        gt(quickShareUploads.publicExpiresAt, now),
        eq(quickShareUploads.active, true),
      ),
    )
    .orderBy(
      desc(quickShareUploads.publicExpiresAt),
      desc(quickShareUploads.createdAt),
    )
    .limit(100);
}

export async function listAdminUploads(
  tx: Transaction,
  slug?: string,
  ipHash?: string,
  now = new Date(),
): Promise<UploadRow[]> {
  if (slug) {
    const active = await tx
      .select()
      .from(quickShareUploads)
      .where(
        and(
          eq(quickShareUploads.slug, slug),
          eq(quickShareUploads.active, true),
          gt(quickShareUploads.retainedUntil, now),
        ),
      )
      .orderBy(asc(quickShareUploads.retainedUntil), asc(quickShareUploads.id))
      .limit(100);
    const historical = await tx
      .select()
      .from(quickShareUploads)
      .where(eq(quickShareUploads.slug, slug))
      .orderBy(asc(quickShareUploads.createdAt), asc(quickShareUploads.id))
      .limit(100);
    const seen = new Set(active.map((row) => row.id));
    return [...active, ...historical.filter((row) => !seen.has(row.id))].slice(
      0,
      100,
    );
  }
  if (ipHash) return listUploadsByIp(tx, ipHash, 100);
  return tx
    .select()
    .from(quickShareUploads)
    .orderBy(desc(quickShareUploads.retainedUntil))
    .limit(100);
}

export async function listJobsForUpload(
  tx: Transaction,
  uploadId: string,
  kind?: "process" | "delete",
) {
  return tx
    .select()
    .from(quickShareJobs)
    .where(
      and(
        eq(quickShareJobs.uploadId, uploadId),
        kind ? eq(quickShareJobs.kind, kind) : sql`true`,
      ),
    )
    .limit(20);
}

export async function deleteParts(tx: Transaction, uploadId: string) {
  await tx
    .delete(quickShareParts)
    .where(eq(quickShareParts.uploadId, uploadId));
}

export async function deleteJobs(
  tx: Transaction,
  uploadId: string,
  exceptId?: string,
) {
  await tx
    .delete(quickShareJobs)
    .where(
      and(
        eq(quickShareJobs.uploadId, uploadId),
        exceptId ? sql`${quickShareJobs.id} <> ${exceptId}` : sql`true`,
      ),
    );
}

export async function deleteJob(tx: Transaction, id: string) {
  await tx.delete(quickShareJobs).where(eq(quickShareJobs.id, id));
}

export async function deleteUpload(tx: Transaction, id: string) {
  await tx.delete(quickShareUploads).where(eq(quickShareUploads.id, id));
}

export async function updateBan(
  tx: Transaction,
  id: string,
  values: Partial<typeof quickShareBans.$inferInsert>,
) {
  const [row] = await tx
    .update(quickShareBans)
    .set(values)
    .where(eq(quickShareBans.id, id))
    .returning();
  return row ?? null;
}

export async function insertBan(
  tx: Transaction,
  values: typeof quickShareBans.$inferInsert,
) {
  const [row] = await tx
    .insert(quickShareBans)
    .values(values)
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function deleteUsage(tx: Transaction, id: string) {
  await tx.delete(quickShareUsage).where(eq(quickShareUsage.id, id));
}

export async function findByState(
  tx: Transaction,
  state: UploadRow["state"],
  limit = 50,
) {
  return tx
    .select()
    .from(quickShareUploads)
    .where(eq(quickShareUploads.state, state))
    .limit(limit);
}
