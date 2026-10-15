import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "./config";
import { runMigrations } from "./migrator";
import { createPool } from "./pool";
import { readSchemaState, SCHEMA_VERSION } from "./schema-version";

const databaseUrl = inject("databaseUrl");
let pool: pg.Pool;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("migrate", { DATABASE_URL: databaseUrl }),
  );
});

afterAll(async () => {
  await pool.end();
});

/** A second empty database on the same server, for runner edge cases. */
async function withScratchDatabase(run: (url: string) => Promise<void>) {
  const name = `beastypage_scratch_${randomBytes(4).toString("hex")}`;
  await pool.query(`create database ${name}`);
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  try {
    await run(url.toString());
  } finally {
    await pool.query(`drop database if exists ${name} with (force)`);
  }
}

describe("migration runner", () => {
  it("records the schema version", async () => {
    const state = await readSchemaState(pool);
    expect(state).toMatchObject({ version: SCHEMA_VERSION, compatibleFrom: 1 });
  });

  it("is a no-op when re-run", async () => {
    const client = await pool.connect();
    try {
      const result = await runMigrations(client, "rerun");
      expect(result.before?.version).toBe(SCHEMA_VERSION);
      expect(result.after.version).toBe(SCHEMA_VERSION);
    } finally {
      client.release();
    }
  });

  it("serializes concurrent runners on the advisory lock", async () => {
    await withScratchDatabase(async (url) => {
      const scratch = createPool(
        readDatabaseConfig("migrate", {
          DATABASE_URL: url,
          DATABASE_POOL_MAX: "3",
        }),
      );
      try {
        const run = async () => {
          const client = await scratch.connect();
          try {
            return await runMigrations(client, "parallel");
          } finally {
            client.release();
          }
        };
        const results = await Promise.all([run(), run(), run()]);
        expect(results.map((r) => r.after.version)).toEqual([
          SCHEMA_VERSION,
          SCHEMA_VERSION,
          SCHEMA_VERSION,
        ]);
        // Exactly one runner saw an empty database.
        expect(results.filter((r) => r.before === null)).toHaveLength(1);
      } finally {
        await scratch.end();
      }
    });
  });

  it("refuses to touch a database newer than the build", async () => {
    await withScratchDatabase(async (url) => {
      const scratch = createPool(
        readDatabaseConfig("migrate", { DATABASE_URL: url }),
      );
      const client = await scratch.connect();
      try {
        await runMigrations(client, "first");
        await client.query(
          "update beastypage_schema_version set version = $1",
          [SCHEMA_VERSION + 1],
        );
        await expect(runMigrations(client, "older")).rejects.toThrow(
          /newer than this build/,
        );
      } finally {
        client.release();
        await scratch.end();
      }
    });
  });
});

describe("schema constraints", () => {
  const sha = (n: number) => n.toString(16).padStart(64, "0");

  async function insertFile(n: number) {
    const bytes = Buffer.from(`file-${n}`);
    const result = await pool.query<{ id: string }>(
      "insert into files (sha256, mime_type, byte_size, bytes) values ($1, 'image/png', $2, $3) returning id",
      [sha(n), bytes.length, bytes],
    );
    return result.rows[0]?.id as string;
  }

  it("derives username_search and enforces the username format", async () => {
    const result = await pool.query<{ username_search: string }>(
      "insert into users (token_identifier, username, show_profile_pic) values ('iss|a', 'MixedCase_1', true) returning username_search",
    );
    expect(result.rows[0]?.username_search).toBe("mixedcase_1");
    await expect(
      pool.query(
        "insert into users (token_identifier, username, show_profile_pic) values ('iss|b', 'bad name', true)",
      ),
    ).rejects.toThrow(/users_username_format/);
  });

  it("deduplicates file bytes by hash and checks the recorded size", async () => {
    await insertFile(1);
    await expect(insertFile(1)).rejects.toThrow(/files_sha256_key/);
    await expect(
      pool.query(
        "insert into files (sha256, mime_type, byte_size, bytes) values ($1, 'image/png', 99, $2)",
        [sha(2), Buffer.from("short")],
      ),
    ).rejects.toThrow(/files_byte_size_matches/);
  });

  it("does not delete a file that a row still references", async () => {
    const fileId = await insertFile(3);
    await pool.query(
      "insert into collection (artist_name, animal, link, full_img_file_id) values ('a', 'cat', 'https://example.com', $1)",
      [fileId],
    );
    await expect(
      pool.query("delete from files where id = $1", [fileId]),
    ).rejects.toThrow(/foreign key/);
  });

  it("keeps one unfinished job per dedupe key", async () => {
    const insert = (status: string) =>
      pool.query(
        "insert into jobs (kind, dedupe_key, status) values ('catdex.thumbnail', 'cat-1', $1)",
        [status],
      );
    await insert("pending");
    await expect(insert("pending")).rejects.toThrow(/jobs_active_dedupe_key/);
    await pool.query(
      "update jobs set status = 'done' where dedupe_key = 'cat-1'",
    );
    await expect(insert("pending")).resolves.toBeDefined();
  });

  it("caps the overlay command payload", async () => {
    const user = await pool.query<{ id: string }>(
      "insert into users (token_identifier, show_profile_pic) values ('iss|stream', false) returning id",
    );
    const huge = JSON.stringify({
      type: "spin",
      seq: 1,
      timestamp: 1,
      blob: "x".repeat(1_000_001),
    });
    await expect(
      pool.query(
        "insert into cat_stream_sessions (user_id, status, settings, current_command, test_mode) values ($1, 'idle', '{}', $2, false)",
        [user.rows[0]?.id, huge],
      ),
    ).rejects.toThrow(/cat_stream_sessions_command_size/);
  });

  it("allows one active ban per IP hash", async () => {
    const ban = (active: boolean) =>
      pool.query(
        "insert into quick_share_bans (ip_hash, active, created_by) values ('h1', $1, 'admin')",
        [active],
      );
    await ban(true);
    await expect(ban(true)).rejects.toThrow(/quick_share_bans_active_ip_key/);
    await expect(ban(false)).resolves.toBeDefined();
  });
});
