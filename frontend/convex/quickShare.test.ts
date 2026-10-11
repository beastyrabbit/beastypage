/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  DAY_MS,
  MIB,
  QUICK_SHARE_POLICY,
  startOfDay,
  startOfHour,
} from "./quickSharePolicy";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createArgs(
  slug: string,
  overrides: Partial<{
    originalSize: number;
    rateIdentity: string;
    ipHash: string;
    rawIp: string;
    tier: "anonymous" | "signedIn";
    ownerTokenIdentifier: string;
    now: number;
  }> = {},
) {
  return {
    slug,
    source: "file" as const,
    originalName: "phone-photo.jpg",
    declaredMime: "image/jpeg",
    originalSize: overrides.originalSize ?? MIB,
    originalKey: `originals/${slug}`,
    multipartUploadId: `multipart-${slug}`,
    receiptHash: `receipt-${slug}`,
    ...(overrides.ownerTokenIdentifier
      ? { ownerTokenIdentifier: overrides.ownerTokenIdentifier }
      : {}),
    rateIdentity: overrides.rateIdentity ?? "ip:one",
    ipHash: overrides.ipHash ?? "ip-one",
    rawIp: overrides.rawIp ?? "192.0.2.10",
    tier: overrides.tier ?? ("anonymous" as const),
    now: overrides.now ?? 1_800_000_000_000,
  };
}

describe("Quick Share Convex policy", () => {
  it("returns null for absent admin uploads and preserves mutation result contracts", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Contract"),
    );
    expect(
      await t.query(internal.quickShare.adminGet, { uploadId: created.id }),
    ).toMatchObject({ slug: "Contract" });
    await expect(
      t.mutation(internal.quickShare.removeUpload, {
        uploadId: created.id,
        now: 1_800_000_000_001,
      }),
    ).resolves.toBeNull();
    await t.run((ctx) => ctx.db.delete(created.id));
    await expect(
      t.query(internal.quickShare.adminGet, { uploadId: created.id }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.quickShare.removeUpload, {
        uploadId: created.id,
        now: 1_800_000_000_002,
      }),
    ).resolves.toBeNull();
  });

  it("keeps null retry and recovery results for pending and missing jobs", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("JobCheck"),
    );
    await t.mutation(internal.quickShare.markComplete, {
      uploadId: created.id,
      receiptHash: "receipt-JobCheck",
      now: 1_800_000_000_001,
    });
    const job = await t.run((ctx) => ctx.db.query("quick_share_jobs").first());
    if (!job) throw new Error("Expected a processing job");
    await expect(
      t.mutation(internal.quickShare.retryDispatchJob, {
        jobId: job._id,
        attempt: 1,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.quickShare.recoverJobLease, {
        jobId: job._id,
        leaseId: "missing",
      }),
    ).resolves.toBeNull();
    await t.run((ctx) => ctx.db.delete(job._id));
    await expect(
      t.mutation(internal.quickShare.retryDispatchJob, {
        jobId: job._id,
        attempt: 1,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.quickShare.recoverJobLease, {
        jobId: job._id,
        leaseId: "missing",
      }),
    ).resolves.toBeNull();
  });

  it("applies the anonymous retention boundary atomically", async () => {
    const t = convexTest(schema, modules);
    const now = 1_800_000_000_000;
    const small = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg1", { originalSize: 25 * MIB, now }),
    );
    expect(small.publicExpiresAt).toBe(now + 7 * DAY_MS);

    await t.run(async (ctx) => {
      await ctx.db.patch(small.id, { active: false });
    });
    const large = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg2", {
        originalSize: 25 * MIB + 1,
        now,
      }),
    );
    expect(large.publicExpiresAt).toBe(now + DAY_MS);
    expect(large.retainedUntil).toBe(now + 30 * DAY_MS);
  });

  it("enforces the anonymous active limit", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.quickShare.createUpload, createArgs("Abcdefg1"));
    await t.mutation(internal.quickShare.createUpload, createArgs("Abcdefg2"));
    await expect(
      t.mutation(internal.quickShare.createUpload, createArgs("Abcdefg3")),
    ).rejects.toThrow("ACTIVE_LIMIT");
  });

  it("enforces hourly starts independently of completed links", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 10; index += 1) {
      const created = await t.mutation(
        internal.quickShare.createUpload,
        createArgs(`ShrA${index.toString().padStart(3, "0")}x`, {
          rateIdentity: "ip:hourly",
        }),
      );
      await t.run(async (ctx) => {
        await ctx.db.patch(created.id, { active: false });
      });
    }
    await expect(
      t.mutation(
        internal.quickShare.createUpload,
        createArgs("ShrA010x", { rateIdentity: "ip:hourly" }),
      ),
    ).rejects.toThrow("HOURLY_LIMIT");
  });

  it("charges collection items against active and hourly limits", async () => {
    const t = convexTest(schema, modules);
    const now = 1_800_000_000_000;
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Collect1", { rateIdentity: "ip:collection", now }),
    );

    const second = await t.mutation(internal.quickShare.createUpload, {
      ...createArgs("Collect1", {
        rateIdentity: "ip:collection",
        now: now + 1,
      }),
      collectionReceiptHash: "receipt-Collect1",
    });
    expect(second.slug).toBe(first.slug);

    const usage = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_usage")
        .withIndex("by_identity_and_kind_and_windowStart", (q) =>
          q
            .eq("identity", "ip:collection")
            .eq("kind", "hour")
            .eq("windowStart", startOfHour(now)),
        )
        .unique(),
    );
    expect(usage?.starts).toBe(2);

    await expect(
      t.mutation(internal.quickShare.createUpload, {
        ...createArgs("Collect1", {
          rateIdentity: "ip:collection",
          now: now + 2,
        }),
        collectionReceiptHash: "receipt-Collect1",
      }),
    ).rejects.toThrow("ACTIVE_LIMIT");
  });

  it("does not let an inactive item authorize collection appends", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Collect1", { now }),
    );
    await t.run((ctx) =>
      ctx.db.patch(first.id, { state: "unsupported", active: false }),
    );
    await expect(
      t.mutation(internal.quickShare.createUpload, {
        ...createArgs("Collect1", { now: now + 1 }),
        collectionReceiptHash: "wrong-receipt",
      }),
    ).rejects.toThrow("SLUG_COLLISION");
    await expect(
      t.mutation(internal.quickShare.createUpload, {
        ...createArgs("Collect1", { now: now + 2 }),
        collectionReceiptHash: "receipt-Collect1",
      }),
    ).rejects.toThrow("SLUG_COLLISION");

  });

  it("ignores inactive collection rows when enforcing the collection limit", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Collect1", { now }),
    );
    await t.run(async (ctx) => {
      const original = await ctx.db.get(first.id);
      if (!original) throw new Error("Expected a collection upload");
      const { _id: _uploadId, _creationTime, ...row } = original;
      for (
        let index = 1;
        index < QUICK_SHARE_POLICY.collectionMaxItems;
        index += 1
      ) {
        await ctx.db.insert("quick_share_uploads", {
          ...row,
          state: "failed",
          active: false,
          receiptHash: `failed-${index}`,
        });
      }
    });
    await expect(
      t.mutation(internal.quickShare.createUpload, {
        ...createArgs("Collect1", { now: now + 1 }),
        collectionReceiptHash: "receipt-Collect1",
      }),
    ).resolves.toMatchObject({ slug: "Collect1" });
  });

  it("keeps an older ready item visible past stale collection rows", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Collect2", { now: now - 1_000 }),
    );
    await t.run(async (ctx) => {
      const original = await ctx.db.get(first.id);
      if (!original) throw new Error("Expected a collection upload");
      await ctx.db.patch(first.id, {
        state: "ready",
        publicKey: "derivatives/older",
        publicMime: "image/png",
        publicSize: 1,
        publicExpiresAt: now + 10_000,
      });
      const { _id: _uploadId, _creationTime, ...row } = original;
      for (
        let index = 0;
        index < QUICK_SHARE_POLICY.collectionMaxItems;
        index += 1
      ) {
        await ctx.db.insert("quick_share_uploads", {
          ...row,
          state: "failed",
          active: false,
          receiptHash: `stale-${index}`,
          createdAt: now + index,
        });
      }
    });

    await expect(
      t.query(internal.quickShare.getPublicCollection, {
        slug: "Collect2",
        now,
      }),
    ).resolves.toMatchObject([
      { key: "derivatives/older", mime: "image/png", size: 1 },
    ]);
  });

  it("keeps live uploads visible in admin slug searches past stale rows", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const live = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("AdmLive1", { now }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(live.id, {
        state: "ready",
        publicKey: "derivatives/live",
        publicMime: "image/png",
        publicSize: 1,
      });
      const original = await ctx.db.get(live.id);
      if (!original) throw new Error("Expected a live upload");
      const { _id: _uploadId, _creationTime, ...row } = original;
      for (
        let index = 0;
        index < QUICK_SHARE_POLICY.collectionMaxItems;
        index += 1
      ) {
        await ctx.db.insert("quick_share_uploads", {
          ...row,
          state: "failed",
          active: false,
          receiptHash: `admin-stale-${index}`,
          createdAt: now + index + 1,
        });
      }
    });

    await expect(
      t.query(internal.quickShare.adminList, { slug: "AdmLive1" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ originalKey: "originals/AdmLive1" }),
      ]),
    );
  });

  it("bounds public collection and slug moderation reads for legacy collections", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Collect1", { now }),
    );
    await t.run(async (ctx) => {
      const original = await ctx.db.get(first.id);
      if (!original) throw new Error("Expected a collection upload");
      const { _id: _uploadId, _creationTime, ...row } = original;
      await ctx.db.patch(first.id, {
        state: "ready",
        publicKey: "derivatives/first",
        publicMime: "image/png",
        publicSize: 1,
      });
      for (
        let index = 1;
        index < QUICK_SHARE_POLICY.collectionMaxItems + 1;
        index += 1
      ) {
        await ctx.db.insert("quick_share_uploads", {
          ...row,
          state: "ready",
          publicKey: `derivatives/${index}`,
          publicMime: "image/png",
          publicSize: 1,
        });
      }
    });
    expect(
      await t.query(internal.quickShare.getPublicCollection, {
        slug: "Collect1",
        now,
      }),
    ).toHaveLength(QUICK_SHARE_POLICY.collectionMaxItems);
    expect(
      await t.query(internal.quickShare.adminList, { slug: "Collect1" }),
    ).toHaveLength(QUICK_SHARE_POLICY.collectionMaxItems);
  });

  it("revokes every active link for a banned exact IP", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg1", { ipHash: "blocked-ip" }),
    );
    const second = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg2", { ipHash: "blocked-ip" }),
    );
    const banResult = await t.mutation(internal.quickShare.banIp, {
      ipHash: "blocked-ip",
      rawIp: "192.0.2.44",
      createdBy: "moderator",
      now: 1_800_000_000_000,
    });
    expect(banResult).toBeNull();
    await t.mutation(internal.quickShare.revokeIpBatch, {
      ipHash: "blocked-ip",
      now: 1_800_000_000_001,
    });
    const states = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(first.id), ctx.db.get(second.id)]),
    );
    expect(states.map((row) => [row?.state, row?.active])).toEqual([
      ["removed", false],
      ["removed", false],
    ]);
    await expect(
      t.mutation(
        internal.quickShare.createUpload,
        createArgs("Abcdefg3", { ipHash: "blocked-ip" }),
      ),
    ).rejects.toThrow("IP_BANNED");
  });

  it("keeps the original metadata when processing is unsupported", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg1"),
    );
    await t.mutation(internal.quickShare.markComplete, {
      uploadId: created.id,
      receiptHash: "receipt-Abcdefg1",
      now: 1_800_000_000_010,
    });
    const job = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_jobs")
        .withIndex("by_uploadId_and_kind", (q) =>
          q.eq("uploadId", created.id).eq("kind", "process"),
        )
        .unique(),
    );
    expect(job).not.toBeNull();
    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").take(20),
    );
    expect(scheduled.some((row) => row.name.endsWith(":dispatchJob"))).toBe(
      true,
    );
    const claimed = await t.mutation(internal.quickShare.claimJob, {
      jobId: job?._id as Id<"quick_share_jobs">,
      leaseId: "lease",
      now: 1_800_000_000_020,
    });
    const disposition = await t.mutation(internal.quickShare.finishProcessJob, {
      jobId: claimed?.jobId as Id<"quick_share_jobs">,
      leaseId: "lease",
      state: "unsupported",
      failureCode: "UNSUPPORTED_FORMAT",
      now: 1_800_000_000_030,
    });
    expect(disposition).toEqual({ accepted: true });
    const upload = await t.run(async (ctx) => ctx.db.get(created.id));
    expect(upload?.originalKey).toBe("originals/Abcdefg1");
    expect(upload?.retainedUntil).toBe(1_800_000_000_000 + 30 * DAY_MS);
    expect(upload?.state).toBe("unsupported");
  });

  it("requeues a job when its worker lease expires", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg1"),
    );
    await t.mutation(internal.quickShare.markComplete, {
      uploadId: created.id,
      receiptHash: "receipt-Abcdefg1",
      now: Date.now() - 30 * 60 * 1000,
    });
    const job = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_jobs")
        .withIndex("by_uploadId_and_kind", (q) =>
          q.eq("uploadId", created.id).eq("kind", "process"),
        )
        .unique(),
    );
    await t.mutation(internal.quickShare.claimJob, {
      jobId: job?._id as Id<"quick_share_jobs">,
      leaseId: "expired-lease",
      now: Date.now() - 30 * 60 * 1000,
    });

    const recoveryResult = await t.mutation(
      internal.quickShare.recoverJobLease,
      {
        jobId: job?._id as Id<"quick_share_jobs">,
        leaseId: "expired-lease",
      },
    );
    expect(recoveryResult).toBeNull();

    const recovered = await t.run(async (ctx) =>
      ctx.db.get(job?._id as Id<"quick_share_jobs">),
    );
    expect(recovered?.status).toBe("pending");
    expect(recovered?.leaseId).toBeUndefined();
    expect(recovered?.leaseExpiresAt).toBeUndefined();
  });

  it("wakes the oldest pending job when processing finishes", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const first = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("WakeJob1", { now }),
    );
    const second = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("WakeJob2", { now: now + 1 }),
    );
    for (const upload of [first, second]) {
      await t.mutation(internal.quickShare.markComplete, {
        uploadId: upload.id,
        receiptHash: `receipt-${upload.slug}`,
        now: now + 2,
      });
    }
    const jobs = await t.run((ctx) => ctx.db.query("quick_share_jobs").take(2));
    const firstJob = jobs.find((job) => job.uploadId === first.id);
    const secondJob = jobs.find((job) => job.uploadId === second.id);
    if (!firstJob || !secondJob)
      throw new Error("Expected both processing jobs");
    await t.mutation(internal.quickShare.claimJob, {
      jobId: firstJob._id,
      leaseId: "test-lease",
      now: now + 3,
    });
    await t.mutation(internal.quickShare.finishProcessJob, {
      jobId: firstJob._id,
      leaseId: "test-lease",
      state: "ready",
      publicKey: "derivatives/first",
      publicMime: "image/png",
      publicSize: 1,
      now: now + 4,
    });
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").take(20),
    );
    const secondDispatches = scheduled.filter(
      (row) =>
        row.name.endsWith(":dispatchJob") &&
        (row.args[0] as { jobId: string }).jobId === secondJob._id,
    );
    expect(secondDispatches).toHaveLength(2);
  });

  it("does not resurrect a share removed while processing", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg1"),
    );
    await t.mutation(internal.quickShare.markComplete, {
      uploadId: created.id,
      receiptHash: "receipt-Abcdefg1",
      now: 1_800_000_000_010,
    });
    const job = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_jobs")
        .withIndex("by_uploadId_and_kind", (q) =>
          q.eq("uploadId", created.id).eq("kind", "process"),
        )
        .unique(),
    );
    const claimed = await t.mutation(internal.quickShare.claimJob, {
      jobId: job?._id as Id<"quick_share_jobs">,
      leaseId: "lease",
      now: 1_800_000_000_020,
    });
    await t.mutation(internal.quickShare.removeUpload, {
      uploadId: created.id,
      now: 1_800_000_000_025,
    });
    const disposition = await t.mutation(internal.quickShare.finishProcessJob, {
      jobId: claimed?.jobId as Id<"quick_share_jobs">,
      leaseId: "lease",
      state: "ready",
      detectedMime: "image/jpeg",
      publicKey: "derivatives/resurrected",
      publicMime: "image/jpeg",
      publicSize: MIB,
      now: 1_800_000_000_030,
    });
    expect(disposition).toEqual({ accepted: false });
    const upload = await t.run(async (ctx) => ctx.db.get(created.id));
    expect([upload?.state, upload?.active, upload?.publicKey]).toEqual([
      "removed",
      false,
      undefined,
    ]);
  });

  it("releases abandoned uploads after one hour", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Abcdefg1", { now: Date.now() - 2 * 60 * 60 * 1000 }),
    );
    await t.mutation(internal.quickShare.maintenance, {});
    const upload = await t.run(async (ctx) => ctx.db.get(created.id));
    expect([upload?.state, upload?.active, upload?.failureCode]).toEqual([
      "failed",
      false,
      "UPLOAD_TIMED_OUT",
    ]);
  });

  it("does not abandon an old upload that received a recent part", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const created = await t.mutation(
      internal.quickShare.createUpload,
      createArgs("Recent01", { now: now - 2 * 60 * 60 * 1000 }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(created.id, { updatedAt: now });
    });

    await t.mutation(internal.quickShare.maintenance, {});
    const upload = await t.run(async (ctx) => ctx.db.get(created.id));
    expect([upload?.state, upload?.active]).toEqual(["uploading", true]);
  });

  it("reserves URL import capacity before download and refunds unused bytes", async () => {
    const t = convexTest(schema, modules);
    const base = createArgs("Abcdefg1", {
      originalSize: 250 * MIB,
      now: 1_800_000_000_000,
    });
    const { multipartUploadId: _multipartUploadId, ...withoutMultipart } = base;
    const created = await t.mutation(internal.quickShare.createUpload, {
      ...withoutMultipart,
      source: "url",
      importReservedBytes: 250 * MIB,
    });
    await t.mutation(internal.quickShare.finishImport, {
      uploadId: created.id,
      receiptHash: "receipt-Abcdefg1",
      originalName: "tiny.png",
      declaredMime: "image/png",
      originalSize: MIB,
      now: 1_800_000_000_100,
    });
    const result = await t.run(async (ctx) => {
      const upload = await ctx.db.get(created.id);
      const usage = await ctx.db
        .query("quick_share_usage")
        .withIndex("by_identity_and_kind_and_windowStart", (q) =>
          q
            .eq("identity", "ip:one")
            .eq("kind", "day")
            .eq("windowStart", startOfDay(1_800_000_000_000)),
        )
        .unique();
      return { upload, usage };
    });
    expect(result.upload?.state).toBe("processing");
    expect(result.upload?.originalSize).toBe(MIB);
    expect(result.upload?.publicExpiresAt).toBe(1_800_000_000_000 + 7 * DAY_MS);
    expect(result.usage?.bytes).toBe(MIB);
  });

  it("queues every expired retention row across pages", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert("quick_share_uploads", {
          slug: `Ret${index.toString().padStart(5, "0")}`,
          source: "file",
          originalName: `expired-${index}.png`,
          originalSize: MIB,
          originalKey: `originals/expired-${index}`,
          state: "failed",
          receiptHash: `retention-${index}`,
          rateIdentity: `ip:retention-${index}`,
          ipHash: `retention-${index}`,
          rawIp: `192.0.2.${index + 1}`,
          publicExpiresAt: now - DAY_MS,
          retainedUntil: now - 1,
          active: false,
          createdAt: now - 31 * DAY_MS,
          updatedAt: now - DAY_MS,
        });
      }
    });
    let cursor: string | null = null;
    while (true) {
      const page: { isDone: boolean; continueCursor: string } =
        await t.mutation(internal.quickShare.queueRetentionDeletes, {
          paginationOpts: { numItems: 25, cursor },
        });
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const jobs = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_jobs")
        .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
        .take(100),
    );
    expect(jobs).toHaveLength(30);
  });

  it("scrubs raw IPs from more than one ban batch", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("quick_share_bans", {
          ipHash: `ban-${index}`,
          rawIp: `192.0.2.${(index % 200) + 1}`,
          rawIpExpiresAt: now - 1,
          active: true,
          createdBy: "moderator",
          createdAt: now - 31 * DAY_MS + index,
        });
      }
    });
    await t.mutation(internal.quickShare.maintenance, {});
    await t.mutation(internal.quickShare.maintenance, {});
    const bans = await t.run(async (ctx) =>
      ctx.db
        .query("quick_share_bans")
        .withIndex("by_active_and_createdAt", (q) => q.eq("active", true))
        .take(200),
    );
    expect(bans.filter((ban) => ban.rawIp !== undefined)).toHaveLength(0);
  });
});
