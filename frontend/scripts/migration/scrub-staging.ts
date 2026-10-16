// Turn an imported PostgreSQL database into a staging-safe database.
// Reports contain counts only and must be written outside the repository.

import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type pg from "pg";
import { databaseTarget, readDatabaseConfig } from "../../server/db/config";
import { createPool } from "../../server/db/pool";
import { loadLocalDatabaseEnv } from "../db/env";

const MIN_KEY_LENGTH = 32;
const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Columns from the data contract which are deliberately scrubbed. */
export const SENSITIVE_COLUMN_POLICY = {
  random: {
    catdex_uploads: ["token", "rate_key"],
    cat_profile: ["edit_token"],
    cat_shares: ["edit_token"],
    single_cat_settings: ["edit_token"],
    adoption_batch: ["edit_token"],
    adoption_batch_cats: ["edit_token", "share_token"],
    stream_sessions: ["viewer_key"],
    wheel_spins: ["actor_key"],
    discord_challenge: ["token", "answer_hash", "salt"],
    perfect_cats: ["hash"],
    perfect_matchups: ["token"],
    palette_generator_settings: ["edit_token"],
    pixelator_settings: ["edit_token"],
    dash_settings: ["edit_token"],
    ancestry_tree: ["edit_token"],
    users: ["api_key"],
    quick_share_uploads: ["receipt_hash", "original_key", "public_key"],
    quick_share_jobs: ["lease_id"],
  },
  pseudonym: {
    cat_profile: ["owner_token_identifier"],
    cat_shares: ["owner_token_identifier"],
    single_cat_settings: ["owner_token_identifier"],
    adoption_batch: ["owner_token_identifier"],
    stream_sessions: ["owner_token_identifier"],
    palette_generator_settings: ["owner_token_identifier"],
    pixelator_settings: ["owner_token_identifier"],
    dash_settings: ["owner_token_identifier"],
    ancestry_tree: ["owner_token_identifier"],
    users: ["token_identifier", "username"],
    discord_user_configs: ["discord_user_id"],
    perfect_votes: ["client_id"],
    perfect_matchups: ["client_id"],
    stream_participants: ["fingerprint", "viewer_session"],
    quick_share_uploads: ["owner_token_identifier", "ip_hash", "rate_identity"],
    quick_share_bans: ["ip_hash"],
    quick_share_usage: ["identity"],
  },
  password: { ancestry_tree: ["password_hash"] },
  derived: { users: ["username_search"] },
  clear: {
    quick_share_uploads: ["raw_ip"],
    quick_share_bans: ["raw_ip", "raw_ip_expires_at"],
  },
} as const;

/** The one sensitive-looking column intentionally retained as public data. */
export const PUBLIC_BY_DESIGN_COLUMNS = new Set([
  "catdex.twitch_user_name",
  "files.sha256",
  "jobs.dedupe_key",
  "stream_votes.option_key",
  "user_variants.tool_key",
]);
type ReportTable = { columns: Record<string, number>; deleted: number };
export interface ScrubReport {
  mode: "scrub" | "verify";
  database: string;
  stagingIssuer: string;
  generatedAt: string;
  tables: Record<string, ReportTable>;
  findings?: { table: string; column: string; count: number }[];
}

export interface ScrubOptions {
  databaseUrl: string;
  stagingIssuer: string;
  stagingPassword: string;
  scrubKey: string;
  reportDir: string;
  verify?: boolean;
  knowStaging?: boolean;
  expectedDatabase?: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableReport(report: ScrubReport, table: string): ReportTable {
  const existing = report.tables[table];
  if (existing) return existing;
  const created = { columns: {}, deleted: 0 };
  report.tables[table] = created;
  return created;
}

function addCount(
  report: ScrubReport,
  table: string,
  column: string,
  count: number,
) {
  if (count > 0) tableReport(report, table).columns[column] = count;
}

function randomToken(): string {
  return `stg_${randomBytes(24).toString("base64url")}`;
}

function pseudonym(key: Buffer, value: string): string {
  return `stg_${createHmac("sha256", key).update(value).digest("hex")}`;
}

function clerkPseudonym(key: Buffer, value: string, issuer: string): string {
  return `${issuer}|${pseudonym(key, value)}`;
}

function usernamePseudonym(key: Buffer, value: string): string {
  return `stg_u_${createHmac("sha256", key).update(value).digest("hex").slice(0, 24)}`;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function assertReportDirOutsideRepository(reportDir: string): void {
  const resolved = resolve(reportDir);
  const rel = relative(REPO_ROOT, resolved);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error("--report-dir must be outside the repository");
}

function validateOptions(options: ScrubOptions): void {
  if (options.scrubKey.length < MIN_KEY_LENGTH)
    throw new Error(
      `STAGING_SCRUB_KEY must be at least ${MIN_KEY_LENGTH} characters`,
    );
  if (!options.stagingIssuer || options.stagingIssuer.includes("|"))
    throw new Error(
      "--staging-issuer must be non-empty and must not contain '|'",
    );
  if (!options.stagingPassword)
    throw new Error("--staging-password-file is empty");
  if (!options.expectedDatabase?.trim())
    throw new Error("--expected-database is required");
  assertReportDirOutsideRepository(options.reportDir);
}

async function assertSafeTarget(
  client: pg.PoolClient,
  options: ScrubOptions,
): Promise<string> {
  const parsed = new URL(options.databaseUrl);
  const database = (
    await client.query<{ name: string }>("select current_database() as name")
  ).rows[0]?.name;
  if (!database) throw new Error("Could not determine current database");
  const target = databaseTarget(options.databaseUrl);
  console.log(
    `[scrub:staging] target host=${target.host} database=${database}`,
  );
  if (database !== options.expectedDatabase?.trim()) {
    throw new Error(
      `Refusing database target: expected ${options.expectedDatabase}, current database is ${database}`,
    );
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    if (!options.knowStaging || !options.expectedDatabase)
      throw new Error(
        "Refusing non-loopback database; pass --i-know-this-is-staging --expected-database <name>",
      );
  }
  const present = (
    await client.query<{ present: boolean }>(
      "select to_regclass('public.beastypage_schema_version') is not null as present",
    )
  ).rows[0]?.present;
  if (!present)
    throw new Error("Refusing database without beastypage_schema_version");
  return database;
}

async function updateRows(
  client: pg.PoolClient,
  report: ScrubReport,
  table: string,
  column: string,
  transform: (value: string) => string,
): Promise<void> {
  const rows = await client.query<{ id: string; value: string | null }>(
    `select id, ${quoteIdentifier(column)} as value from ${quoteIdentifier(table)} where ${quoteIdentifier(column)} is not null`,
  );
  for (const row of rows.rows) {
    await client.query(
      `update ${quoteIdentifier(table)} set ${quoteIdentifier(column)} = $1 where id = $2`,
      [transform(row.value as string), row.id],
    );
  }
  addCount(report, table, column, rows.rowCount ?? rows.rows.length);
}

async function clearColumn(
  client: pg.PoolClient,
  report: ScrubReport,
  table: string,
  column: string,
): Promise<void> {
  // quick_share_uploads.raw_ip is NOT NULL in the shipped schema; an empty
  // string is its documented scrubbed sentinel. Nullable columns use NULL.
  const value =
    table === "quick_share_uploads" && column === "raw_ip" ? "" : null;
  const result = await client.query(
    `update ${quoteIdentifier(table)} set ${quoteIdentifier(column)} = $1 where ${quoteIdentifier(column)} is distinct from $1`,
    [value],
  );
  addCount(report, table, column, result.rowCount ?? 0);
}

async function deleteRows(
  client: pg.PoolClient,
  report: ScrubReport,
  table: string,
  sql: string,
): Promise<void> {
  const result = await client.query(sql);
  const entry = tableReport(report, table);
  entry.deleted += result.rowCount ?? 0;
}

async function scrub(
  client: pg.PoolClient,
  options: ScrubOptions,
  database: string,
): Promise<ScrubReport> {
  const key = Buffer.from(options.scrubKey);
  const report: ScrubReport = {
    mode: "scrub",
    database,
    stagingIssuer: options.stagingIssuer,
    generatedAt: new Date().toISOString(),
    tables: {},
  };
  await client.query("begin");
  try {
    for (const [table, columns] of Object.entries(
      SENSITIVE_COLUMN_POLICY.random,
    ))
      for (const column of columns)
        await updateRows(client, report, table, column, randomToken);
    for (const [table, columns] of Object.entries(
      SENSITIVE_COLUMN_POLICY.pseudonym,
    )) {
      for (const column of columns) {
        const transform =
          column === "token_identifier" || column === "owner_token_identifier"
            ? (value: string) =>
                clerkPseudonym(key, value, options.stagingIssuer)
            : column === "username"
              ? (value: string) => usernamePseudonym(key, value)
              : (value: string) => pseudonym(key, value);
        await updateRows(client, report, table, column, transform);
      }
    }
    const passwordHash = hashPassword(options.stagingPassword);
    for (const [table, columns] of Object.entries(
      SENSITIVE_COLUMN_POLICY.password,
    ))
      for (const column of columns)
        await updateRows(client, report, table, column, () => passwordHash);
    for (const [table, columns] of Object.entries(
      SENSITIVE_COLUMN_POLICY.clear,
    ))
      for (const column of columns)
        await clearColumn(client, report, table, column);

    await deleteRows(
      client,
      report,
      "discord_challenge",
      "delete from discord_challenge",
    );
    await deleteRows(
      client,
      report,
      "catdex_uploads",
      "delete from catdex_uploads where expires_at <= now()",
    );
    await deleteRows(
      client,
      report,
      "perfect_matchups",
      "delete from perfect_matchups where expires_at <= now()",
    );
    await deleteRows(
      client,
      report,
      "quick_share_parts",
      "delete from quick_share_parts",
    );
    await deleteRows(
      client,
      report,
      "quick_share_jobs",
      "delete from quick_share_jobs where lease_expires_at is not null and lease_expires_at <= now()",
    );
    await deleteRows(client, report, "live_events", "delete from live_events");
    await deleteRows(client, report, "jobs", "delete from jobs");
    await deleteRows(client, report, "job_runs", "delete from job_runs");
    // Keep Quick Share metadata used by tests, replacing storage references
    // with non-sensitive staging paths and discarding failure diagnostics.
    const quickShare = await client.query(
      "update quick_share_uploads set original_key = 'staging/' || id::text, public_key = case when public_key is null then null else 'staging/' || id::text end, multipart_upload_id = null, failure_message = null, compatibility_warning = null",
    );
    addCount(
      report,
      "quick_share_uploads",
      "metadata_trimmed",
      quickShare.rowCount ?? 0,
    );
    await client.query("commit");
    return report;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function passwordMatches(password: string, stored: string | null): boolean {
  if (!stored?.startsWith("pbkdf2$")) return false;
  const [, iterationsText, saltText, expectedText] = stored.split("$");
  const iterations = Number(iterationsText);
  if (!Number.isSafeInteger(iterations) || !saltText || !expectedText)
    return false;
  const expected = Buffer.from(expectedText, "base64");
  const actual = pbkdf2Sync(
    password,
    Buffer.from(saltText, "base64"),
    iterations,
    expected.length,
    "sha256",
  );
  return actual.length === expected.length && actual.equals(expected);
}

async function verify(
  client: pg.PoolClient,
  options: ScrubOptions,
  database: string,
): Promise<ScrubReport> {
  const report: ScrubReport = {
    mode: "verify",
    database,
    stagingIssuer: options.stagingIssuer,
    generatedAt: new Date().toISOString(),
    tables: {},
    findings: [],
  };
  const finding = (table: string, column: string, count: number) => {
    if (count > 0) report.findings?.push({ table, column, count });
  };
  for (const [table, columns] of Object.entries(
    SENSITIVE_COLUMN_POLICY.random,
  )) {
    for (const column of columns) {
      const predicate =
        table === "quick_share_uploads" &&
        (column === "original_key" || column === "public_key")
          ? `${quoteIdentifier(column)} is not null and ${quoteIdentifier(column)} not like 'staging/%'`
          : `${quoteIdentifier(column)} is not null and ${quoteIdentifier(column)} not like 'stg_%'`;
      const result = await client.query(
        `select count(*)::int as count from ${quoteIdentifier(table)} where ${predicate}`,
      );
      finding(table, column, result.rows[0]?.count ?? 0);
    }
  }
  for (const [table, columns] of Object.entries(
    SENSITIVE_COLUMN_POLICY.pseudonym,
  )) {
    for (const column of columns) {
      if (column === "token_identifier" || column === "owner_token_identifier")
        continue;
      const result = await client.query(
        `select count(*)::int as count from ${quoteIdentifier(table)} where ${quoteIdentifier(column)} is not null and ${quoteIdentifier(column)} not like 'stg_%'`,
      );
      finding(table, column, result.rows[0]?.count ?? 0);
    }
  }
  for (const [table, columns] of Object.entries(
    SENSITIVE_COLUMN_POLICY.derived,
  )) {
    for (const column of columns) {
      const result = await client.query(
        `select count(*)::int as count from ${quoteIdentifier(table)} where ${quoteIdentifier(column)} is not null and ${quoteIdentifier(column)} not like 'stg_%'`,
      );
      finding(table, column, result.rows[0]?.count ?? 0);
    }
  }
  const issuerResult = await client.query<{ count: number }>(
    "select count(*)::int as count from users where token_identifier not like $1",
    [`${options.stagingIssuer}|%`],
  );
  finding("users", "token_identifier", issuerResult.rows[0]?.count ?? 0);
  const ownerTables = Object.entries(SENSITIVE_COLUMN_POLICY.pseudonym)
    .filter(([, columns]) =>
      (columns as readonly string[]).includes("owner_token_identifier"),
    )
    .map(([table]) => table);
  for (const table of ownerTables) {
    const result = await client.query<{ count: number }>(
      `select count(*)::int as count from ${quoteIdentifier(table)} where owner_token_identifier is not null and owner_token_identifier not like $1`,
      [`${options.stagingIssuer}|%`],
    );
    finding(table, "owner_token_identifier", result.rows[0]?.count ?? 0);
  }
  const passwordRows = await client.query<{ password_hash: string | null }>(
    "select password_hash from ancestry_tree where password_hash is not null",
  );
  finding(
    "ancestry_tree",
    "password_hash",
    passwordRows.rows.filter(
      (row) => !passwordMatches(options.stagingPassword, row.password_hash),
    ).length,
  );
  for (const [table, columns] of Object.entries(
    SENSITIVE_COLUMN_POLICY.clear,
  )) {
    for (const column of columns) {
      const predicate =
        table === "quick_share_uploads" && column === "raw_ip"
          ? `${quoteIdentifier(column)} <> ''`
          : `${quoteIdentifier(column)} is not null`;
      const result = await client.query(
        `select count(*)::int as count from ${quoteIdentifier(table)} where ${predicate}`,
      );
      finding(table, column, result.rows[0]?.count ?? 0);
    }
  }
  return report;
}

export async function runScrub(
  client: pg.PoolClient,
  options: ScrubOptions,
): Promise<ScrubReport> {
  validateOptions(options);
  const database = await assertSafeTarget(client, options);
  return options.verify
    ? verify(client, options, database)
    : scrub(client, options, database);
}

function parseCli(): ScrubOptions & { verify: boolean } {
  const { values } = parseArgs({
    options: {
      "staging-issuer": { type: "string" },
      "staging-password-file": { type: "string" },
      "report-dir": { type: "string" },
      verify: { type: "boolean", default: false },
      "i-know-this-is-staging": { type: "boolean", default: false },
      "expected-database": { type: "string" },
    },
  });
  if (
    !values["staging-issuer"] ||
    !values["staging-password-file"] ||
    !values["report-dir"]
  )
    throw new Error(
      "--staging-issuer, --staging-password-file, --report-dir, and --expected-database are required",
    );
  const passwordPath = resolve(values["staging-password-file"]);
  if (!existsSync(passwordPath) || !statSync(passwordPath).isFile())
    throw new Error("--staging-password-file must name a file");
  return {
    databaseUrl: readDatabaseConfig("import").url,
    stagingIssuer: values["staging-issuer"],
    stagingPassword: readFileSync(passwordPath, "utf8").trim(),
    scrubKey: process.env.STAGING_SCRUB_KEY ?? "",
    reportDir: values["report-dir"],
    verify: values.verify ?? false,
    knowStaging: values["i-know-this-is-staging"] ?? false,
    expectedDatabase: values["expected-database"],
  };
}

async function main(): Promise<void> {
  loadLocalDatabaseEnv();
  const options = parseCli();
  const pool = createPool(readDatabaseConfig("import"));
  const client = await pool.connect();
  try {
    const report = await runScrub(client, options);
    mkdirSync(resolve(options.reportDir), { recursive: true, mode: 0o700 });
    chmodSync(resolve(options.reportDir), 0o700);
    const reportPath = resolve(
      options.reportDir,
      `staging-scrub-${Date.now()}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
    const findings = report.findings?.length ?? 0;
    console.log(
      `[scrub:staging] ${options.verify ? "verified" : "scrubbed"}; report in ${options.reportDir}; findings=${findings}`,
    );
    if (findings > 0) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1]))
  main().catch((error: unknown) => {
    console.error(
      "[scrub:staging] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
