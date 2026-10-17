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
import {
  assertDatabaseTarget,
  disableNetwork,
  freezeFromArchiveName,
  issuerModeFor,
} from "./import/guards";
import { runImport } from "./import/run";

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
