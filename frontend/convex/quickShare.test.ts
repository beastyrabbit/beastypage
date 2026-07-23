/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DAY_MS, MIB, startOfDay } from "./quickSharePolicy";
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
    await t.mutation(internal.quickShare.banIp, {
      ipHash: "blocked-ip",
      rawIp: "192.0.2.44",
      createdBy: "moderator",
      now: 1_800_000_000_000,
    });
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
    const claimed = await t.mutation(internal.quickShare.claimJob, {
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
    const claimed = await t.mutation(internal.quickShare.claimJob, {
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
