import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../../server/db/config";
import { runMigrations } from "../../server/db/migrator";
import { createDatabase, createPool } from "../../server/db/pool";
import { updateTree } from "../../server/services/ancestry";
import { viewer } from "../../server/services/users";
import {
  FIXTURE_FREEZE,
  FIXTURE_ISSUER,
  writeFixtureArchive,
} from "./import/fixture";
import { runImport } from "./import/run";
import { runScrub } from "./scrub-staging";

const work = mkdtempSync(join(tmpdir(), "beastypage-scrub-test-"));
const archivePath = join(work, "snapshot_1760529600000000000.zip");
const password = "known-staging-password";
const key = randomBytes(32).toString("hex");
let adminPool: pg.Pool;
let pool: pg.Pool;
let databaseUrl: string;

async function withClient<T>(run: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

const options = () => ({
  databaseUrl,
  stagingIssuer: "https://clerk.staging.test",
  stagingPassword: password,
  scrubKey: key,
  reportDir: work,
});

beforeAll(async () => {
  await writeFixtureArchive(archivePath);
  const url = new URL(inject("databaseUrl"));
  adminPool = createPool(
    readDatabaseConfig("migrate", { DATABASE_URL: url.toString() }),
  );
  const database = `beastypage_scrub_${randomBytes(4).toString("hex")}`;
  await adminPool.query(`create database ${database}`);
  url.pathname = `/${database}`;
  databaseUrl = url.toString();
  pool = createPool(
    readDatabaseConfig("import", {
      DATABASE_URL: databaseUrl,
      DATABASE_POOL_MAX: "2",
    }),
  );
  await withClient((client) => runMigrations(client, "scrub-test"));
  await withClient((client) =>
    runImport(client, {
      archivePath,
      reportDir: join(work, "import-report"),
      freezeAt: FIXTURE_FREEZE,
      expectedIssuer: FIXTURE_ISSUER,
      replace: false,
      repoRoot: resolve(import.meta.dirname, "../../.."),
      log: () => undefined,
    }),
  );
});

afterAll(async () => {
  const database = new URL(databaseUrl).pathname.slice(1);
  await pool.end();
  await adminPool.query(`drop database if exists ${database} with (force)`);
  await adminPool.end();
  rmSync(work, { recursive: true, force: true });
});

describe("staging scrubber", () => {
  it("fails verification before scrubbing and passes after it", async () => {
    const before = await withClient((client) =>
      runScrub(client, { ...options(), verify: true }),
    );
    expect(before.findings?.length).toBeGreaterThan(0);

    const scrubbed = await withClient((client) => runScrub(client, options()));
    expect(scrubbed.mode).toBe("scrub");
    const after = await withClient((client) =>
      runScrub(client, { ...options(), verify: true }),
    );
    expect(after.findings).toEqual([]);
  });

  it("keeps pseudonym relationships and uniqueness intact", async () => {
    const result = await withClient(async (client) => {
      const relationship = await client.query<{ count: number }>(
        "select count(*)::int as count from cat_profile p join users u on u.token_identifier = p.owner_token_identifier",
      );
      const duplicateUsers = await client.query<{ count: number }>(
        "select count(*)::int as count from (select token_identifier from users group by token_identifier having count(*) > 1) d",
      );
      const usernames = await client.query<{ count: number }>(
        "select count(*)::int as count from (select username from users where username is not null group by username having count(*) > 1) d",
      );
      return { relationship, duplicateUsers, usernames };
    });
    expect(result.relationship.rows[0]?.count).toBeGreaterThan(0);
    expect(result.duplicateUsers.rows[0]?.count).toBe(0);
    expect(result.usernames.rows[0]?.count).toBe(0);
  });

  it("keeps the user lookup and ancestry password service working", async () => {
    const db = createDatabase(pool);
    const token = await withClient(
      async (client) =>
        (
          await client.query<{ token_identifier: string }>(
            "select token_identifier from users order by id limit 1",
          )
        ).rows[0]?.token_identifier,
    );
    expect(token).toMatch(/^https:\/\/clerk\.staging\.test\|stg_/);
    expect(await viewer(db, { tokenIdentifier: token ?? null })).not.toBeNull();
    const saved = await updateTree(
      db,
      { slug: "tree-1", password },
      { tokenIdentifier: null },
    );
    expect(saved).toMatchObject({ success: true });
  });

  it("refuses a non-loopback URL without an explicit matching database", async () => {
    await expect(
      withClient((client) =>
        runScrub(client, {
          ...options(),
          databaseUrl: databaseUrl.replace("127.0.0.1", "db.example.test"),
        }),
      ),
    ).rejects.toThrow(/non-loopback/);
  });
});
