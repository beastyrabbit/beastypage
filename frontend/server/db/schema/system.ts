import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { legacyColumns, primaryId, tstz } from "./columns";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Single row written by scripts/db/migrate.ts; read by the startup compatibility check. */
export const schemaVersion = pgTable(
  "beastypage_schema_version",
  {
    id: smallint("id").primaryKey().default(1),
    version: integer("version").notNull(),
    compatibleFrom: integer("compatible_from").notNull(),
    appVersion: text("app_version").notNull(),
    appliedAt: tstz("applied_at").notNull().defaultNow(),
  },
  (t) => [check("beastypage_schema_version_singleton", sql`${t.id} = 1`)],
);

/**
 * Image bytes formerly in PostgreSQL file storage. Deduplicated by SHA-256;
 * normal queries never select `bytes`.
 */
export const files = pgTable(
  "files",
  {
    id: primaryId(),
    ...legacyColumns(),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: bytea("bytes").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("files_sha256_key").on(t.sha256),
    check(
      "files_byte_size_matches",
      sql`${t.byteSize} = octet_length(${t.bytes})`,
    ),
    check("files_sha256_format", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

/**
 * Durable change sequence for live topics. NOTIFY only wakes listeners; a
 * replica that missed notifications replays from its last seen id.
 */
export const liveEvents = pgTable(
  "live_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    topic: text("topic").notNull(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("live_events_topic_id_idx").on(t.topic, t.id),
    index("live_events_created_at_idx").on(t.createdAt),
  ],
);

/** Replaces PostgreSQL `ctx.scheduler` calls and cron jobs. */
export const jobs = pgTable(
  "jobs",
  {
    id: primaryId(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status", { enum: ["pending", "running", "done", "dead"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    runAfter: tstz("run_after").notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: tstz("lease_expires_at"),
    lastError: text("last_error"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // One unfinished job per (kind, dedupe_key): singletons and per-entity work.
    uniqueIndex("jobs_active_dedupe_key")
      .on(t.kind, t.dedupeKey)
      .where(
        sql`${t.status} in ('pending', 'running') and ${t.dedupeKey} is not null`,
      ),
    index("jobs_due_idx").on(t.runAfter).where(sql`${t.status} = 'pending'`),
    index("jobs_lease_idx")
      .on(t.leaseExpiresAt)
      .where(sql`${t.status} = 'running'`),
    index("jobs_dead_idx").on(t.updatedAt).where(sql`${t.status} = 'dead'`),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobId: text("job_id").notNull(),
    kind: text("kind").notNull(),
    outcome: text("outcome", { enum: ["done", "retry", "dead"] }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("job_runs_kind_created_idx").on(t.kind, t.createdAt)],
);
