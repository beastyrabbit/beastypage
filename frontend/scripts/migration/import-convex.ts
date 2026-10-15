// Imports a Convex export ZIP into PostgreSQL (#111). Never contacts Convex.
//
// Run (from frontend/):
//   pnpm run import:convex -- --archive /private/snapshot_<ns>.zip \
//     --report-dir /private/import-report [--freeze-at 2026-10-15T18:00:00Z] \
//     [--expected-issuer https://clerk.example.com] [--replace]
//
// The archive and the report directory must live outside the repository:
// both contain personal data. See docs/migration/importer.md.

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readDatabaseConfig } from "../../server/db/config";
import { createPool } from "../../server/db/pool";
import {
  checkCompatibility,
  readSchemaState,
} from "../../server/db/schema-version";
import { loadLocalDatabaseEnv } from "../db/env";
import { runImport } from "./import/run";

/** Convex names exports `snapshot_<unix ns>.zip`; the snapshot time is the freeze. */
export function freezeFromArchiveName(path: string): Date | null {
  const match = /snapshot_(\d{16,20})\.zip$/.exec(path);
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
      replace: { type: "boolean", default: false },
    },
  });
  if (!values.archive || !values["report-dir"]) {
    throw new Error("--archive and --report-dir are required");
  }
  const freezeAt = values["freeze-at"]
    ? new Date(values["freeze-at"])
    : freezeFromArchiveName(values.archive);
  if (!freezeAt || Number.isNaN(freezeAt.getTime())) {
    throw new Error(
      "--freeze-at is required when the archive name has no snapshot timestamp",
    );
  }
  if (!values["expected-issuer"]) {
    console.warn(
      "[import] --expected-issuer not set: token identifiers are not checked against the Clerk issuer",
    );
  }

  disableNetwork();
  loadLocalDatabaseEnv();
  const pool = createPool(readDatabaseConfig("import"));
  const client = await pool.connect();
  try {
    const compatibility = checkCompatibility(await readSchemaState(client));
    if (!compatibility.ok)
      throw new Error(`Database not ready: ${compatibility.reason}`);
    const report = await runImport(client, {
      archivePath: values.archive,
      reportDir: values["report-dir"],
      freezeAt,
      expectedIssuer: values["expected-issuer"] ?? null,
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
