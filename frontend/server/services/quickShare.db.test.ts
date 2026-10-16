import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import {
  quickShareJobs,
  quickShareUploads,
  quickShareUsage,
} from "../db/schema";
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

async function outcome<T>(run: () => Promise<T>) {
  try {
    return { value: await run() };
  } catch (error) {
    return { error };
  }
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
    ).toEqual({ status: 200, body: null });
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
      outcome(() =>
        handleQuickShareOperation(
          db,
          "create",
          input(`Q${index}ace00${index}`, `${suffix}-${index}`, {
            rateIdentity: `race:${suffix}`,
            ipHash: `race-hash:${suffix}`,
          }),
          anonymous,
          1_700_100_000_000 + index,
        ),
      ),
    );
    const results = await Promise.all(requests);
    expect(
      results.filter(
        (result) => "value" in result && result.value?.status === 201,
      ),
    ).toHaveLength(2);
    expect(
      results.filter(
        (result) =>
          "error" in result &&
          result.error instanceof Error &&
          result.error.message === "ACTIVE_LIMIT",
      ),
    ).toHaveLength(1);
  });

  it("enforces hourly usage atomically under concurrent requests", async () => {
    const suffix = `usage-race${Date.now()}`;
    const now = 1_700_200_000_000;
    const identity = `usage:${suffix}`;
    const hourStart = new Date(
      Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000,
    );
    await db.insert(quickShareUsage).values({
      identity,
      kind: "hour",
      windowStart: hourStart,
      starts: 9,
      bytes: 0,
      expiresAt: new Date(hourStart.getTime() + 2 * 60 * 60 * 1000),
      updatedAt: new Date(now),
    });
    const results = await Promise.all(
      [0, 1].map((index) =>
        outcome(() =>
          handleQuickShareOperation(
            db,
            "create",
            input(`U${index}${suffix.slice(-6)}`, `${suffix}-${index}`, {
              rateIdentity: identity,
            }),
            anonymous,
            now + index,
          ),
        ),
      ),
    );
    expect(
      results.filter(
        (result) => "value" in result && result.value?.status === 201,
      ),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          "error" in result &&
          result.error instanceof Error &&
          result.error.message === "HOURLY_LIMIT",
      ),
    ).toHaveLength(1);
    await db
      .delete(quickShareUploads)
      .where(eq(quickShareUploads.rateIdentity, identity));
    await db
      .delete(quickShareUsage)
      .where(eq(quickShareUsage.identity, identity));
  });

  it("admits owned collections and preserves public collection ordering", async () => {
    const now = Date.now();
    const owner = {
      tokenIdentifier: `https://clerk.quick-share.test|collection-${now}`,
    };
    const slug = `C${String(now).slice(-7)}`;
    const first = await handleQuickShareOperation(
      db,
      "create",
      input(slug, `collection-first-${now}`),
      owner,
      now,
    );
    const firstId = (first.body as { id: string }).id;
    const firstReceipt = `receipt-collection-first-${now}`;
    await db
      .update(quickShareUploads)
      .set({
        receiptHash: firstReceipt,
        rateIdentity: `acct:${owner.tokenIdentifier}`,
        ipHash: "collection-ip",
      })
      .where(eq(quickShareUploads.id, firstId));

    const second = await handleQuickShareOperation(
      db,
      "create",
      input(slug, `collection-second-${now}`, {
        collectionReceiptHash: firstReceipt,
        ipHash: "collection-ip",
      }),
      owner,
      now + 1,
    );
    expect(second.status).toBe(201);
    const stranger = await outcome(() =>
      handleQuickShareOperation(
        db,
        "create",
        input(slug, `collection-stranger-${now}`, {
          collectionReceiptHash: firstReceipt,
          ipHash: "collection-ip",
        }),
        { tokenIdentifier: null },
        now + 2,
      ),
    );
    if (!("error" in stranger)) throw new Error("expected stranger denial");
    expect(stranger.error).toBeInstanceOf(Error);
    expect((stranger.error as Error).message).toBe("SLUG_COLLISION");

    const publicSlug = `P${String(now).slice(-7)}`;
    await db.insert(quickShareUploads).values([
      {
        slug: publicSlug,
        source: "file",
        originalName: "old.png",
        originalSize: 1,
        originalKey: "originals/public-old",
        state: "uploading",
        receiptHash: `old-${now}`,
        rateIdentity: `public-${now}`,
        ipHash: `public-ip-${now}`,
        rawIp: "192.0.2.1",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
      {
        slug: publicSlug,
        source: "file",
        originalName: "new.png",
        originalSize: 1,
        originalKey: "originals/public-new",
        publicKey: "derivatives/public-new",
        publicMime: "image/png",
        publicSize: 1,
        state: "ready",
        receiptHash: `new-${now}`,
        rateIdentity: `public-${now}`,
        ipHash: `public-ip-${now}`,
        rawIp: "192.0.2.1",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now + 1),
        updatedAt: new Date(now + 1),
      },
      {
        slug: publicSlug,
        source: "file",
        originalName: "newest.png",
        originalSize: 1,
        originalKey: "originals/public-newest",
        publicKey: "derivatives/public-newest",
        publicMime: "image/png",
        publicSize: 1,
        state: "ready",
        receiptHash: `newest-${now}`,
        rateIdentity: `public-${now}`,
        ipHash: `public-ip-${now}`,
        rawIp: "192.0.2.1",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now + 2),
        updatedAt: new Date(now + 2),
      },
      {
        slug: publicSlug,
        source: "file",
        originalName: "incomplete.png",
        originalSize: 1,
        originalKey: "originals/public-incomplete",
        state: "ready",
        receiptHash: `incomplete-${now}`,
        rateIdentity: `public-${now}`,
        ipHash: `public-ip-${now}`,
        rawIp: "192.0.2.1",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now + 3),
        updatedAt: new Date(now + 3),
      },
    ]);
    const firstRead = await handleQuickShareOperation(
      db,
      "public",
      { slug: publicSlug },
      anonymous,
      now + 2,
    );
    expect(firstRead.status).toBe(404);
    const collectionRead = await handleQuickShareOperation(
      db,
      "publicCollection",
      { slug: publicSlug },
      anonymous,
      now + 2,
    );
    expect(collectionRead.body).toEqual([
      expect.objectContaining({ key: "derivatives/public-new" }),
      expect.objectContaining({ key: "derivatives/public-newest" }),
    ]);

    await db.delete(quickShareUploads).where(eq(quickShareUploads.slug, slug));
    await db
      .delete(quickShareUploads)
      .where(eq(quickShareUploads.slug, publicSlug));
  });

  it("returns COLLECTION_LIMIT after one hundred active retained items", async () => {
    const now = Date.now();
    const slug = `L${String(now).slice(-7)}`;
    const owner = `https://clerk.quick-share.test|limit-${now}`;
    await db.insert(quickShareUploads).values(
      Array.from({ length: 100 }, (_, index) => ({
        slug,
        source: "file" as const,
        originalName: `limit-${index}.png`,
        originalSize: 1,
        originalKey: `originals/limit-${now}-${index}`,
        state: "ready" as const,
        receiptHash:
          index === 0 ? `limit-receipt-${now}` : `limit-other-${now}-${index}`,
        ownerTokenIdentifier: owner,
        rateIdentity: `acct:${owner}`,
        ipHash: "limit-ip",
        rawIp: "192.0.2.2",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 60_000),
        active: true,
        createdAt: new Date(now + index),
        updatedAt: new Date(now + index),
      })),
    );
    const result = await outcome(() =>
      handleQuickShareOperation(
        db,
        "create",
        input(slug, `limit-new-${now}`, {
          collectionReceiptHash: `limit-receipt-${now}`,
          ipHash: "limit-ip",
        }),
        { tokenIdentifier: owner },
        now + 1_000,
      ),
    );
    if (!("error" in result)) throw new Error("expected collection limit");
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe("COLLECTION_LIMIT");
    await db.delete(quickShareUploads).where(eq(quickShareUploads.slug, slug));
  });
});
