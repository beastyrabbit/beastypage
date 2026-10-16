// Imports a Convex export ZIP into PostgreSQL (#111). Never contacts Convex.
//
// Run (from frontend/):
//   pnpm run import:convex --archive /private/snapshot_<ns>.zip \
//     --report-dir /private/import-report [--freeze-at 2026-10-15T18:00:00Z] \
//     --expected-database beastypage --expected-issuer https://clerk.example.com \
//     [--replace] [--confirm-remote-replace]
//
// The archive and the report directory must live outside the repository:
// both contain personal data. See docs/migration/importer.md.

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type pg from "pg";
import {
  databaseTarget,
  isLoopbackDatabaseUrl,
  readDatabaseConfig,
} from "../../server/db/config";
import { createPool } from "../../server/db/pool";
import {
  checkCompatibility,
  readSchemaState,
} from "../../server/db/schema-version";
import { loadLocalDatabaseEnv } from "../db/env";
import { runImport } from "./import/run";

export type IssuerMode = "expected" | "any";

export function issuerModeFor(
  expectedIssuer: string | undefined,
  allowAnyIssuer: boolean,
  loopback: boolean,
): { mode: IssuerMode; expectedIssuer: string | null } {
  if (allowAnyIssuer && !loopback) {
    throw new Error(
      "--allow-any-issuer is allowed only for loopback databases",
    );
  }
  if (allowAnyIssuer && expectedIssuer) {
    throw new Error(
      "Use either --expected-issuer or --allow-any-issuer, not both",
    );
  }
  if (allowAnyIssuer) return { mode: "any", expectedIssuer: null };
  if (!expectedIssuer?.trim()) {
    throw new Error(
      "--expected-issuer is required (use --allow-any-issuer only for loopback tests)",
    );
  }
  if (expectedIssuer.includes("|"))
    throw new Error("--expected-issuer must not contain '|'");
  return { mode: "expected", expectedIssuer: expectedIssuer.trim() };
}

export async function assertDatabaseTarget(
  client: pg.PoolClient,
  url: string,
  expectedDatabase: string | undefined,
  label: string,
): Promise<void> {
  if (!expectedDatabase?.trim())
    throw new Error("--expected-database is required");
  const target = databaseTarget(url);
  const current = await client.query<{ name: string }>(
    "select current_database() as name",
  );
  const database = current.rows[0]?.name;
  console.log(
    `[${label}] target host=${target.host} database=${database ?? "unknown"}`,
  );
  if (!database || database !== expectedDatabase.trim()) {
    throw new Error(
      `Refusing database target: expected ${expectedDatabase}, current database is ${database ?? "unknown"}`,
    );
  }
}

/**
 * Convex names exports `snapshot_<unix ns>.zip` or, from the dashboard,
 * `snapshot_<deployment>_<unix ns>.zip`; the snapshot time is the freeze.
 */
export function freezeFromArchiveName(path: string): Date | null {
  const match = /snapshot_(?:[a-z0-9-]+_)?(\d{16,20})\.zip$/.exec(path);
  if (!match?.[1]) return null;
  return new Date(Number(BigInt(match[1]) / BigInt(1_000_000)));
}

/** The importer is offline by construction: any HTTP attempt fails the run. */
export function disableNetwork(): void {
  globalThis.fetch = () =>
    Promise.reject(
      new Error("Network access is disabled in the Convex importer"),
    );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      archive: { type: "string" },
      "report-dir": { type: "string" },
      "freeze-at": { type: "string" },
      "expected-issuer": { type: "string" },
      "allow-any-issuer": { type: "boolean", default: false },
      "expected-database": { type: "string" },
      replace: { type: "boolean", default: false },
      "confirm-remote-replace": { type: "boolean", default: false },
    },
  });
  if (
    !values.archive ||
    !values["report-dir"] ||
    !values["expected-database"]
  ) {
    throw new Error(
      "--archive, --report-dir and --expected-database are required",
    );
  }
  const freezeAt = values["freeze-at"]
    ? new Date(values["freeze-at"])
    : freezeFromArchiveName(values.archive);
  if (!freezeAt || Number.isNaN(freezeAt.getTime())) {
    throw new Error(
      "--freeze-at is required when the archive name has no snapshot timestamp",
    );
  }
  disableNetwork();
  loadLocalDatabaseEnv();
  const config = readDatabaseConfig("import");
  const loopback = isLoopbackDatabaseUrl(config.url);
  const issuer = issuerModeFor(
    values["expected-issuer"],
    values["allow-any-issuer"] ?? false,
    loopback,
  );
  if (
    values.replace &&
    !loopback &&
    !(values["confirm-remote-replace"] ?? false)
  ) {
    throw new Error(
      "Refusing --replace against a non-loopback database; pass --confirm-remote-replace explicitly",
    );
  }
  const pool = createPool(config);
  const client = await pool.connect();
  try {
    await assertDatabaseTarget(
      client,
      config.url,
      values["expected-database"],
      "import",
    );
    const compatibility = checkCompatibility(await readSchemaState(client));
    if (!compatibility.ok)
      throw new Error(`Database not ready: ${compatibility.reason}`);
    const report = await runImport(client, {
      archivePath: values.archive,
      reportDir: values["report-dir"],
      freezeAt,
      expectedIssuer: issuer.expectedIssuer,
      issuerMode: issuer.mode,
      replace: values.replace,
      repoRoot: resolve(import.meta.dirname, "../../.."),
    });
    console.log(
      `[import] ${report.ok ? "complete" : "FAILED"}; report in ${values["report-dir"]}`,
    );
    if (!report.ok) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(
      "[import] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
