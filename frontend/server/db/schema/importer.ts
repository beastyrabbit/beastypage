import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, tstz } from "./columns";

/**
 * Importer bookkeeping (#111). Rejected records never enter the database;
 * they go to the private quarantine report next to the archive.
 */
export const importRuns = pgTable("import_runs", {
  id: primaryId(),
  archiveSha256: text("archive_sha256").notNull(),
  manifest: jsonb("manifest").$type<ImportManifest>().notNull(),
  status: text("status", { enum: ["running", "complete", "failed"] }).notNull(),
  startedAt: tstz("started_at").notNull().defaultNow(),
  finishedAt: tstz("finished_at"),
  report: jsonb("report").$type<ImportReportSummary>(),
});

export const importCheckpoints = pgTable(
  "import_checkpoints",
  {
    archiveSha256: text("archive_sha256").notNull(),
    step: text("step").notNull(),
    completedAt: tstz("completed_at").notNull().defaultNow(),
    rows: integer("rows").notNull(),
    stats: jsonb("stats").$type<ImportStepStats>().notNull(),
    runId: uuid("run_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.archiveSha256, t.step] })],
);

/**
 * Convex `_storage` id → imported file. Several storage ids can share one
 * content-addressed file, so this survives a resumed import.
 */
export const importStorageMap = pgTable(
  "import_storage_map",
  {
    archiveSha256: text("archive_sha256").notNull(),
    storageId: text("storage_id").notNull(),
    fileId: uuid("file_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.archiveSha256, t.storageId] })],
);

export interface ImportStepStats {
  documents: number;
  imported: number;
  skipped: Record<string, number>;
  quarantined: Record<string, number>;
  repaired: Record<string, number>;
}

/** Describes the archive; never contains document content. */
export interface ImportManifest {
  /** File name only; the private location is not recorded. */
  archive: string;
  archiveBytes: number;
  freezeAt: string;
  tables: string[];
  storageObjects: number;
  contractVersion: number;
}

export interface ImportReportSummary {
  contractVersion: number;
  steps: Record<string, ImportStepStats>;
  fingerprints: Record<string, string>;
}
