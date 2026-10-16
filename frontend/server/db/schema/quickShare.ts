import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdUpdated, legacyColumns, primaryId, tstz } from "./columns";

/**
 * Quick Share metadata. The bytes stay in the media service's S3 bucket;
 * `original_key`/`public_key` point there.
 */
export const quickShareUploads = pgTable(
  "quick_share_uploads",
  {
    id: primaryId(),
    ...legacyColumns(),
    slug: text("slug").notNull(),
    source: text("source", { enum: ["file", "url"] }).notNull(),
    originalName: text("original_name").notNull(),
    declaredMime: text("declared_mime"),
    detectedMime: text("detected_mime"),
    originalSize: bigint("original_size", { mode: "number" }).notNull(),
    originalKey: text("original_key").notNull(),
    multipartUploadId: text("multipart_upload_id"),
    publicKey: text("public_key"),
    publicMime: text("public_mime"),
    publicSize: bigint("public_size", { mode: "number" }),
    importReservedBytes: bigint("import_reserved_bytes", { mode: "number" }),
    state: text("state", {
      enum: [
        "uploading",
        "processing",
        "ready",
        "unsupported",
        "failed",
        "removed",
      ],
    }).notNull(),
    receiptHash: text("receipt_hash").notNull(),
    ownerTokenIdentifier: text("owner_token_identifier"),
    rateIdentity: text("rate_identity").notNull(),
    ipHash: text("ip_hash").notNull(),
    rawIp: text("raw_ip").notNull(),
    publicExpiresAt: tstz("public_expires_at").notNull(),
    retainedUntil: tstz("retained_until").notNull(),
    active: boolean("active").notNull(),
    extendedAt: tstz("extended_at"),
    completedAt: tstz("completed_at"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    compatibilityWarning: text("compatibility_warning"),
    ...createdUpdated(),
  },
  (t) => [
    // Not unique: every item of a collection shares the collection's slug.
    index("quick_share_uploads_slug_active_retained_idx").on(
      t.slug,
      t.active,
      t.retainedUntil,
    ),
    index("quick_share_uploads_slug_active_state_expires_idx").on(
      t.slug,
      t.active,
      t.state,
      t.publicExpiresAt,
    ),
    index("quick_share_uploads_receipt_idx").on(t.receiptHash),
    index("quick_share_uploads_owner_expires_idx").on(
      t.ownerTokenIdentifier,
      t.publicExpiresAt,
    ),
    index("quick_share_uploads_rate_active_idx").on(t.rateIdentity, t.active),
    index("quick_share_uploads_ip_active_idx").on(t.ipHash, t.active),
    index("quick_share_uploads_ip_created_idx").on(t.ipHash, t.createdAt),
    index("quick_share_uploads_state_created_idx").on(t.state, t.createdAt),
    index("quick_share_uploads_state_updated_idx").on(t.state, t.updatedAt),
    index("quick_share_uploads_active_expires_idx").on(
      t.active,
      t.publicExpiresAt,
    ),
    index("quick_share_uploads_retained_idx").on(t.retainedUntil),
  ],
);

const uploadRef = () =>
  uuid("upload_id")
    .notNull()
    .references(() => quickShareUploads.id, { onDelete: "cascade" });

/** In-flight multipart parts; imported only for uploads still `uploading`. */
export const quickShareParts = pgTable(
  "quick_share_parts",
  {
    id: primaryId(),
    ...legacyColumns(),
    uploadId: uploadRef(),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quick_share_parts_upload_part_key").on(
      t.uploadId,
      t.partNumber,
    ),
  ],
);

/** Media-worker queue. Leased jobs are returned to pending at import. */
export const quickShareJobs = pgTable(
  "quick_share_jobs",
  {
    id: primaryId(),
    ...legacyColumns(),
    uploadId: uploadRef(),
    kind: text("kind", { enum: ["process", "delete"] }).notNull(),
    status: text("status", { enum: ["pending", "leased", "done"] }).notNull(),
    attempts: integer("attempts").notNull(),
    leaseId: text("lease_id"),
    leaseExpiresAt: tstz("lease_expires_at"),
    ...createdUpdated(),
  },
  (t) => [
    index("quick_share_jobs_status_created_idx").on(t.status, t.createdAt),
    uniqueIndex("quick_share_jobs_upload_kind_key").on(t.uploadId, t.kind),
  ],
);

/** Rate-limit windows; only windows still open at the freeze are imported. */
export const quickShareUsage = pgTable(
  "quick_share_usage",
  {
    id: primaryId(),
    ...legacyColumns(),
    identity: text("identity").notNull(),
    kind: text("kind", { enum: ["hour", "day"] }).notNull(),
    windowStart: tstz("window_start").notNull(),
    starts: integer("starts").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    expiresAt: tstz("expires_at").notNull(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quick_share_usage_window_key").on(
      t.identity,
      t.kind,
      t.windowStart,
    ),
    index("quick_share_usage_expires_idx").on(t.expiresAt),
  ],
);

export const quickShareBans = pgTable(
  "quick_share_bans",
  {
    id: primaryId(),
    ...legacyColumns(),
    ipHash: text("ip_hash").notNull(),
    rawIp: text("raw_ip"),
    rawIpExpiresAt: tstz("raw_ip_expires_at"),
    reason: text("reason"),
    active: boolean("active").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    removedAt: tstz("removed_at"),
  },
  (t) => [
    uniqueIndex("quick_share_bans_active_ip_key")
      .on(t.ipHash)
      .where(sql`${t.active}`),
    index("quick_share_bans_ip_active_idx").on(t.ipHash, t.active),
    index("quick_share_bans_active_created_idx").on(t.active, t.createdAt),
    index("quick_share_bans_active_raw_ip_expires_idx").on(
      t.active,
      t.rawIpExpiresAt,
    ),
  ],
);
