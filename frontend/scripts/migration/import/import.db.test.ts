import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../../../server/db/config";
import { runMigrations } from "../../../server/db/migrator";
import { createPool } from "../../../server/db/pool";
import { verifyImport } from "../verify-import";
import {
  buildFixture,
  FIXTURE_FREEZE,
  FIXTURE_ISSUER,
  fixtureId,
  writeFixtureArchive,
} from "./fixture";
import { disableNetwork } from "./guards";
import { importedFileId, importedId } from "./ids";
import {
  assertOutsideRepository,
  type ImportReport,
  runImport,
  tableFingerprints,
} from "./run";

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
// Archives and reports hold personal data in production; tests keep them outside the repo too.
const work = mkdtempSync(join(tmpdir(), "beastypage-import-test-"));
const archivePath = join(work, "snapshot_1760529600000000000.zip");
const originalFetch = globalThis.fetch;

let adminPool: pg.Pool;
let scratchName: string;
let pool: pg.Pool;

async function withClient<T>(
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

function importOnce(
  options: { replace?: boolean; archive?: string; failAfter?: string } = {},
) {
  return withClient((client) =>
    runImport(client, {
      archivePath: options.archive ?? archivePath,
      reportDir: join(work, "report"),
      freezeAt: FIXTURE_FREEZE,
      expectedIssuer: FIXTURE_ISSUER,
      replace: options.replace ?? false,
      repoRoot: REPO_ROOT,
      log: (line) => {
        if (
          options.failAfter &&
          line.startsWith(`[import] ${options.failAfter}:`)
        ) {
          throw new Error("simulated crash");
        }
      },
    }),
  );
}

beforeAll(async () => {
  disableNetwork();
  await writeFixtureArchive(archivePath);
  const url = new URL(inject("databaseUrl"));
  adminPool = createPool(
    readDatabaseConfig("migrate", { DATABASE_URL: url.toString() }),
  );
  scratchName = `beastypage_import_${randomBytes(4).toString("hex")}`;
  await adminPool.query(`create database ${scratchName}`);
  url.pathname = `/${scratchName}`;
  pool = createPool(
    readDatabaseConfig("import", {
      DATABASE_URL: url.toString(),
      DATABASE_POOL_MAX: "2",
    }),
  );
  await withClient((client) => runMigrations(client, "import-test"));
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await pool.end();
  await adminPool.query(`drop database if exists ${scratchName} with (force)`);
  await adminPool.end();
  rmSync(work, { recursive: true, force: true });
});

describe("Convex importer", () => {
  let first: ImportReport;

  it("imports the fixture without network access", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(/disabled/);
    first = await importOnce();
    expect(first.ok).toBe(true);
    expect(first.manifest.tables).toContain("user_search_migrations");
  });

  it("counts every outcome per table", () => {
    const s = first.steps;
    expect(s.users).toMatchObject({ documents: 3, imported: 2 });
    expect(s.users?.quarantined).toEqual({
      "tokenIdentifier: issued by an unexpected identity provider": 1,
    });
    expect(s.catdex?.imported).toBe(1);
    expect(Object.keys(s.catdex?.quarantined ?? {})).toEqual(
      expect.arrayContaining([
        "approved: expected boolean",
        "seasonId: dangling reference to card_season",
      ]),
    );
    expect(s.catdex_uploads?.skipped).toEqual({ "expired at freeze": 1 });
    expect(s.collection?.quarantined).toEqual({
      "fullImgStorageId: storage object missing or quarantined": 1,
    });
    expect(s.cat_profile?.quarantined).toEqual({
      "constraint cat_profile_slug_key": 1,
    });
    expect(s.cat_profile?.repaired).toEqual({
      "adoptionBatchId: dangling adoption_batch reference set to null": 1,
    });
    expect(s.perfect_matchups?.skipped).toEqual({ "already consumed": 1 });
    expect(s.perfect_cats?.repaired).toEqual({
      "lastShownAt 0 (never shown) set to null": 1,
    });
    expect(s.discord_challenge?.skipped).toEqual({ "expired at freeze": 1 });
    expect(s.quick_share_parts?.skipped).toEqual({
      "upload no longer uploading": 1,
    });
    expect(s.quick_share_jobs?.repaired).toEqual({
      "leased job returned to pending": 1,
    });
    expect(s.quick_share_usage?.skipped).toEqual({
      "window closed at freeze": 1,
    });
    expect(s.user_variants?.quarantined).toEqual({
      "toolKey: expected singleCatPlus | pixelator | dash": 1,
    });
    expect(s.stream_votes?.repaired).toEqual({
      "votedBy: dangling stream_participants reference set to null": 1,
    });
    expect(
      Object.values(first.verification).every((v) => v.expected === v.actual),
    ).toBe(true);
  });

  it("verifies, deduplicates and quarantines files", async () => {
    const files = first.steps.files;
    expect(files?.imported).toBe(3);
    expect(files?.repaired).toEqual({
      "duplicate bytes share one file": 1,
      "content type image/png corrected to detected image/jpeg": 1,
    });
    expect(files?.skipped).toEqual({ "unreferenced storage object": 1 });
    expect(Object.keys(files?.quarantined ?? {}).join(" ")).toMatch(
      /content type text\/plain|not a decodable image/,
    );
    const rows = await pool.query<{
      mime_type: string;
      width: number;
      height: number;
      byte_size: number;
    }>(
      "select mime_type, width, height, byte_size from files order by width desc",
    );
    expect(rows.rows.map((r) => [r.mime_type, r.width, r.height])).toEqual([
      ["image/png", 4, 3],
      ["image/jpeg", 3, 3],
      ["image/png", 2, 2],
    ]);
  });

  it("rewrites references, embedded ids and the nested palette storage id", async () => {
    const profile = importedId("cat_profile", fixtureId("profile-1"));
    const batch = await pool.query("select id, settings from adoption_batch");
    expect(batch.rows[0]?.settings.starter.profileId).toBe(profile);
    const cats = await pool.query(
      "select position, profile_id from adoption_batch_cats order by position",
    );
    expect(cats.rows).toEqual([
      { position: 0, profile_id: profile },
      { position: 1, profile_id: null },
    ]);
    const palette = await pool.query(
      "select config, image_file_id from palette_generator_settings",
    );
    expect(palette.rows[0]?.config).not.toHaveProperty("imageStorageId");
    expect(palette.rows[0]?.image_file_id).toBeTruthy();
    const card = await pool.query("select default_card_file_id from catdex");
    const season = await pool.query(
      "select card_back_file_id from card_season",
    );
    expect(card.rows[0]?.default_card_file_id).toBe(
      season.rows[0]?.card_back_file_id,
    );
    const tree = await pool.query("select cats from ancestry_tree");
    expect(tree.rows[0]?.cats[0].historyProfileId).toBe(profile);
    const vote = await pool.query(
      "select option_meta from stream_votes where voted_by is not null",
    );
    expect(vote.rows[0]?.option_meta.participantId).toBe(
      importedId("stream_participants", fixtureId("participant-1")),
    );
  });

  it("keeps timestamps, legacy ids and generated columns", async () => {
    const user = await pool.query(
      "select legacy_id, legacy_created_at, created_at, username_search from users where username = 'Ann_1'",
    );
    expect(user.rows[0]).toMatchObject({
      legacy_id: fixtureId("user-ann"),
      username_search: "ann_1",
    });
    expect(user.rows[0]?.created_at).toEqual(
      new Date("2026-01-02T03:04:05.000Z"),
    );
    // Timestamp columns align with Convex/JS Date millisecond precision.
    const micros = await pool.query<{ us: string }>(
      "select extract(microseconds from legacy_created_at)::text as us from users where username = 'Ann_1'",
    );
    expect(micros.rows[0]?.us).toBe("5000000");
  });

  it("resets live OBS state but keeps the streamer settings", async () => {
    const obs = await pool.query(
      "select status, current_command, batch_state, settings from cat_stream_sessions",
    );
    expect(obs.rows[0]).toMatchObject({
      status: "idle",
      current_command: null,
      batch_state: null,
    });
    expect(obs.rows[0]?.settings.overlayTheme).toBe("field-guide");
  });

  it("writes a private report and per-step quarantine files", () => {
    const report = readFileSync(join(work, "report", "report.md"), "utf8");
    expect(report).toContain("Result: OK");
    const quarantined = readFileSync(
      join(work, "report", "quarantine", "catdex.jsonl"),
      "utf8",
    );
    expect(quarantined.trim().split("\n")).toHaveLength(2);
  });

  it("produces an identical database on a second run", async () => {
    const before = await withClient((client) => tableFingerprints(client));
    const second = await importOnce();
    expect(second.fingerprints).toEqual(before);
    expect(second.steps).toEqual(first.steps);
  });

  it("resumes after a crash and ends identical to a clean import", async () => {
    await expect(
      importOnce({ replace: true, failAfter: "cat_profile" }),
    ).rejects.toThrow("simulated crash");
    const partial = await pool.query(
      "select count(*)::int as n from import_checkpoints",
    );
    expect(partial.rows[0]?.n).toBeGreaterThan(0);
    const resumed = await importOnce();
    expect(resumed.ok).toBe(true);
    expect(resumed.fingerprints).toEqual(first.fingerprints);
  });

  it("refuses a different archive unless --replace is given", async () => {
    const other = join(work, "other.zip");
    const fixture = await buildFixture();
    fixture.tables.rarity = [];
    await writeFixtureArchive(other, fixture);
    await expect(importOnce({ archive: other })).rejects.toThrow(
      /different archive/,
    );
  });

  it("refuses archive and report locations inside the repository", () => {
    expect(() =>
      assertOutsideRepository(
        join(REPO_ROOT, "frontend", "x.zip"),
        REPO_ROOT,
        "The archive",
      ),
    ).toThrow(/outside the repository/);
    expect(() =>
      assertOutsideRepository(work, REPO_ROOT, "The archive"),
    ).not.toThrow();
  });

  it("uses content-addressed file ids", async () => {
    const ids = await pool.query<{ id: string; sha256: string }>(
      "select id, sha256 from files",
    );
    for (const row of ids.rows) expect(row.id).toBe(importedFileId(row.sha256));
  });

  it("verifies the fixture and catches a corrupted row", async () => {
    const verified = await withClient((client) =>
      verifyImport(client, archivePath, first),
    );
    expect(verified.ok).toBe(true);

    await pool.query(
      "update users set username = 'Corrupted' where username = 'Ann_1'",
    );
    try {
      const corrupted = await withClient((client) =>
        verifyImport(client, archivePath, first),
      );
      expect(corrupted.ok).toBe(false);
      expect(
        corrupted.mismatches.some(
          (item) => item.check === "fingerprint" || item.check === "sample",
        ),
      ).toBe(true);
    } finally {
      await pool.query(
        "update users set username = 'Ann_1' where username = 'Corrupted'",
      );
    }
  });
});
