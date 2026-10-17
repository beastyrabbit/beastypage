// Verifies a PostgreSQL database after `import:convex`. This command is
// offline and read-only; archive and reports stay outside the repository.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { getTableColumns, getTableName } from "drizzle-orm";
import type pg from "pg";
import {
  isLoopbackDatabaseUrl,
  readDatabaseConfig,
} from "../../server/db/config";
import { createPool } from "../../server/db/pool";
import {
  checkCompatibility,
  readSchemaState,
} from "../../server/db/schema-version";
import { loadLocalDatabaseEnv } from "../db/env";
import { ConvexArchive, sha256File } from "./import/archive";
import {
  asDocument,
  type ConvexDocument,
  type MapContext,
  Reject,
} from "./import/convert";
import {
  assertDatabaseTarget,
  disableNetwork,
  type IssuerMode,
  issuerModeFor,
} from "./import/guards";
import {
  assertOutsideRepository,
  type ImportReport,
  tableFingerprints,
} from "./import/run";
import { STEPS } from "./import/tables";

const SAMPLE_SIZE = 3;
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

export interface VerificationMismatch {
  check: string;
  detail: string;
}

export interface VerificationReport {
  archiveSha256: string;
  checked: {
    tables: number;
    documents: number;
    links: number;
    files: number;
  };
  mismatches: VerificationMismatch[];
  issuer: { mode: IssuerMode; expectedIssuer: string | null };
  ok: boolean;
}

export function issuerModeMatches(
  report: ImportReport["issuer"] | undefined,
  requested: { mode: IssuerMode; expectedIssuer: string | null },
): boolean {
  return Boolean(
    report &&
      report.mode === requested.mode &&
      (requested.mode !== "expected" ||
        report.expectedIssuer === requested.expectedIssuer),
  );
}

function stable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function equalValue(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "string") {
    const numeric = Number(actual);
    if (Number.isFinite(numeric)) return expected === numeric;
  }
  return stable(expected) === stable(actual);
}

function importReport(path: string): ImportReport {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object")
    throw new Error("Invalid importer report");
  return value as ImportReport;
}

async function rowsForLegacy(
  client: pg.PoolClient,
  table: string,
): Promise<Set<string>> {
  const result = await client.query<{ legacy_id: string }>(
    `select legacy_id from "${table}" where legacy_id is not null`,
  );
  return new Set(result.rows.map((row) => row.legacy_id));
}

async function mapContext(
  client: pg.PoolClient,
  archiveSha256: string,
  freezeAt: Date,
  expectedIssuer: string | null,
): Promise<MapContext> {
  const imported = new Map<string, Set<string>>();
  for (const step of STEPS) {
    const tableName = getTableName(step.target);
    if (imported.has(tableName)) continue;
    if (!Object.hasOwn(getTableColumns(step.target), "legacyId")) {
      imported.set(tableName, new Set());
      continue;
    }
    imported.set(tableName, await rowsForLegacy(client, tableName));
  }
  const storage = await client.query<{ storage_id: string; file_id: string }>(
    "select storage_id, file_id from import_storage_map where archive_sha256 = $1",
    [archiveSha256],
  );
  const fileMap = new Map(
    storage.rows.map((row) => [row.storage_id, row.file_id]),
  );
  const facts = new Map<string, string>();
  return {
    freezeAt,
    expectedIssuer,
    imported: (table, id) => imported.get(table)?.has(id) ?? false,
    fileFor: (storageId) => fileMap.get(storageId) ?? null,
    repair: () => undefined,
    facts,
  };
}

async function checkCountsAndFingerprints(
  client: pg.PoolClient,
  report: ImportReport,
  mismatches: VerificationMismatch[],
): Promise<number> {
  let tables = 0;
  for (const [stepName, stats] of Object.entries(report.steps)) {
    const step = STEPS.find((candidate) => candidate.name === stepName);
    const tableName = step ? getTableName(step.target) : stepName;
    const count = await client.query<{ count: string }>(
      `select count(*)::text as count from "${tableName}"`,
    );
    tables++;
    const actual = Number(count.rows[0]?.count ?? 0);
    // A second adoption_batch pass updates the same rows; the importer report
    // intentionally records the same expected count for both passes.
    if (actual !== stats.imported) {
      mismatches.push({
        check: "count",
        detail: `${stepName}: expected ${stats.imported}, found ${actual}`,
      });
    }
  }
  const fingerprints = await tableFingerprints(client);
  for (const [table, expected] of Object.entries(report.fingerprints)) {
    if (fingerprints[table] !== expected) {
      mismatches.push({ check: "fingerprint", detail: `${table}: mismatch` });
    }
  }
  return tables;
}

async function checkLegacyLinks(
  client: pg.PoolClient,
  archive: ConvexArchive,
  mismatches: VerificationMismatch[],
): Promise<number> {
  const checks: Record<string, (id: string) => Promise<boolean>> = {
    // Keep this lookup order identical to server/repositories/legacyLinks.ts:
    // public slug, legacy Convex id, then UUID primary id where supported.
    cat_profile: (id) => linkExists(client, "cat_profile", id, true),
    adoption_batch: (id) => linkExists(client, "adoption_batch", id, true),
    stream_sessions: (id) => linkExists(client, "stream_sessions", id, false),
  };
  let checked = 0;
  for (const [table, find] of Object.entries(checks)) {
    for await (const item of archive.documents(table)) {
      if (!("document" in item)) continue;
      const document = item.document;
      if (!document || typeof document !== "object") continue;
      const id = (document as Record<string, unknown>)._id;
      if (typeof id !== "string") continue;
      // Quarantined/skipped documents are deliberately absent. Imported rows
      // must be addressable by the legacy id used by existing public links.
      const imported = await client.query(
        `select 1 from "${table}" where legacy_id = $1 limit 1`,
        [id],
      );
      if ((imported.rowCount ?? 0) === 0) continue;
      checked++;
      if (!(await find(id))) {
        mismatches.push({
          check: "legacy-link",
          detail: `${table}: imported legacy id is not resolvable`,
        });
      }
    }
  }
  return checked;
}

async function linkExists(
  client: pg.PoolClient,
  table: string,
  value: string,
  supportsUuid: boolean,
): Promise<boolean> {
  const bySlug =
    table === "stream_sessions"
      ? false
      : (
          await client.query(
            `select 1 from "${table}" where slug = $1 limit 1`,
            [value],
          )
        ).rowCount;
  if (bySlug) return true;
  const byLegacy = await client.query(
    `select 1 from "${table}" where legacy_id = $1 limit 1`,
    [value],
  );
  if ((byLegacy.rowCount ?? 0) > 0) return true;
  if (
    !supportsUuid ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return false;
  const byId = await client.query(
    `select 1 from "${table}" where id = $1 limit 1`,
    [value],
  );
  return (byId.rowCount ?? 0) > 0;
}

async function checkMappedSamples(
  client: pg.PoolClient,
  archive: ConvexArchive,
  report: ImportReport,
  mismatches: VerificationMismatch[],
  expectedIssuer: string | null,
): Promise<number> {
  const freezeAt = new Date(report.manifest.freezeAt);
  const contexts = await mapContext(
    client,
    report.archiveSha256,
    freezeAt,
    expectedIssuer,
  );
  for await (const item of archive.documents("quick_share_uploads")) {
    if (
      !("document" in item) ||
      !item.document ||
      typeof item.document !== "object"
    )
      continue;
    const document = item.document as Record<string, unknown>;
    if (
      typeof document._id === "string" &&
      typeof document.state === "string"
    ) {
      contexts.facts.set(document._id, document.state);
    }
  }
  let documents = 0;
  for (const step of STEPS) {
    // The first adoption_batch pass is intentionally overwritten by the
    // adoption_batch_refs pass after profiles have been imported.
    if (step.name === "adoption_batch") continue;
    const candidates: { key: string; rows: Record<string, unknown>[] }[] = [];
    for await (const item of archive.documents(step.source)) {
      if (!("document" in item)) continue;
      let document: ConvexDocument;
      try {
        document = asDocument(item.document);
        const result = step.map(document, contexts);
        if (!("rows" in result) || result.rows.length === 0) continue;
        candidates.push({
          key: createHash("sha256").update(document._id).digest("hex"),
          rows: result.rows,
        });
      } catch (error) {
        if (error instanceof Reject) continue;
        throw error;
      }
    }
    candidates.sort((left, right) => left.key.localeCompare(right.key));
    for (const candidate of candidates.slice(0, SAMPLE_SIZE)) {
      documents++;
      const columns = getTableColumns(step.target);
      const tableName = getTableName(step.target);
      for (const expected of candidate.rows) {
        const id = expected.id;
        if (typeof id !== "string") continue;
        const result = await client.query<Record<string, unknown>>(
          `select * from "${tableName}" where id = $1`,
          [id],
        );
        const actual = result.rows[0];
        // A sampled archive document can be a documented quarantine/skip;
        // count verification above catches an unexpected deletion.
        if (!actual) continue;
        for (const [key, column] of Object.entries(columns)) {
          if (key === "legacyCreatedAt") continue;
          if (!(key in expected)) continue;
          const value = actual[column.name];
          if (!equalValue(expected[key], value)) {
            mismatches.push({
              check: "sample",
              detail: `${step.name}.${key}: mismatch`,
            });
          }
        }
      }
    }
  }
  return documents;
}

async function checkFiles(
  client: pg.PoolClient,
  archiveSha256: string,
  mismatches: VerificationMismatch[],
): Promise<number> {
  const result = await client.query<{
    storage_id: string;
    file_id: string;
    sha256: string;
    bytes: Buffer;
  }>(
    `select m.storage_id, m.file_id, f.sha256, f.bytes
       from import_storage_map m left join files f on f.id = m.file_id
      where m.archive_sha256 = $1`,
    [archiveSha256],
  );
  for (const row of result.rows) {
    const actual = row.bytes
      ? createHash("sha256").update(row.bytes).digest("hex")
      : null;
    if (!actual || actual !== row.sha256) {
      mismatches.push({
        check: "file",
        detail: `${row.storage_id}: SHA-256 mismatch`,
      });
    }
  }
  return result.rows.length;
}

export async function verifyImport(
  client: pg.PoolClient,
  archivePath: string,
  importerReport: ImportReport,
  issuerOptions?: { mode: IssuerMode; expectedIssuer: string | null },
): Promise<VerificationReport> {
  const mismatches: VerificationMismatch[] = [];
  const reportIssuer = importerReport.issuer;
  const requestedIssuer = issuerOptions ?? reportIssuer;
  if (!requestedIssuer || !issuerModeMatches(reportIssuer, requestedIssuer)) {
    mismatches.push({
      check: "issuer-mode",
      detail:
        "import report issuer mode does not match verify:import arguments",
    });
  }
  const archiveSha256 = await sha256File(archivePath);
  if (archiveSha256 !== importerReport.archiveSha256) {
    mismatches.push({
      check: "archive",
      detail: "archive SHA-256 differs from importer report",
    });
  }
  const archive = await ConvexArchive.open(archivePath);
  try {
    const tables = await checkCountsAndFingerprints(
      client,
      importerReport,
      mismatches,
    );
    const links = await checkLegacyLinks(client, archive, mismatches);
    const documents = await checkMappedSamples(
      client,
      archive,
      importerReport,
      mismatches,
      requestedIssuer?.expectedIssuer ?? null,
    );
    const files = await checkFiles(
      client,
      importerReport.archiveSha256,
      mismatches,
    );
    return {
      archiveSha256,
      checked: { tables, documents, links, files },
      mismatches,
      issuer: requestedIssuer ?? { mode: "expected", expectedIssuer: null },
      ok: mismatches.length === 0,
    };
  } finally {
    archive.close();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      archive: { type: "string" },
      "import-report": { type: "string" },
      "report-dir": { type: "string" },
      "expected-database": { type: "string" },
      "expected-issuer": { type: "string" },
      "allow-any-issuer": { type: "boolean", default: false },
      "counts-only": { type: "boolean", default: false },
    },
  });
  if (
    !values.archive ||
    !values["import-report"] ||
    !values["report-dir"] ||
    !values["expected-database"]
  ) {
    throw new Error(
      "--archive, --import-report, --report-dir and --expected-database are required",
    );
  }
  assertOutsideRepository(values.archive, REPO_ROOT, "The archive");
  assertOutsideRepository(
    values["import-report"],
    REPO_ROOT,
    "The importer report",
  );
  assertOutsideRepository(
    values["report-dir"],
    REPO_ROOT,
    "The report directory",
  );
  mkdirSync(values["report-dir"], { recursive: true, mode: 0o700 });
  disableNetwork();
  const report = importReport(values["import-report"]);
  loadLocalDatabaseEnv();
  const config = readDatabaseConfig("import");
  const issuer = issuerModeFor(
    values["expected-issuer"],
    values["allow-any-issuer"] ?? false,
    isLoopbackDatabaseUrl(config.url),
  );
  const pool = createPool(config);
  const client = await pool.connect();
  try {
    await assertDatabaseTarget(
      client,
      config.url,
      values["expected-database"],
      "verify:import",
    );
    const compatibility = checkCompatibility(await readSchemaState(client));
    if (!compatibility.ok)
      throw new Error(`Database not ready: ${compatibility.reason}`);
    const result = await verifyImport(client, values.archive, report, issuer);
    writeFileSync(
      join(values["report-dir"], "verify-import.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      `[verify:import] ${result.ok ? "OK" : "FAILED"}; checked ${result.checked.tables} tables, ${result.checked.files} files`,
    );
    if (!result.ok) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(
      "[verify:import] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
