// Target and issuer guards shared by the importer and verify:import. They live
// outside both entry scripts so a bundle of one never runs the other's CLI.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type pg from "pg";
import { databaseTarget } from "../../../server/db/config";

/**
 * The directory that archives and reports must stay outside of: the Git
 * checkout the script runs from, or, for the bundles in the frontend image
 * (`/app/scripts/migration`), the application directory `/app`.
 */
export function protectedRoot(scriptDir: string): string {
  for (let dir = resolve(scriptDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) break;
  }
  return resolve(scriptDir, "../..");
}

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
