import type pg from "pg";
import compat from "../../drizzle/compat.json";
import journal from "../../drizzle/meta/_journal.json";

/**
 * Newest migration this build ships. Migration N (1-based) is entry N-1 of
 * the Drizzle journal.
 */
export const SCHEMA_VERSION = journal.entries.length;

/**
 * Oldest application schema version that still works once `version` is
 * applied. Contract migrations (drops, renames, tightened constraints) raise
 * it in drizzle/compat.json; expand migrations leave it alone.
 */
export function compatibleFromFor(version: number): number {
  const contractMigrations: Record<string, number> = compat.contractMigrations;
  let floor = 1;
  for (const [migration, from] of Object.entries(contractMigrations)) {
    if (Number(migration) <= version) floor = Math.max(floor, from);
  }
  return floor;
}

export interface DatabaseSchemaState {
  version: number;
  compatibleFrom: number;
  appVersion: string;
  appliedAt: Date;
}

export async function readSchemaState(
  client: pg.Pool | pg.PoolClient,
): Promise<DatabaseSchemaState | null> {
  const exists = await client.query<{ present: boolean }>(
    "select to_regclass('public.beastypage_schema_version') is not null as present",
  );
  if (!exists.rows[0]?.present) return null;
  const result = await client.query<{
    version: number;
    compatible_from: number;
    app_version: string;
    applied_at: Date;
  }>(
    "select version, compatible_from, app_version, applied_at from beastypage_schema_version where id = 1",
  );
  const row = result.rows[0];
  return row
    ? {
        version: row.version,
        compatibleFrom: row.compatible_from,
        appVersion: row.app_version,
        appliedAt: row.applied_at,
      }
    : null;
}

export type Compatibility =
  | { ok: true; database: number; application: number }
  | { ok: false; reason: string };

/** The application may serve traffic only when this returns ok. */
export function checkCompatibility(
  state: DatabaseSchemaState | null,
  application: number = SCHEMA_VERSION,
): Compatibility {
  if (!state) {
    return {
      ok: false,
      reason: "database has no schema version; run db:migrate",
    };
  }
  if (state.version < application) {
    return {
      ok: false,
      reason: `database schema ${state.version} is older than application schema ${application}; run db:migrate`,
    };
  }
  if (application < state.compatibleFrom) {
    return {
      ok: false,
      reason: `application schema ${application} is older than the database floor ${state.compatibleFrom}; deploy a newer release`,
    };
  }
  return { ok: true, database: state.version, application };
}
