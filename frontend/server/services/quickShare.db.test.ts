import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import { quickShareJobs, quickShareUploads } from "../db/schema";
import { handleQuickShareOperation } from "./quickShare";

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = createPool(
    readDatabaseConfig("app", { DATABASE_URL: inject("databaseUrl") }),
  );
  db = createDatabase(pool);
});

afterAll(() => pool.end());

const anonymous = { tokenIdentifier: null };

function input(
  slug: string,
  suffix: string,
  extra: Record<string, unknown> = {},
) {
  return {
    slug,
    source: "file",
    originalName: `${suffix}.png`,
    originalSize: 4,
    originalKey: `originals/${suffix}`,
    receiptHash: `receipt-${suffix}`,
    rateIdentity: `ip:${suffix}`,
    ipHash: `hash:${suffix}`,
    rawIp: "192.0.2.1",
    ...extra,
  };
}

describe("Quick Share PostgreSQL service", () => {
  it("runs the upload, part, processing and public-read state machine", async () => {
    const suffix = `state${Date.now()}`;
    const created = await handleQuickShareOperation(
      db,
      "create",
      input("StAtE001", suffix),
      anonymous,
      1_700_000_000_000,
    );
    expect(created.status).toBe(201);
    const uploadId = (created.body as { id: string }).id;

    expect(
      await handleQuickShareOperation(
        db,
        "recordPart",
        {
          uploadId,
          receiptHash: `receipt-${suffix}`,
          partNumber: 1,
          etag: "etag",
          size: 4,
        },
        anonymous,
        1_700_000_000_100,
      ),
    ).toEqual({ status: 200, body: { ok: true } });
    const completed = await handleQuickShareOperation(
      db,
      "complete",
      { uploadId, receiptHash: `receipt-${suffix}` },
      anonymous,
      1_700_000_000_200,
    );
    expect(completed.body).toMatchObject({ id: uploadId, state: "processing" });

    const jobs = await db.select().from(quickShareJobs);
    const mediaJob = jobs.find(
      (job) => job.uploadId === uploadId && job.kind === "process",
    );
    expect(mediaJob).toBeDefined();
    const claimed = await handleQuickShareOperation(
      db,
      "claimJob",
      { jobId: mediaJob?.id, leaseId: "lease-1" },
      anonymous,
      1_700_000_000_300,
    );
    expect(claimed.body).toMatchObject({
      kind: "process",
      jobId: mediaJob?.id,
    });
    const finished = await handleQuickShareOperation(
      db,
      "finishProcess",
      {
        jobId: mediaJob?.id,
        leaseId: "lease-1",
        state: "ready",
        publicKey: `derivatives/${suffix}`,
        publicMime: "image/png",
        publicSize: 4,
      },
      anonymous,
      1_700_000_000_400,
    );
    expect(finished.body).toEqual({ accepted: true });
    const publicRead = await handleQuickShareOperation(
      db,
      "public",
      { slug: "StAtE001" },
      anonymous,
      1_700_000_000_500,
    );
    expect(publicRead).toMatchObject({
      status: 200,
      body: { key: `derivatives/${suffix}`, mime: "image/png", size: 4 },
    });

    await db
      .delete(quickShareUploads)
      .where(eq(quickShareUploads.id, uploadId));
  });

  it("enforces active admission atomically under concurrent requests", async () => {
    const suffix = `race${Date.now()}`;
    const requests = [0, 1, 2].map((index) =>
      handleQuickShareOperation(
        db,
        "create",
        input(`Q${index}ace00${index}`, `${suffix}-${index}`, {
          rateIdentity: `race:${suffix}`,
          ipHash: `race-hash:${suffix}`,
        }),
        anonymous,
        1_700_100_000_000 + index,
      ).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      })),
    );
    const results = await Promise.all(requests);
    expect(
      results.filter((result) => "status" in result && result.status === 201),
    ).toHaveLength(2);
    expect(
      results.filter(
        (result) => "error" in result && result.error === "ACTIVE_LIMIT",
      ),
    ).toHaveLength(1);
  });
});
