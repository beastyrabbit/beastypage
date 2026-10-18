/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readDatabaseConfig } from "../db/config";
import { createDatabase, createPool, type Database } from "../db/pool";
import {
  quickShareJobs,
  quickShareUploads,
  quickShareUsage,
} from "../db/schema";
import { handleQuickShareOperation } from "./quickShare";

const modules = import.meta.glob("../../convex/**/*.ts");
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

function uploadArgs(
  slug: string,
  suffix: string,
  extra: Record<string, unknown> = {},
) {
  return {
    slug,
    source: "file" as const,
    originalName: `${suffix}.png`,
    originalSize: 4,
    originalKey: `originals/${suffix}`,
    receiptHash: `receipt-${suffix}`,
    rateIdentity: `ip:${suffix}`,
    ipHash: `hash:${suffix}`,
    rawIp: "192.0.2.30",
    tier: "anonymous" as const,
    now: 1_800_000_000_000,
    ...extra,
  };
}

async function expectError(run: () => Promise<unknown>, message: string) {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain(message);
}

describe("Quick Share operation parity", () => {
  it("covers the upload, collection, worker, account, moderation and retention protocol", async () => {
    const t = convexTest(schema, modules);
    const prefix = `parity${Date.now()}`;
    const slug = `Q${prefix.slice(-7)}`;
    const now = 1_800_000_000_000;
    const cCreated = await t.mutation(
      internal.quickShare.createUpload,
      uploadArgs(slug, `${prefix}-primary`),
    );
    const pCreated = await handleQuickShareOperation(
      db,
      "create",
      uploadArgs(slug, `${prefix}-primary`),
      anonymous,
      now,
    );
    expect(pCreated.status).toBe(201);
    const pUploadId = (pCreated.body as { id: string }).id;

    const cRead = await t.query(internal.quickShare.getUpload, {
      uploadId: cCreated.id,
      receiptHash: `receipt-${prefix}-primary`,
    });
    const pRead = await handleQuickShareOperation(
      db,
      "getUpload",
      { uploadId: pUploadId, receiptHash: `receipt-${prefix}-primary` },
      anonymous,
      now,
    );
    expect(cRead).toMatchObject({ slug, state: "uploading", parts: [] });
    expect(pRead).toMatchObject({
      status: 200,
      body: { slug, state: "uploading", parts: [] },
    });
    expect(
      await t.query(internal.quickShare.getUpload, {
        uploadId: cCreated.id,
        receiptHash: "wrong-receipt",
      }),
    ).toBeNull();
    expect(
      await handleQuickShareOperation(
        db,
        "getUpload",
        { uploadId: pUploadId, receiptHash: "wrong-receipt" },
        anonymous,
        now,
      ),
    ).toEqual({ status: 404, body: { error: "Not found" } });

    await expectError(
      () =>
        t.mutation(internal.quickShare.recordPart, {
          uploadId: cCreated.id,
          receiptHash: "wrong",
          partNumber: 0,
          etag: "etag",
          size: 4,
          now,
        }),
      "INVALID_PART",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "recordPart",
          {
            uploadId: pUploadId,
            receiptHash: `receipt-${prefix}-primary`,
            partNumber: 0,
            etag: "etag",
            size: 4,
          },
          anonymous,
          now,
        ),
      "INVALID_PART",
    );
    await t.mutation(internal.quickShare.recordPart, {
      uploadId: cCreated.id,
      receiptHash: `receipt-${prefix}-primary`,
      partNumber: 1,
      etag: "etag",
      size: 4,
      now,
    });
    await handleQuickShareOperation(
      db,
      "recordPart",
      {
        uploadId: pUploadId,
        receiptHash: `receipt-${prefix}-primary`,
        partNumber: 1,
        etag: "etag",
        size: 4,
      },
      anonymous,
      now,
    );

    const cCompleted = await t.mutation(internal.quickShare.markComplete, {
      uploadId: cCreated.id,
      receiptHash: `receipt-${prefix}-primary`,
      now,
    });
    const pCompleted = await handleQuickShareOperation(
      db,
      "complete",
      { uploadId: pUploadId, receiptHash: `receipt-${prefix}-primary` },
      anonymous,
      now,
    );
    expect(cCompleted).toMatchObject({ state: "processing" });
    expect(pCompleted).toMatchObject({
      status: 200,
      body: { state: "processing" },
    });

    const [pProcessJob] = await db
      .select()
      .from(quickShareJobs)
      .where(eq(quickShareJobs.uploadId, pUploadId));
    if (!pProcessJob) throw new Error("PostgreSQL process job missing");
    const cProcessJob = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_jobs")
        .withIndex("by_uploadId_and_kind", (q) =>
          q.eq("uploadId", cCreated.id).eq("kind", "process"),
        )
        .unique(),
    );
    if (!cProcessJob) throw new Error("Convex process job missing");
    const cClaimed = await t.mutation(internal.quickShare.claimJob, {
      jobId: cProcessJob?._id,
      leaseId: "parity-lease",
      now,
    });
    const pClaimed = await handleQuickShareOperation(
      db,
      "claimJob",
      { jobId: pProcessJob.id, leaseId: "parity-lease" },
      anonymous,
      now,
    );
    expect(cClaimed).toMatchObject({ kind: "process", attempts: 1 });
    expect(pClaimed).toMatchObject({
      status: 200,
      body: { kind: "process", attempts: 1 },
    });

    const cFinished = await t.mutation(internal.quickShare.finishProcessJob, {
      jobId: cProcessJob?._id,
      leaseId: "parity-lease",
      state: "ready",
      publicKey: `derivatives/${prefix}-primary`,
      publicMime: "image/png",
      publicSize: 4,
      now,
    });
    const pFinished = await handleQuickShareOperation(
      db,
      "finishProcess",
      {
        jobId: pProcessJob.id,
        leaseId: "parity-lease",
        state: "ready",
        publicKey: `derivatives/${prefix}-primary`,
        publicMime: "image/png",
        publicSize: 4,
      },
      anonymous,
      now,
    );
    expect(cFinished).toEqual({ accepted: true });
    expect(pFinished).toEqual({ status: 200, body: { accepted: true } });

    const cPublic = await t.query(internal.quickShare.getPublicUpload, {
      slug,
      now,
    });
    const pPublic = await handleQuickShareOperation(
      db,
      "public",
      { slug },
      anonymous,
      now,
    );
    expect(cPublic).toMatchObject({ mime: "image/png", size: 4 });
    expect(pPublic).toMatchObject({
      status: 200,
      body: { mime: "image/png", size: 4 },
    });

    const cSecond = await t.mutation(internal.quickShare.createUpload, {
      ...uploadArgs(slug, `${prefix}-second`, {
        rateIdentity: `ip:${prefix}-primary`,
        ipHash: `hash:${prefix}-primary`,
      }),
      collectionReceiptHash: `receipt-${prefix}-primary`,
    });
    const pSecond = await handleQuickShareOperation(
      db,
      "create",
      {
        ...uploadArgs(slug, `${prefix}-second`, {
          rateIdentity: `ip:${prefix}-primary`,
          ipHash: `hash:${prefix}-primary`,
        }),
        collectionReceiptHash: `receipt-${prefix}-primary`,
      },
      anonymous,
      now + 1,
    );
    expect(cSecond.slug).toBe(slug);
    expect(pSecond.status).toBe(201);
    await expectError(
      () =>
        t.mutation(internal.quickShare.createUpload, {
          ...uploadArgs(slug, `${prefix}-stranger`),
          collectionReceiptHash: `receipt-${prefix}-primary`,
          rateIdentity: `stranger:${prefix}`,
          ipHash: `stranger:${prefix}`,
        }),
      "SLUG_COLLISION",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "create",
          {
            ...uploadArgs(slug, `${prefix}-stranger`),
            collectionReceiptHash: `receipt-${prefix}-primary`,
            rateIdentity: `stranger:${prefix}`,
            ipHash: `stranger:${prefix}`,
          },
          anonymous,
          now + 2,
        ),
      "SLUG_COLLISION",
    );
    const cCollection = await t.query(internal.quickShare.getPublicCollection, {
      slug,
      now: now + 2,
    });
    const pCollection = await handleQuickShareOperation(
      db,
      "publicCollection",
      { slug },
      anonymous,
      now + 2,
    );
    expect(cCollection.length).toBeGreaterThan(0);
    expect(pCollection.status).toBe(200);
    expect(
      (pCollection.body as Array<{ key: string }>).map((item) => item.key),
    ).toContain(`derivatives/${prefix}-primary`);

    const owner = "https://clerk.quick-share.test|parity-owner";
    const cOwner = await t.mutation(internal.quickShare.createUpload, {
      ...uploadArgs(`O${prefix.slice(-7)}`, `${prefix}-owner`),
      ownerTokenIdentifier: owner,
      rateIdentity: `acct:${owner}`,
      tier: "signedIn",
      originalSize: 300 * 1024 * 1024,
    });
    const pOwner = await handleQuickShareOperation(
      db,
      "create",
      {
        ...uploadArgs(`O${prefix.slice(-7)}`, `${prefix}-owner`),
        originalSize: 300 * 1024 * 1024,
      },
      { tokenIdentifier: owner },
      now,
    );
    const cExtended = await t.mutation(internal.quickShare.extendUpload, {
      uploadId: cOwner.id,
      ownerTokenIdentifier: owner,
      now: now + 1,
    });
    const pExtended = await handleQuickShareOperation(
      db,
      "extend",
      { uploadId: (pOwner.body as { id: string }).id },
      { tokenIdentifier: owner },
      now + 1,
    );
    expect(cExtended.extendedAt).toBe(now + 1);
    expect(pExtended.status).toBe(200);
    await expectError(
      () =>
        t.mutation(internal.quickShare.extendUpload, {
          uploadId: cOwner.id,
          ownerTokenIdentifier: "https://clerk.quick-share.test|other",
          now: now + 2,
        }),
      "UPLOAD_NOT_AVAILABLE",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "extend",
          { uploadId: (pOwner.body as { id: string }).id },
          { tokenIdentifier: "https://clerk.quick-share.test|other" },
          now + 2,
        ),
      "UPLOAD_NOT_AVAILABLE",
    );
    await expectError(
      () =>
        t.mutation(internal.quickShare.extendUpload, {
          uploadId: cOwner.id,
          ownerTokenIdentifier: owner,
          now: now + 2,
        }),
      "NOT_EXTENDABLE",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "extend",
          { uploadId: (pOwner.body as { id: string }).id },
          { tokenIdentifier: owner },
          now + 2,
        ),
      "NOT_EXTENDABLE",
    );
    const cAccount = await t.query(internal.quickShare.accountUploads, {
      ownerTokenIdentifier: owner,
      now: now + 1,
    });
    const pAccount = await handleQuickShareOperation(
      db,
      "accountList",
      {},
      { tokenIdentifier: owner },
      now + 1,
    );
    expect(cAccount.length).toBeGreaterThan(0);
    expect(pAccount.status).toBe(200);
    expect((pAccount.body as unknown[]).length).toBeGreaterThan(0);

    const cImport = await t.mutation(internal.quickShare.createUpload, {
      ...uploadArgs(`I${prefix.slice(-7)}`, `${prefix}-import`),
      source: "url",
      originalSize: 250 * 1024 * 1024,
      importReservedBytes: 250 * 1024 * 1024,
    });
    const pImport = await handleQuickShareOperation(
      db,
      "create",
      {
        ...uploadArgs(`I${prefix.slice(-7)}`, `${prefix}-import`),
        source: "url",
        originalSize: 250 * 1024 * 1024,
        importReservedBytes: 250 * 1024 * 1024,
      },
      anonymous,
      now,
    );
    const cImported = await t.mutation(internal.quickShare.finishImport, {
      uploadId: cImport.id,
      receiptHash: `receipt-${prefix}-import`,
      originalName: "imported.png",
      originalSize: 4,
      now: now + 1,
    });
    const pImported = await handleQuickShareOperation(
      db,
      "finishImport",
      {
        uploadId: (pImport.body as { id: string }).id,
        receiptHash: `receipt-${prefix}-import`,
        originalName: "imported.png",
        originalSize: 4,
      },
      anonymous,
      now + 1,
    );
    expect(cImported.state).toBe("processing");
    expect(pImported).toMatchObject({
      status: 200,
      body: { state: "processing" },
    });

    const cFailedImport = await t.mutation(internal.quickShare.createUpload, {
      ...uploadArgs(`F${prefix.slice(-7)}`, `${prefix}-failed-import`),
      source: "url",
      originalSize: 250 * 1024 * 1024,
      importReservedBytes: 250 * 1024 * 1024,
    });
    const pFailedImport = await handleQuickShareOperation(
      db,
      "create",
      {
        ...uploadArgs(`F${prefix.slice(-7)}`, `${prefix}-failed-import`),
        source: "url",
        originalSize: 250 * 1024 * 1024,
        importReservedBytes: 250 * 1024 * 1024,
      },
      anonymous,
      now,
    );
    await t.mutation(internal.quickShare.failImport, {
      uploadId: cFailedImport.id,
      receiptHash: `receipt-${prefix}-failed-import`,
      now: now + 1,
    });
    const pFailed = await handleQuickShareOperation(
      db,
      "failImport",
      {
        uploadId: (pFailedImport.body as { id: string }).id,
        receiptHash: `receipt-${prefix}-failed-import`,
      },
      anonymous,
      now + 1,
    );
    expect(pFailed).toEqual({ status: 200, body: null });

    const admin = { tokenIdentifier: "https://clerk.quick-share.test|admin" };
    const env = { QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS: admin.tokenIdentifier };
    const cAdmin = await t.query(internal.quickShare.adminList, { slug });
    const pAdmin = await handleQuickShareOperation(
      db,
      "adminList",
      { slug },
      admin,
      now,
      env,
    );
    expect(cAdmin.length).toBeGreaterThan(0);
    expect((pAdmin.body as unknown[]).length).toBeGreaterThan(0);
    const pAdminGet = await handleQuickShareOperation(
      db,
      "adminGet",
      { uploadId: pUploadId },
      admin,
      now,
      env,
    );
    const cAdminGet = await t.query(internal.quickShare.adminGet, {
      uploadId: cCreated.id,
    });
    expect(cAdminGet).toMatchObject({ id: cCreated.id, slug });
    expect(pAdminGet.status).toBe(200);
    await t.mutation(internal.quickShare.banIp, {
      ipHash: `banned-${prefix}`,
      rawIp: "192.0.2.31",
      createdBy: admin.tokenIdentifier,
      now,
    });
    const pBan = await handleQuickShareOperation(
      db,
      "adminBan",
      { ipHash: `banned-${prefix}`, rawIp: "192.0.2.31" },
      admin,
      now,
      env,
    );
    expect(pBan).toEqual({ status: 200, body: null });
    await expectError(
      () =>
        t.mutation(internal.quickShare.createUpload, {
          ...uploadArgs(`B${prefix.slice(-7)}`, `${prefix}-banned`),
          ipHash: `banned-${prefix}`,
        }),
      "IP_BANNED",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "create",
          {
            ...uploadArgs(`B${prefix.slice(-7)}`, `${prefix}-banned`),
            ipHash: `banned-${prefix}`,
          },
          anonymous,
          now,
        ),
      "IP_BANNED",
    );
    await t.mutation(internal.quickShare.unbanIp, {
      ipHash: `banned-${prefix}`,
      now: now + 1,
    });
    const pUnban = await handleQuickShareOperation(
      db,
      "adminUnban",
      { ipHash: `banned-${prefix}` },
      admin,
      now + 1,
      env,
    );
    expect(pUnban).toEqual({ status: 200, body: null });

    await t.mutation(internal.quickShare.removeUpload, {
      uploadId: cCreated.id,
      now: now + 2,
    });
    const pRemoved = await handleQuickShareOperation(
      db,
      "adminRemove",
      { uploadId: pUploadId },
      admin,
      now + 2,
      env,
    );
    expect(pRemoved).toEqual({ status: 200, body: null });
    const [pDeleteJob] = (await db.select().from(quickShareJobs)).filter(
      (job) => job.uploadId === pUploadId && job.kind === "delete",
    );
    if (!pDeleteJob) throw new Error("PostgreSQL delete job missing");
    const cDeleteJob = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_jobs")
        .withIndex("by_uploadId_and_kind", (q) =>
          q.eq("uploadId", cCreated.id).eq("kind", "delete"),
        )
        .unique(),
    );
    if (!cDeleteJob) throw new Error("Convex delete job missing");
    await t.mutation(internal.quickShare.claimJob, {
      jobId: cDeleteJob?._id,
      leaseId: "delete-lease",
      now: now + 3,
    });
    await handleQuickShareOperation(
      db,
      "claimJob",
      { jobId: pDeleteJob.id, leaseId: "delete-lease" },
      anonymous,
      now + 3,
    );
    await t.mutation(internal.quickShare.finishDeleteJob, {
      jobId: cDeleteJob?._id,
      leaseId: "delete-lease",
    });
    const pDeleted = await handleQuickShareOperation(
      db,
      "finishDelete",
      { jobId: pDeleteJob.id, leaseId: "delete-lease" },
      anonymous,
      now + 3,
    );
    expect(pDeleted).toEqual({ status: 200, body: null });
    expect(
      await t.query(internal.quickShare.adminGet, { uploadId: cCreated.id }),
    ).toBeNull();
    expect(
      (
        await handleQuickShareOperation(
          db,
          "adminGet",
          { uploadId: pUploadId },
          admin,
          now,
          env,
        )
      ).status,
    ).toBe(404);
  });

  it("matches collection, usage and ban admission errors on both backends", async () => {
    const t = convexTest(schema, modules);
    const prefix = `limits${Date.now()}`;
    const now = 1_800_100_000_000;
    const ownerIdentity = `ip:${prefix}-collection`;
    const ownerIp = `hash:${prefix}-collection`;
    const collectionSlug = `L${prefix.slice(-7)}`;
    const collectionReceipt = `receipt-${prefix}-collection`;
    const collectionRows = Array.from({ length: 100 }, (_, index) => ({
      slug: collectionSlug,
      source: "file" as const,
      originalName: `collection-${index}.png`,
      originalSize: 4,
      originalKey: `originals/${prefix}-collection-${index}`,
      state: "ready" as const,
      receiptHash: collectionReceipt,
      rateIdentity: ownerIdentity,
      ipHash: ownerIp,
      rawIp: "192.0.2.40",
      publicKey: `derivatives/${prefix}-collection-${index}`,
      publicMime: "image/png",
      publicSize: 4,
      publicExpiresAt: now + 60_000,
      retainedUntil: now + 60_000,
      active: true,
      createdAt: now + index,
      updatedAt: now + index,
    }));
    await t.run((ctx) =>
      Promise.all(
        collectionRows.map((row) => ctx.db.insert("quick_share_uploads", row)),
      ),
    );
    await db.insert(quickShareUploads).values(
      collectionRows.map((row) => ({
        ...row,
        publicExpiresAt: new Date(row.publicExpiresAt),
        retainedUntil: new Date(row.retainedUntil),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      })),
    );
    const collectionInput = uploadArgs(
      collectionSlug,
      `${prefix}-collection-new`,
      {
        collectionReceiptHash: collectionReceipt,
        rateIdentity: ownerIdentity,
        ipHash: ownerIp,
      },
    );
    await expectError(
      () =>
        t.mutation(internal.quickShare.createUpload, {
          ...collectionInput,
          collectionReceiptHash: collectionReceipt,
        }),
      "COLLECTION_LIMIT",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "create",
          collectionInput,
          { tokenIdentifier: null },
          now,
        ),
      "COLLECTION_LIMIT",
    );

    const hourIdentity = `ip:${prefix}-hour`;
    const hourStart = Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000;
    await t.run((ctx) =>
      ctx.db.insert("quick_share_usage", {
        identity: hourIdentity,
        kind: "hour",
        windowStart: hourStart,
        starts: 10,
        bytes: 0,
        expiresAt: hourStart + 2 * 60 * 60 * 1000,
        updatedAt: now,
      }),
    );
    await db.insert(quickShareUsage).values({
      identity: hourIdentity,
      kind: "hour",
      windowStart: new Date(hourStart),
      starts: 10,
      bytes: 0,
      expiresAt: new Date(hourStart + 2 * 60 * 60 * 1000),
      updatedAt: new Date(now),
    });
    const hourInput = uploadArgs(`H${prefix.slice(-7)}`, `${prefix}-hour`, {
      rateIdentity: hourIdentity,
      now,
    });
    await expectError(
      () => t.mutation(internal.quickShare.createUpload, hourInput),
      "HOURLY_LIMIT",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "create",
          hourInput,
          { tokenIdentifier: null },
          now,
        ),
      "HOURLY_LIMIT",
    );

    const dayIdentity = `ip:${prefix}-day`;
    const dayStart =
      Math.floor(now / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
    await t.run((ctx) =>
      ctx.db.insert("quick_share_usage", {
        identity: dayIdentity,
        kind: "day",
        windowStart: dayStart,
        starts: 0,
        bytes: 500 * 1024 * 1024,
        expiresAt: dayStart + 2 * 24 * 60 * 60 * 1000,
        updatedAt: now,
      }),
    );
    await db.insert(quickShareUsage).values({
      identity: dayIdentity,
      kind: "day",
      windowStart: new Date(dayStart),
      starts: 0,
      bytes: 500 * 1024 * 1024,
      expiresAt: new Date(dayStart + 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now),
    });
    const dayInput = uploadArgs(`D${prefix.slice(-7)}`, `${prefix}-day`, {
      rateIdentity: dayIdentity,
      now,
    });
    await expectError(
      () => t.mutation(internal.quickShare.createUpload, dayInput),
      "DAILY_BYTES_LIMIT",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "create",
          dayInput,
          { tokenIdentifier: null },
          now,
        ),
      "DAILY_BYTES_LIMIT",
    );

    const banIp = `hash:${prefix}-ban`;
    const admin = `https://clerk.quick-share.test|limits-admin-${prefix}`;
    await t.mutation(internal.quickShare.banIp, {
      ipHash: banIp,
      rawIp: "192.0.2.41",
      createdBy: admin,
      now,
    });
    const env = { QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS: admin };
    expect(
      await handleQuickShareOperation(
        db,
        "adminBan",
        { ipHash: banIp, rawIp: "192.0.2.41" },
        { tokenIdentifier: admin },
        now,
        env,
      ),
    ).toEqual({ status: 200, body: null });
    const bannedInput = uploadArgs(`B${prefix.slice(-7)}`, `${prefix}-ban`, {
      ipHash: banIp,
      now,
    });
    await expectError(
      () => t.mutation(internal.quickShare.createUpload, bannedInput),
      "IP_BANNED",
    );
    await expectError(
      () =>
        handleQuickShareOperation(
          db,
          "create",
          bannedInput,
          { tokenIdentifier: null },
          now,
        ),
      "IP_BANNED",
    );
    await t.mutation(internal.quickShare.unbanIp, {
      ipHash: banIp,
      now: now + 1,
    });
    expect(
      await handleQuickShareOperation(
        db,
        "adminUnban",
        { ipHash: banIp },
        { tokenIdentifier: admin },
        now + 1,
        env,
      ),
    ).toEqual({ status: 200, body: null });
    expect(
      (await t.mutation(internal.quickShare.createUpload, bannedInput)).slug,
    ).toBe(bannedInput.slug);
    expect(
      (
        await handleQuickShareOperation(
          db,
          "create",
          bannedInput,
          { tokenIdentifier: null },
          now + 1,
        )
      ).status,
    ).toBe(201);
  });
});
