// Applies Drizzle migrations once, under an advisory lock, and records the
// schema version. Run: pnpm --dir frontend run db:migrate [--status]
//
// Fails closed: it never downgrades a database that is newer than this
// build, and it verifies the recorded version after applying.

import { readDatabaseConfig } from "../../server/db/config";
import { runMigrations } from "../../server/db/migrator";
import { createPool } from "../../server/db/pool";
import {
  checkCompatibility,
  readSchemaState,
  SCHEMA_VERSION,
} from "../../server/db/schema-version";
import { loadLocalDatabaseEnv } from "./env";

async function main(): Promise<void> {
  loadLocalDatabaseEnv();
  const pool = createPool(readDatabaseConfig("migrate"));
  const client = await pool.connect();
  try {
    if (process.argv.includes("--status")) {
      const state = await readSchemaState(client);
      const compatibility = checkCompatibility(state);
      console.log(
        JSON.stringify(
          { database: state, application: SCHEMA_VERSION, compatibility },
          null,
          2,
        ),
      );
      if (!compatibility.ok) process.exitCode = 1;
      return;
    }
    const { before, after } = await runMigrations(
      client,
      process.env.APP_VERSION ?? "unknown",
    );
    console.log(
      `[db:migrate] schema ${before?.version ?? 0} -> ${after.version} (compatible from ${after.compatibleFrom})`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[db:migrate] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
