// Verifies imported Quick Share metadata against the media S3 bucket (#110).
// HEAD requests only; it never writes or deletes an object.
//
// Run with the media service's S3 settings, for example:
//   infisical --profile heerlab run --env=dev --path=/media -- \
//     ./node_modules/.bin/tsx scripts/migration/verify-quick-share.ts --report-dir /private/report

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readDatabaseConfig } from "../../server/db/config";
import { createPool } from "../../server/db/pool";
import { loadLocalDatabaseEnv } from "../db/env";
import { assertOutsideRepository } from "./import/run";
import { type HeadResult, headObject, type S3Credentials } from "./s3-head";

export interface UploadRow {
  slug: string;
  state: string;
  original_key: string;
  original_size: number;
  public_key: string | null;
  public_size: number | null;
  public_mime: string | null;
}

export type Head = (key: string) => Promise<HeadResult>;

async function checkReadyUpload(
  row: UploadRow,
  original: HeadResult,
  head: Head,
  problems: string[],
) {
  if (row.state !== "ready") return;
  if (!row.public_key) {
    problems.push("ready upload has no public key");
    return;
  }
  const derived =
    row.public_key === row.original_key ? original : await head(row.public_key);
  if (derived.status !== 200) {
    problems.push(`public object missing (HTTP ${derived.status})`);
    return;
  }
  if (row.public_size !== null && derived.size !== row.public_size) {
    problems.push(`public size ${derived.size} != ${row.public_size}`);
  }
  const mime = derived.contentType?.split(";")[0]?.trim();
  if (row.public_mime && mime !== row.public_mime) {
    problems.push(`public type ${mime} != ${row.public_mime}`);
  }
}

/** Problems for one upload; an empty list means the metadata matches S3. */
export async function checkUpload(
  // NOSONAR
  row: UploadRow,
  head: Head,
): Promise<string[]> {
  if (row.state === "uploading") return [];
  const problems: string[] = [];
  const original = await head(row.original_key);
  if (row.state === "removed") {
    if (original.status === 200)
      problems.push("info: original still present (delete job pending)");
    return problems;
  }
  if (original.status !== 200)
    problems.push(`original missing (HTTP ${original.status})`);
  else if (original.size !== row.original_size) {
    problems.push(`original size ${original.size} != ${row.original_size}`);
  }
  await checkReadyUpload(row, original, head, problems);
  return problems;
}

async function main() {
  const { values } = parseArgs({
    options: { "report-dir": { type: "string" } },
  });
  const reportDir = values["report-dir"];
  if (!reportDir) throw new Error("--report-dir is required");
  assertOutsideRepository(
    reportDir,
    resolve(import.meta.dirname, "../../.."),
    "The report directory",
  );
  const env = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  const credentials: S3Credentials = {
    accessKeyId: env("S3_ACCESS_KEY_ID"),
    secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    region: process.env.S3_REGION ?? "garage",
  };
  const endpoint = env("S3_ENDPOINT");
  const bucket = process.env.S3_BUCKET ?? "beastypage-media";

  loadLocalDatabaseEnv();
  const pool = createPool(readDatabaseConfig("import"));
  try {
    const { rows } = await pool.query<UploadRow>(
      // pg returns bigint as text; sizes stay well inside float8's exact range.
      "select slug, state, original_key, original_size::float8 as original_size, public_key, public_size::float8 as public_size, public_mime from quick_share_uploads order by slug",
    );
    const results: { slug: string; state: string; problems: string[] }[] = [];
    for (const row of rows) {
      const problems = await checkUpload(row, (key) =>
        headObject(endpoint, bucket, key, credentials),
      );
      results.push({ slug: row.slug, state: row.state, problems });
    }
    const failing = results.filter((r) =>
      r.problems.some((p) => !p.startsWith("info:")),
    );
    writeFileSync(
      join(reportDir, "quick-share-s3.json"),
      `${JSON.stringify({ checked: results.length, failing: failing.length, results }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      `[quick-share] checked ${results.length} uploads; ${failing.length} do not match S3`,
    );
    if (failing.length > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(
      "[quick-share] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
