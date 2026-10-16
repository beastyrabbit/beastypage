import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDatabase } from "./pool";
import {
  checkCompatibility,
  compatibleFromFor,
  type DatabaseSchemaState,
  readSchemaState,
  SCHEMA_VERSION,
} from "./schema-version";

// Arbitrary but fixed: "BPMG" as int32. Every migration runner takes it.
export const MIGRATION_LOCK_KEY = 0x42504d47;

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

export interface MigrationResult {
  before: DatabaseSchemaState | null;
  after: DatabaseSchemaState;
}

export interface MigrationOptions {
  /** Role used by the frontend. Defaults to the documented app role. */
  appRole?: string;
  /** Role used for imports. Defaults to the documented import role. */
  importRole?: string;
  log?: (line: string) => void;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function grantRole(
  client: pg.PoolClient,
  role: string,
  options: { truncate: boolean },
  log: (line: string) => void,
): Promise<void> {
  const present = await client.query<{ present: boolean }>(
    "select exists(select 1 from pg_roles where rolname = $1) as present",
    [role],
  );
  if (!present.rows[0]?.present) {
    log(`[db:migrate] role ${role} does not exist; skipping grants`);
    return;
  }

  const target = quoteIdentifier(role);
  const owner = quoteIdentifier(
    (await client.query<{ role: string }>("select current_user as role"))
      .rows[0]?.role ?? "",
  );
  await client.query(`grant usage on schema public to ${target}`);
  await client.query(
    `grant select, insert, update, delete${options.truncate ? ", truncate" : ""} on all tables in schema public to ${target}`,
  );
  await client.query(
    `grant usage, select on all sequences in schema public to ${target}`,
  );
  await client.query(
    `alter default privileges for role ${owner} in schema public grant select, insert, update, delete${options.truncate ? ", truncate" : ""} on tables to ${target}`,
  );
  await client.query(
    `alter default privileges for role ${owner} in schema public grant usage, select on sequences to ${target}`,
  );
  log(
    `[db:migrate] grants applied for ${role}${options.truncate ? " (including truncate for imports)" : ""}`,
  );
}

/** Apply the owner-run privileges required by the app and import roles. */
export async function applyRoleGrants(
  client: pg.PoolClient,
  options: MigrationOptions = {},
): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  await grantRole(
    client,
    options.appRole ?? process.env.DATABASE_APP_ROLE ?? "beastypage_app",
    { truncate: false },
    log,
  );
  await grantRole(
    client,
    options.importRole ??
      process.env.DATABASE_IMPORT_ROLE ??
      "beastypage_import",
    { truncate: true },
    log,
  );
}

/**
 * Applies pending migrations under a session advisory lock and records the
 * schema version. Never downgrades: a database newer than this build fails.
 */
export async function runMigrations(
  client: pg.PoolClient,
  appVersion: string,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  try {
    const before = await readSchemaState(client);
    if (before && before.version > SCHEMA_VERSION) {
      throw new Error(
        `database schema ${before.version} is newer than this build (${SCHEMA_VERSION}); refusing to migrate. Deploy the newer release instead.`,
      );
    }

    await migrate(createDatabase(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    const applied = await client.query<{ count: string }>(
      "select count(*)::text as count from drizzle.__drizzle_migrations",
    );
    if (Number(applied.rows[0]?.count) !== SCHEMA_VERSION) {
      throw new Error(
        `expected ${SCHEMA_VERSION} applied migrations, found ${applied.rows[0]?.count}; the migration history does not match this build`,
      );
    }

    await client.query(
      `insert into beastypage_schema_version (id, version, compatible_from, app_version, applied_at)
       values (1, $1, $2, $3, now())
       on conflict (id) do update set
         version = excluded.version,
         compatible_from = excluded.compatible_from,
         app_version = excluded.app_version,
         applied_at = case
           when beastypage_schema_version.version = excluded.version
             then beastypage_schema_version.applied_at
           else excluded.applied_at
         end`,
      [SCHEMA_VERSION, compatibleFromFor(SCHEMA_VERSION), appVersion],
    );

    const after = await readSchemaState(client);
    const compatibility = checkCompatibility(after);
    if (!after || !compatibility.ok) {
      throw new Error(
        compatibility.ok ? "schema version row missing" : compatibility.reason,
      );
    }
    await applyRoleGrants(client, options);
    return { before, after };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
  }
}
