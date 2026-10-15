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
    runId: uuid("run_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.archiveSha256, t.step] })],
);

export interface ImportManifest {
  archive: string;
  archiveBytes: number;
  freezeAt: string;
  tables: Record<string, { documents: number }>;
  storageFiles: number;
}

export interface ImportReportSummary {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  quarantined: Record<string, number>;
  files: { imported: number; deduplicated: number; quarantined: number };
}
