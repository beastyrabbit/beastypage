import { and, eq } from "drizzle-orm";
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
    const adminRead = await handleQuickShareOperation(
      db,
      "adminGet",
      { uploadId },
      { tokenIdentifier: "admin" },
      1_700_000_000_600,
      { QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS: "admin" },
    );
    expect(adminRead.body).toMatchObject({
      publicKey: `derivatives/${suffix}`,
      publicMime: "image/png",
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

  it("lets the signed-in owner delete a share to free its active slots", async () => {
    const now = Date.now();
    const owner = `https://clerk.quick-share.test|remove-${now}`;
    const other = { tokenIdentifier: `${owner}-other` };
    // Rows 1 and 2 are one two-file share behind a single link; row 0 is an
    // unfinished upload.
    const slugs = Array.from(
      { length: 25 },
      (_, index) =>
        `R${String(now).slice(-5)}${String(index === 2 ? 1 : index).padStart(2, "0")}`,
    );
    const rows = await db
      .insert(quickShareUploads)
      .values(
        slugs.map((slug, index) => ({
          slug,
          source: "file" as const,
          originalName: `remove-${index}.png`,
          originalSize: 1,
          originalKey: `originals/remove-${now}-${index}`,
          state: index === 0 ? ("uploading" as const) : ("ready" as const),
          publicKey: index === 0 ? null : `derivatives/remove-${now}-${index}`,
          publicMime: index === 0 ? null : "image/png",
          publicSize: index === 0 ? null : 1,
          receiptHash: `remove-receipt-${now}-${index}`,
          ownerTokenIdentifier: owner,
          rateIdentity: `acct:${owner}`,
          ipHash: "remove-ip",
          rawIp: "192.0.2.3",
          publicExpiresAt: new Date(now + 60_000),
          retainedUntil: new Date(now + 120_000),
          active: true,
          createdAt: new Date(now + index),
          updatedAt: new Date(now + index),
        })),
      )
      .returning();
    const create = () =>
      outcome(() =>
        handleQuickShareOperation(
          db,
          "create",
          input(`N${String(now).slice(-7)}`, `remove-new-${now}`, {
            ipHash: "remove-ip",
          }),
          { tokenIdentifier: owner },
          now + 1_000,
        ),
      );
    const blocked = await create();
    expect("error" in blocked && (blocked.error as Error).message).toBe(
      "ACTIVE_LIMIT",
    );

    const target = rows[1];
    const publicLink = () =>
      handleQuickShareOperation(
        db,
        "publicCollection",
        { slug: target.slug },
        anonymous,
        now + 600,
      );
    expect(await publicLink()).toMatchObject({ status: 200 });
    expect((await publicLink()).body).toHaveLength(2);

    await expect(
      handleQuickShareOperation(
        db,
        "remove",
        { uploadId: target.id },
        other,
        now + 500,
      ),
    ).rejects.toThrow("UPLOAD_NOT_AVAILABLE");
    expect(
      await handleQuickShareOperation(
        db,
        "remove",
        { uploadId: target.id },
        anonymous,
        now + 500,
      ),
    ).toMatchObject({ status: 401 });

    // Deleting two files of the same share at once must not deadlock: one
    // request removes the whole share, the other finds it already gone.
    const results = await Promise.all(
      [rows[1], rows[2]].map((row) =>
        outcome(() =>
          handleQuickShareOperation(
            db,
            "remove",
            { uploadId: row.id },
            { tokenIdentifier: owner },
            now + 500,
          ),
        ),
      ),
    );
    const succeeded = results.flatMap((item) =>
      "value" in item && item.value ? [item.value] : [],
    );
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].status).toBe(200);
    expect(
      (succeeded[0].body as { removedIds: string[] }).removedIds.toSorted(),
    ).toEqual([rows[1].id, rows[2].id].toSorted());
    for (const item of results)
      if ("error" in item)
        expect((item.error as Error).message).toBe("UPLOAD_NOT_AVAILABLE");
    const removed = await db
      .select()
      .from(quickShareUploads)
      .where(eq(quickShareUploads.slug, target.slug));
    expect(removed).toHaveLength(2);
    for (const row of removed) {
      expect(row).toMatchObject({ active: false, state: "removed" });
      expect(row.retainedUntil.getTime()).toBe(now + 120_000);
    }
    expect(await publicLink()).toMatchObject({ status: 404 });
    expect(
      await handleQuickShareOperation(
        db,
        "public",
        { slug: target.slug },
        anonymous,
        now + 600,
      ),
    ).toMatchObject({ status: 404 });

    // Removing an unfinished upload frees its slot, and a late completion
    // cannot bring it back.
    await handleQuickShareOperation(
      db,
      "remove",
      { uploadId: rows[0].id },
      { tokenIdentifier: owner },
      now + 500,
    );
    const late = await handleQuickShareOperation(
      db,
      "complete",
      { uploadId: rows[0].id, receiptHash: `remove-receipt-${now}-0` },
      anonymous,
      now + 700,
    );
    expect(late.body).toMatchObject({ state: "removed" });

    const admitted = await create();
    expect("value" in admitted && admitted.value?.status).toBe(201);

    await db
      .delete(quickShareUploads)
      .where(eq(quickShareUploads.ipHash, "remove-ip"));
  });

  it("deletes an owner's older active file hidden behind inactive history", async () => {
    const now = Date.now();
    const owner = `https://clerk.quick-share.test|history-${now}`;
    const slug = `H${String(now).slice(-7)}`;
    const row = (index: number, active: boolean) => ({
      slug,
      source: "file" as const,
      originalName: `history-${index}.png`,
      originalSize: 1,
      originalKey: `originals/history-${now}-${index}`,
      state: active ? ("ready" as const) : ("failed" as const),
      publicKey: `derivatives/history-${now}-${index}`,
      publicMime: "image/png",
      publicSize: 1,
      receiptHash: `history-receipt-${now}-${index}`,
      ownerTokenIdentifier: owner,
      rateIdentity: `acct:${owner}`,
      ipHash: "history-ip",
      rawIp: "192.0.2.4",
      publicExpiresAt: new Date(now + 60_000),
      retainedUntil: new Date(now + 120_000),
      active,
      createdAt: new Date(now + index),
      updatedAt: new Date(now + index),
    });
    // The oldest and newest files are live; 101 failed files sit between.
    const rows = await db
      .insert(quickShareUploads)
      .values([
        row(0, true),
        ...Array.from({ length: 101 }, (_, index) => row(index + 1, false)),
        row(102, true),
      ])
      .returning();
    const newest = rows[rows.length - 1];
    const result = await handleQuickShareOperation(
      db,
      "remove",
      { uploadId: newest.id },
      { tokenIdentifier: owner },
      now + 500,
    );
    expect(
      (result.body as { removedIds: string[] }).removedIds.toSorted(),
    ).toEqual([rows[0].id, newest.id].toSorted());
    expect(
      await handleQuickShareOperation(
        db,
        "publicCollection",
        { slug },
        anonymous,
        now + 600,
      ),
    ).toMatchObject({ status: 404 });
    await db.delete(quickShareUploads).where(eq(quickShareUploads.slug, slug));
  });

  it("never leaves a file admitted during deletion live", async () => {
    const now = Date.now();
    const owner = `https://clerk.quick-share.test|admit-${now}`;
    const slug = `A${String(now).slice(-7)}`;
    const [first] = await db
      .insert(quickShareUploads)
      .values({
        slug,
        source: "file" as const,
        originalName: "admit-0.png",
        originalSize: 1,
        originalKey: `originals/admit-${now}-0`,
        state: "ready" as const,
        receiptHash: `admit-receipt-${now}`,
        ownerTokenIdentifier: owner,
        rateIdentity: `acct:${owner}`,
        ipHash: "admit-ip",
        rawIp: "192.0.2.5",
        publicExpiresAt: new Date(now + 60_000),
        retainedUntil: new Date(now + 120_000),
        active: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning();
    await Promise.all([
      outcome(() =>
        handleQuickShareOperation(
          db,
          "create",
          input(slug, `admit-new-${now}`, {
            collectionReceiptHash: `admit-receipt-${now}`,
            ipHash: "admit-ip",
          }),
          { tokenIdentifier: owner },
          now + 100,
        ),
      ),
      handleQuickShareOperation(
        db,
        "remove",
        { uploadId: first.id },
        { tokenIdentifier: owner },
        now + 100,
      ),
    ]);
    const live = await db
      .select()
      .from(quickShareUploads)
      .where(
        and(
          eq(quickShareUploads.slug, slug),
          eq(quickShareUploads.active, true),
        ),
      );
    expect(live).toEqual([]);
    await db.delete(quickShareUploads).where(eq(quickShareUploads.slug, slug));
  });
});
