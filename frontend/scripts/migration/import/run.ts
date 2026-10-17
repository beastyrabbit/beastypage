import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import { CONTRACT_VERSION } from "../../../server/db/contracts";
import { createDatabase, type Database } from "../../../server/db/pool";
import {
  files,
  type ImportManifest,
  type ImportStepStats,
  importCheckpoints,
  importRuns,
  importStorageMap,
} from "../../../server/db/schema";
import { ConvexArchive, sha256File } from "./archive";
import {
  asDocument,
  type ConvexDocument,
  creationTime,
  type MapContext,
  Reject,
} from "./convert";
import { inspectFile, parseStorageMeta, type StorageMeta } from "./files";
import { importedFileId } from "./ids";
import { NOT_IMPORTED, type Row, STEPS, STORAGE_FIELDS } from "./tables";

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export interface ImportOptions {
  archivePath: string;
  reportDir: string;
  freezeAt: Date;
  expectedIssuer: string | null;
  issuerMode?: "expected" | "any";
  /** Empty every imported table first (staging refills with a new archive). */
  replace: boolean;
  /** Repository root that the archive and report must stay outside of. */
  repoRoot: string;
  log?: (line: string) => void;
}

export interface ImportReport {
  archiveSha256: string;
  manifest: ImportManifest;
  steps: Record<string, ImportStepStats>;
  verification: Record<string, { expected: number; actual: number }>;
  fingerprints: Record<string, string>;
  issuer: {
    mode: "expected" | "any";
    expectedIssuer: string | null;
  };
  ok: boolean;
}

const BATCH_SIZE = 200;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const CONSTRAINT_ERRORS = new Set(["23505", "23503", "23514", "23502"]);
/** Tables other steps reference; their imported ids are reloaded per step. */
const PARENT_TABLES = [
  "users",
  "card_season",
  "rarity",
  "adoption_batch",
  "cat_profile",
  "perfect_cats",
  "stream_sessions",
  "stream_participants",
  "quick_share_uploads",
];

/** Every table the importer writes. */
const IMPORTED_TABLES: PgTable[] = [
  ...new Set([files, ...STEPS.map((s) => s.target)]),
];

function emptyStats(): ImportStepStats {
  return {
    documents: 0,
    imported: 0,
    skipped: {},
    quarantined: {},
    repaired: {},
  };
}

function bump(record: Record<string, number>, key: string, by = 1) {
  record[key] = (record[key] ?? 0) + by;
}

function sum(record: Record<string, number>) {
  return Object.values(record).reduce((a, b) => a + b, 0);
}

/** The archive holds personal data; nothing derived from it may land in the repository. */
export function assertOutsideRepository(
  path: string,
  repoRoot: string,
  what: string,
) {
  const root = realpathSync(repoRoot);
  let target = resolve(path);
  try {
    target = realpathSync(target);
  } catch {
    target = join(realpathSync(dirname(target)), basename(target));
  }
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (target === root || target.startsWith(prefix)) {
    throw new Error(`${what} must be outside the repository (${root})`);
  }
}

/** Column assignments for `ON CONFLICT (id) DO UPDATE`: every non-generated column. */
function excludedSet(table: PgTable) {
  const set: Record<string, ReturnType<typeof sql>> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (column.primary || column.generated) continue;
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

class Quarantine {
  private readonly lines = new Map<string, string[]>();
  constructor(private readonly dir: string) {}

  add(step: string, entry: Record<string, unknown>) {
    const list = this.lines.get(step) ?? [];
    list.push(JSON.stringify(entry));
    this.lines.set(step, list);
  }

  /** One file per step, rewritten whenever the step runs, so reruns stay deterministic. */
  flush(step: string) {
    const list = this.lines.get(step) ?? [];
    writeFileSync(
      join(this.dir, `${step}.jsonl`),
      list.length ? `${list.join("\n")}\n` : "",
      { mode: 0o600 },
    );
    this.lines.delete(step);
  }
}

export async function runImport(
  client: pg.PoolClient,
  options: ImportOptions,
): Promise<ImportReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const issuerMode =
    options.issuerMode ??
    (options.expectedIssuer === null ? "any" : "expected");
  if (issuerMode === "expected" && !options.expectedIssuer) {
    throw new Error("An expected issuer is required in expected issuer mode");
  }
  assertOutsideRepository(options.archivePath, options.repoRoot, "The archive");
  assertOutsideRepository(
    options.reportDir,
    options.repoRoot,
    "The report directory",
  );
  mkdirSync(join(options.reportDir, "quarantine"), {
    recursive: true,
    mode: 0o700,
  });

  const archiveSha256 = await sha256File(options.archivePath);
  const archive = await ConvexArchive.open(options.archivePath);
  const db = createDatabase(client);
  const quarantine = new Quarantine(join(options.reportDir, "quarantine"));

  try {
    const sources = new Set([
      ...STEPS.map((s) => s.source),
      ...Object.keys(NOT_IMPORTED),
    ]);
    const unknown = archive.tables().filter((table) => !sources.has(table));
    if (unknown.length > 0) {
      throw new Error(
        `Archive has tables the importer does not model: ${unknown.join(", ")}`,
      );
    }
    const manifest: ImportManifest = {
      archive: basename(options.archivePath),
      archiveBytes: statSync(options.archivePath).size,
      freezeAt: options.freezeAt.toISOString(),
      tables: archive.tables(),
      storageObjects: archive.storageObjectCount(),
      contractVersion: CONTRACT_VERSION,
    };

    const runId = await prepareRun(
      client,
      archiveSha256,
      manifest,
      options.replace,
      log,
    );
    const checkpoints = new Map(
      (
        await client.query<{ step: string; stats: ImportStepStats }>(
          "select step, stats from import_checkpoints where archive_sha256 = $1",
          [archiveSha256],
        )
      ).rows.map((row) => [row.step, row.stats]),
    );

    if (!checkpoints.has("files")) {
      const stats = await importFiles(
        db,
        archive,
        archiveSha256,
        runId,
        options.freezeAt,
        quarantine,
      );
      checkpoints.set("files", stats);
      log(
        `[import] files: ${stats.imported} imported, ${sum(stats.quarantined)} quarantined`,
      );
    }
    const storageMap = new Map(
      (
        await client.query<{ storage_id: string; file_id: string }>(
          "select storage_id, file_id from import_storage_map where archive_sha256 = $1",
          [archiveSha256],
        )
      ).rows.map((row) => [row.storage_id, row.file_id]),
    );

    for (const step of STEPS) {
      if (checkpoints.has(step.name)) continue;
      const stats = await importStep(
        client,
        db,
        archive,
        step,
        options,
        storageMap,
        quarantine,
      );
      await db.insert(importCheckpoints).values({
        archiveSha256,
        step: step.name,
        rows: stats.imported,
        stats,
        runId,
      });
      checkpoints.set(step.name, stats);
      log(
        `[import] ${step.name}: ${stats.documents} documents, ${stats.imported} rows, ${sum(stats.skipped)} skipped, ${sum(stats.quarantined)} quarantined`,
      );
    }

    const steps = Object.fromEntries(checkpoints);
    const verification = await verifyCounts(client, steps);
    const fingerprints = await tableFingerprints(client);
    const ok = Object.values(verification).every(
      (v) => v.expected === v.actual,
    );
    await client.query(
      "update import_runs set status = $2, finished_at = now(), report = $3 where id = $1",
      [
        runId,
        ok ? "complete" : "failed",
        { contractVersion: CONTRACT_VERSION, steps, fingerprints },
      ],
    );
    const report: ImportReport = {
      archiveSha256,
      manifest,
      steps,
      verification,
      fingerprints,
      issuer: {
        mode: issuerMode,
        expectedIssuer: options.expectedIssuer,
      },
      ok,
    };
    writeReport(options.reportDir, report);
    return report;
  } finally {
    archive.close();
  }
}

async function importStep(
  client: pg.PoolClient,
  db: Database,
  archive: ConvexArchive,
  step: (typeof STEPS)[number],
  options: ImportOptions,
  storageMap: Map<string, string>,
  quarantine: Quarantine,
): Promise<ImportStepStats> {
  const stats = emptyStats();
  const importedIds = new Map<string, Set<string>>();
  for (const name of PARENT_TABLES) {
    const result = await client.query<{ legacy_id: string }>(
      `select legacy_id from "${name}" where legacy_id is not null`,
    );
    importedIds.set(name, new Set(result.rows.map((r) => r.legacy_id)));
  }
  const facts = new Map<string, string>();
  if (step.name === "quick_share_parts") {
    for await (const item of archive.documents("quick_share_uploads")) {
      if (!("document" in item)) continue;
      const doc = item.document as Record<string, unknown>;
      if (typeof doc._id === "string" && typeof doc.state === "string") {
        facts.set(doc._id, doc.state);
      }
    }
  }

  let pending: { row: Row; legacyId: string }[] = [];
  const flush = async () => {
    if (pending.length === 0) return;
    const rows = pending;
    pending = [];
    stats.imported += await upsertRows(
      client,
      db,
      step.target,
      rows,
      (legacyId, reason) => {
        bump(stats.quarantined, reason);
        quarantine.add(step.name, { step: step.name, legacyId, reason });
      },
    );
  };

  for await (const item of archive.documents(step.source)) {
    stats.documents++;
    if ("error" in item) {
      bump(stats.quarantined, "invalid JSON");
      quarantine.add(step.name, {
        step: step.name,
        line: item.line,
        reason: item.error,
      });
      continue;
    }
    let doc: ConvexDocument | null = null;
    const repairs: string[] = [];
    const ctx: MapContext = {
      freezeAt: options.freezeAt,
      expectedIssuer: options.expectedIssuer,
      imported: (table, id) => importedIds.get(table)?.has(id) ?? false,
      fileFor: (storageId) => storageMap.get(storageId) ?? null,
      repair: (kind) => repairs.push(kind),
      facts,
    };
    try {
      doc = asDocument(item.document);
      const result = step.map(doc, ctx);
      if ("skip" in result) {
        bump(stats.skipped, result.skip);
        continue;
      }
      for (const kind of repairs) bump(stats.repaired, kind);
      for (const row of result.rows) pending.push({ row, legacyId: doc._id });
      if (pending.length >= BATCH_SIZE) await flush();
    } catch (error) {
      if (!(error instanceof Reject)) throw error;
      bump(stats.quarantined, error.message.replace(/\[\d+\]/g, "[]"));
      // The full document goes to the private report for review.
      quarantine.add(step.name, {
        step: step.name,
        line: item.line,
        legacyId: doc?._id ?? null,
        reason: error.message,
        document: item.document,
      });
    }
  }
  await flush();
  quarantine.flush(step.name);
  return stats;
}

async function prepareRun(
  client: pg.PoolClient,
  archiveSha256: string,
  manifest: ImportManifest,
  replace: boolean,
  log: (line: string) => void,
): Promise<string> {
  if (replace) {
    const tables = [
      ...IMPORTED_TABLES,
      importCheckpoints,
      importStorageMap,
      importRuns,
    ]
      .map((t) => `"${getTableName(t)}"`)
      .join(", ");
    await client.query(`truncate ${tables} cascade`);
    log("[import] --replace: emptied imported tables");
  } else {
    const other = await client.query(
      "select 1 from import_runs where archive_sha256 <> $1 limit 1",
      [archiveSha256],
    );
    if (other.rowCount) {
      throw new Error(
        "This database was filled from a different archive. Re-run with --replace to empty it first.",
      );
    }
    const checks = IMPORTED_TABLES.filter(
      (t) => "legacyId" in getTableColumns(t),
    ).map(
      (t) =>
        `exists(select 1 from "${getTableName(t)}" where legacy_id is null)`,
    );
    const appRows = await client.query<{ present: boolean }>(
      `select ${checks.join(" or ")} as present`,
    );
    if (appRows.rows[0]?.present) {
      throw new Error(
        "This database has rows that did not come from an import. Re-run with --replace to empty it first.",
      );
    }
  }
  const existing = await client.query<{ id: string }>(
    "select id from import_runs where archive_sha256 = $1 order by started_at limit 1",
    [archiveSha256],
  );
  if (existing.rows[0]) {
    await client.query(
      "update import_runs set status = 'running', finished_at = null where id = $1",
      [existing.rows[0].id],
    );
    log("[import] resuming from checkpoints");
    return existing.rows[0].id;
  }
  const created = await client.query<{ id: string }>(
    "insert into import_runs (archive_sha256, manifest, status) values ($1, $2, 'running') returning id",
    [archiveSha256, manifest],
  );
  return created.rows[0]?.id as string;
}

function pgCode(error: unknown): string {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (error as { code?: string }).code ?? cause?.code ?? "";
}

function pgConstraint(error: unknown): string | undefined {
  const cause = (error as { cause?: { constraint?: string } }).cause;
  return (error as { constraint?: string }).constraint ?? cause?.constraint;
}

/**
 * Batch upsert by primary key. On a constraint violation the batch is
 * retried row by row inside savepoints, so only offending rows are
 * quarantined. Docs arrive in archive order, so the first holder of a
 * unique value wins on every run.
 */
async function upsertRows(
  client: pg.PoolClient,
  db: Database,
  table: PgTable,
  rows: { row: Row; legacyId: string }[],
  reject: (legacyId: string, reason: string) => void,
): Promise<number> {
  const set = excludedSet(table);
  const idColumn = getTableColumns(table).id;
  if (!idColumn) throw new Error(`${getTableName(table)} has no id column`);
  const write = (values: Row[]) =>
    db
      .insert(table)
      .values(values as never)
      .onConflictDoUpdate({ target: idColumn, set });

  await client.query("begin");
  try {
    await client.query("savepoint batch");
    try {
      await write(rows.map((r) => r.row));
      await client.query("commit");
      return rows.length;
    } catch (error) {
      if (!CONSTRAINT_ERRORS.has(pgCode(error))) throw error;
      await client.query("rollback to savepoint batch");
    }
    let accepted = 0;
    for (const { row, legacyId } of rows) {
      await client.query("savepoint one");
      try {
        await write([row]);
        await client.query("release savepoint one");
        accepted++;
      } catch (error) {
        if (!CONSTRAINT_ERRORS.has(pgCode(error))) throw error;
        await client.query("rollback to savepoint one");
        reject(legacyId, `constraint ${pgConstraint(error) ?? pgCode(error)}`);
      }
    }
    await client.query("commit");
    return accepted;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/** Storage ids referenced by rows that will be imported. */
async function referencedStorageIds(
  archive: ConvexArchive,
  freezeAt: Date,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const [table, fields] of Object.entries(STORAGE_FIELDS)) {
    for await (const item of archive.documents(table)) {
      if (!("document" in item) || typeof item.document !== "object") continue;
      const doc = item.document as Record<string, unknown> | null;
      if (!doc) continue;
      const expiredUpload =
        table === "catdex_uploads" &&
        (doc.status === "consumed" ||
          (typeof doc.expiresAt === "number" &&
            doc.expiresAt <= freezeAt.getTime()));
      if (expiredUpload) continue;
      for (const field of fields) {
        const value = field.startsWith("config.")
          ? (doc.config as Record<string, unknown> | undefined)?.[
              field.slice("config.".length)
            ]
          : doc[field];
        if (typeof value === "string") referenced.add(value);
      }
    }
  }
  return referenced;
}

async function importFiles(
  db: Database,
  archive: ConvexArchive,
  archiveSha256: string,
  runId: string,
  freezeAt: Date,
  quarantine: Quarantine,
): Promise<ImportStepStats> {
  const stats = emptyStats();
  const referenced = await referencedStorageIds(archive, freezeAt);

  const metadata = new Map<string, StorageMeta>();
  for await (const item of archive.documents("_storage")) {
    stats.documents++;
    const meta =
      "document" in item
        ? parseStorageMeta(item.document)
        : "invalid storage metadata JSON";
    if (typeof meta === "string") {
      bump(stats.quarantined, meta);
      continue;
    }
    metadata.set(meta.id, meta);
  }
  const unreferenced = [...metadata.keys()].filter(
    (id) => !referenced.has(id),
  ).length;
  if (unreferenced > 0) {
    bump(stats.skipped, "unreferenced storage object", unreferenced);
  }

  const seenSha = new Set<string>();
  // Sorted ids: the first holder of identical bytes names the file row.
  for (const storageId of [...referenced].sort(compareCodeUnits)) {
    const meta = metadata.get(storageId);
    const entry = archive.storageEntryName(storageId);
    const problems: string[] = [];
    if (!meta) problems.push("no storage metadata");
    if (!entry) problems.push("storage object missing from archive");
    let bytes: Buffer | null = null;
    let inspected: Awaited<ReturnType<typeof inspectFile>> | null = null;
    if (meta && entry) {
      // One object in memory at a time; bytea needs the whole value.
      bytes = await archive.readBuffer(entry, MAX_FILE_BYTES);
      inspected = await inspectFile(bytes, meta);
      if ("problems" in inspected) problems.push(...inspected.problems);
    }
    if (!meta || !bytes || !inspected || !("file" in inspected)) {
      // One count per file, whatever number of problems it has.
      bump(stats.quarantined, problems.join("; "));
      quarantine.add("files", {
        step: "files",
        legacyId: storageId,
        reason: problems.join("; "),
      });
      continue;
    }
    const file = inspected.file;
    for (const kind of inspected.repairs) bump(stats.repaired, kind);
    const fileId = importedFileId(file.sha256Hex);
    if (seenSha.has(file.sha256Hex)) {
      bump(stats.repaired, "duplicate bytes share one file");
    } else {
      seenSha.add(file.sha256Hex);
      const createdAt =
        meta.creationTime === null ? freezeAt : new Date(meta.creationTime);
      await db
        .insert(files)
        .values({
          id: fileId,
          legacyId: storageId,
          legacyCreatedAt:
            meta.creationTime === null ? null : creationTime(meta.creationTime),
          sha256: file.sha256Hex,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          width: file.width,
          height: file.height,
          bytes,
          createdAt,
        })
        .onConflictDoUpdate({ target: files.id, set: excludedSet(files) });
      stats.imported++;
    }
    await db
      .insert(importStorageMap)
      .values({ archiveSha256, storageId, fileId })
      .onConflictDoUpdate({
        target: [importStorageMap.archiveSha256, importStorageMap.storageId],
        set: { fileId },
      });
  }
  quarantine.flush("files");
  await db.insert(importCheckpoints).values({
    archiveSha256,
    step: "files",
    rows: stats.imported,
    stats,
    runId,
  });
  return stats;
}

/** Every imported row must be in the database; anything else fails the run. */
async function verifyCounts(
  client: pg.PoolClient,
  steps: Record<string, ImportStepStats>,
): Promise<Record<string, { expected: number; actual: number }>> {
  const result: Record<string, { expected: number; actual: number }> = {};
  const targets: [string, PgTable][] = [
    ["files", files],
    ...STEPS.map((s) => [s.name, s.target] as [string, PgTable]),
  ];
  for (const [name, table] of targets) {
    const stats = steps[name];
    if (!stats) continue;
    const count = await client.query<{ n: string }>(
      `select count(*)::text as n from "${getTableName(table)}"`,
    );
    result[name] = {
      expected: stats.imported,
      actual: Number(count.rows[0]?.n),
    };
  }
  return result;
}

/** Content hash per table, ordered by id: identical imports give identical values. */
export async function tableFingerprints(
  client: pg.PoolClient | pg.Pool,
): Promise<Record<string, string>> {
  const fingerprints: Record<string, string> = {};
  for (const table of IMPORTED_TABLES) {
    const name = getTableName(table);
    const result = await client.query<{ md5: string }>(
      `select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) as md5 from "${name}" t`,
    );
    fingerprints[name] = result.rows[0]?.md5 ?? "";
  }
  return fingerprints;
}

function formatExpectedIssuer(
  expectedIssuer: string | null | undefined,
): string {
  return expectedIssuer ? ` (${expectedIssuer})` : "";
}

function writeReport(dir: string, report: ImportReport) {
  writeFileSync(
    join(dir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
  const reasons = Object.entries(report.steps).flatMap(([name, s]) => [
    ...Object.entries(s.skipped).map(
      ([r, n]) => `- ${name} skipped ${n}: ${r}`,
    ),
    ...Object.entries(s.quarantined).map(
      ([r, n]) => `- ${name} quarantined ${n}: ${r}`,
    ),
    ...Object.entries(s.repaired).map(
      ([r, n]) => `- ${name} repaired ${n}: ${r}`,
    ),
  ]);
  const lines = [
    "# Convex import report",
    "",
    `- Archive: ${report.manifest.archive} (${report.manifest.archiveBytes} bytes, sha256 ${report.archiveSha256})`,
    `- Freeze: ${report.manifest.freezeAt}`,
    `- Issuer check: ${report.issuer.mode}${formatExpectedIssuer(report.issuer.expectedIssuer)}`,
    `- Contract version: ${report.manifest.contractVersion}`,
    `- Result: ${report.ok ? "OK" : "FAILED (database counts do not match)"}`,
    "",
    "| Step | Documents | Imported | Skipped | Quarantined | Repaired | DB rows |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(report.steps).map(
      ([name, s]) =>
        `| ${name} | ${s.documents} | ${s.imported} | ${sum(s.skipped)} | ${sum(s.quarantined)} | ${sum(s.repaired)} | ${report.verification[name]?.actual ?? "—"} |`,
    ),
    "",
    "## Reasons",
    "",
    ...(reasons.length ? reasons : ["- none"]),
    "",
    "Quarantined documents are in `quarantine/<step>.jsonl`. They are private and contain personal data.",
    "",
  ];
  writeFileSync(join(dir, "report.md"), lines.join("\n"), { mode: 0o600 });
}
