import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server.js";
import {
  DAY_MS,
  policyForTier,
  publicLifetimeMs,
  QUICK_SHARE_POLICY,
  type QuickShareTier,
  startOfDay,
  startOfHour,
} from "./quickSharePolicy.js";

const uploadStateValidator = v.union(
  v.literal("uploading"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("unsupported"),
  v.literal("failed"),
  v.literal("removed"),
);

const tierValidator = v.union(v.literal("anonymous"), v.literal("signedIn"));

const JOB_LEASE_MS = 25 * 60 * 1000;

async function enqueueJob(
  ctx: MutationCtx,
  uploadId: Id<"quick_share_uploads">,
  kind: "process" | "delete",
  now: number,
) {
  const jobId = await ctx.db.insert("quick_share_jobs", {
    uploadId,
    kind,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.quickShareHttp.dispatchJob, {
    jobId,
    attempt: 0,
  });
  return jobId;
}

function publicUpload(doc: Doc<"quick_share_uploads">) {
  return {
    id: doc._id,
    slug: doc.slug,
    source: doc.source,
    originalName: doc.originalName,
    originalSize: doc.originalSize,
    declaredMime: doc.declaredMime ?? null,
    detectedMime: doc.detectedMime ?? null,
    publicMime: doc.publicMime ?? null,
    publicSize: doc.publicSize ?? null,
    state: doc.state,
    publicExpiresAt: doc.publicExpiresAt,
    retainedUntil: doc.retainedUntil,
    extendedAt: doc.extendedAt ?? null,
    completedAt: doc.completedAt ?? null,
    failureCode: doc.failureCode ?? null,
    failureMessage: doc.failureMessage ?? null,
    compatibilityWarning: doc.compatibilityWarning ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function reserveUsage(
  ctx: MutationCtx,
  identity: string,
  tier: QuickShareTier,
  bytes: number,
  now: number,
  collectionItem = false,
) {
  const policy = policyForTier(tier);
  const active = await ctx.db
    .query("quick_share_uploads")
    .withIndex("by_rateIdentity_and_active", (q) =>
      q.eq("rateIdentity", identity).eq("active", true),
    )
    .collect();
  const activeShares = new Set(active.map((upload) => upload.slug));
  if (!collectionItem && activeShares.size >= policy.active) {
    throw new Error("ACTIVE_LIMIT");
  }

  const windows = [
    {
      kind: "hour" as const,
      start: startOfHour(now),
      startsLimit: policy.hourlyStarts,
      bytesLimit: Number.POSITIVE_INFINITY,
      expiresAt: startOfHour(now) + 2 * 60 * 60 * 1000,
    },
    {
      kind: "day" as const,
      start: startOfDay(now),
      startsLimit: Number.POSITIVE_INFINITY,
      bytesLimit: policy.dailyBytes,
      expiresAt: startOfDay(now) + 2 * DAY_MS,
    },
  ];

  for (const window of windows) {
    const row = await ctx.db
      .query("quick_share_usage")
      .withIndex("by_identity_and_kind_and_windowStart", (q) =>
        q
          .eq("identity", identity)
          .eq("kind", window.kind)
          .eq("windowStart", window.start),
      )
      .unique();
    const nextStarts = (row?.starts ?? 0) + (collectionItem ? 0 : 1);
    const nextBytes = (row?.bytes ?? 0) + bytes;
    if (nextStarts > window.startsLimit) throw new Error("HOURLY_LIMIT");
    if (nextBytes > window.bytesLimit) throw new Error("DAILY_BYTES_LIMIT");
    if (row) {
      await ctx.db.patch(row._id, {
        starts: nextStarts,
        bytes: nextBytes,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("quick_share_usage", {
        identity,
        kind: window.kind,
        windowStart: window.start,
        starts: nextStarts,
        bytes: nextBytes,
        expiresAt: window.expiresAt,
        updatedAt: now,
      });
    }
  }
}

export const createUpload = internalMutation({
  args: {
    slug: v.string(),
    collectionReceiptHash: v.optional(v.string()),
    source: v.union(v.literal("file"), v.literal("url")),
    originalName: v.string(),
    declaredMime: v.optional(v.string()),
    originalSize: v.number(),
    originalKey: v.string(),
    multipartUploadId: v.optional(v.string()),
    importReservedBytes: v.optional(v.number()),
    receiptHash: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
    rateIdentity: v.string(),
    ipHash: v.string(),
    rawIp: v.string(),
    tier: tierValidator,
    now: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.originalSize) || args.originalSize <= 0) {
      throw new Error("INVALID_SIZE");
    }
    const policy = policyForTier(args.tier);
    if (args.originalSize > policy.maxBytes) throw new Error("FILE_TOO_LARGE");
    if (
      args.importReservedBytes !== undefined &&
      (args.source !== "url" ||
        args.importReservedBytes !== args.originalSize ||
        args.importReservedBytes !== policy.maxBytes)
    ) {
      throw new Error("INVALID_IMPORT_RESERVATION");
    }
    if (args.slug.length !== QUICK_SHARE_POLICY.publicIdLength) {
      throw new Error("INVALID_SLUG");
    }
    const existingSlugs = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    if (existingSlugs.length > 0) {
      const collectionOwner = existingSlugs[0];
      if (
        !args.collectionReceiptHash ||
        collectionOwner.receiptHash !== args.collectionReceiptHash ||
        collectionOwner.rateIdentity !== args.rateIdentity ||
        collectionOwner.ipHash !== args.ipHash ||
        !collectionOwner.active
      ) {
        throw new Error("SLUG_COLLISION");
      }
    }
    const ban = await ctx.db
      .query("quick_share_bans")
      .withIndex("by_ipHash_and_active", (q) =>
        q.eq("ipHash", args.ipHash).eq("active", true),
      )
      .unique();
    if (ban) throw new Error("IP_BANNED");

    await reserveUsage(
      ctx,
      args.rateIdentity,
      args.tier,
      args.originalSize,
      args.now,
      existingSlugs.length > 0,
    );

    const publicExpiresAt =
      args.now + publicLifetimeMs(args.tier, args.originalSize);
    const retainedUntil = args.now + QUICK_SHARE_POLICY.retentionMs;
    const id = await ctx.db.insert("quick_share_uploads", {
      slug: args.slug,
      source: args.source,
      originalName: args.originalName.slice(0, 255),
      ...(args.declaredMime
        ? { declaredMime: args.declaredMime.slice(0, 150) }
        : {}),
      originalSize: args.originalSize,
      originalKey: args.originalKey,
      ...(args.multipartUploadId
        ? { multipartUploadId: args.multipartUploadId }
        : {}),
      ...(args.importReservedBytes
        ? { importReservedBytes: args.importReservedBytes }
        : {}),
      state: "uploading",
      receiptHash: args.receiptHash,
      ...(args.ownerTokenIdentifier
        ? { ownerTokenIdentifier: args.ownerTokenIdentifier }
        : {}),
      rateIdentity: args.rateIdentity,
      ipHash: args.ipHash,
      rawIp: args.rawIp,
      publicExpiresAt,
      retainedUntil,
      active: true,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { id, slug: args.slug, publicExpiresAt, retainedUntil };
  },
});

export const getUpload = internalQuery({
  args: {
    uploadId: v.id("quick_share_uploads"),
    receiptHash: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (!upload) return null;
    const receiptMatches =
      args.receiptHash !== undefined &&
      args.receiptHash.length > 0 &&
      upload.receiptHash === args.receiptHash;
    const ownerMatches =
      args.ownerTokenIdentifier !== undefined &&
      upload.ownerTokenIdentifier === args.ownerTokenIdentifier;
    if (!receiptMatches && !ownerMatches) return null;
    const parts = await ctx.db
      .query("quick_share_parts")
      .withIndex("by_uploadId_and_partNumber", (q) =>
        q.eq("uploadId", upload._id),
      )
      .take(200);
    return {
      ...publicUpload(upload),
      originalKey: upload.originalKey,
      multipartUploadId: upload.multipartUploadId ?? null,
      parts: parts.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag,
        size: part.size,
      })),
    };
  },
});

export const recordPart = internalMutation({
  args: {
    uploadId: v.id("quick_share_uploads"),
    receiptHash: v.string(),
    partNumber: v.number(),
    etag: v.string(),
    size: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.partNumber) ||
      args.partNumber < 1 ||
      args.partNumber > 200 ||
      args.size <= 0 ||
      args.size > QUICK_SHARE_POLICY.chunkBytes
    ) {
      throw new Error("INVALID_PART");
    }
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (
      !upload ||
      upload.receiptHash !== args.receiptHash ||
      upload.state !== "uploading"
    ) {
      throw new Error("UPLOAD_NOT_AVAILABLE");
    }
    const existing = await ctx.db
      .query("quick_share_parts")
      .withIndex("by_uploadId_and_partNumber", (q) =>
        q.eq("uploadId", upload._id).eq("partNumber", args.partNumber),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        etag: args.etag,
        size: args.size,
        createdAt: args.now,
      });
    } else {
      await ctx.db.insert("quick_share_parts", {
        uploadId: upload._id,
        partNumber: args.partNumber,
        etag: args.etag,
        size: args.size,
        createdAt: args.now,
      });
    }
    await ctx.db.patch(upload._id, { updatedAt: args.now });
    return null;
  },
});

export const markComplete = internalMutation({
  args: {
    uploadId: v.id("quick_share_uploads"),
    receiptHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (!upload || upload.receiptHash !== args.receiptHash) {
      throw new Error("UPLOAD_NOT_AVAILABLE");
    }
    if (upload.state !== "uploading") return publicUpload(upload);
    await ctx.db.patch(upload._id, {
      state: "processing",
      completedAt: args.now,
      multipartUploadId: undefined,
      updatedAt: args.now,
    });
    await enqueueJob(ctx, upload._id, "process", args.now);
    const updated = await ctx.db.get("quick_share_uploads", upload._id);
    if (!updated) throw new Error("UPLOAD_NOT_AVAILABLE");
    return publicUpload(updated);
  },
});

async function releaseImportReservation(
  ctx: MutationCtx,
  upload: Doc<"quick_share_uploads">,
  actualBytes: number,
  now: number,
) {
  const reserved = upload.importReservedBytes;
  if (reserved === undefined) return;
  const row = await ctx.db
    .query("quick_share_usage")
    .withIndex("by_identity_and_kind_and_windowStart", (q) =>
      q
        .eq("identity", upload.rateIdentity)
        .eq("kind", "day")
        .eq("windowStart", startOfDay(upload.createdAt)),
    )
    .unique();
  if (!row) return;
  await ctx.db.patch(row._id, {
    bytes: Math.max(0, row.bytes - reserved + actualBytes),
    updatedAt: now,
  });
}

export const finishImport = internalMutation({
  args: {
    uploadId: v.id("quick_share_uploads"),
    receiptHash: v.string(),
    originalName: v.string(),
    declaredMime: v.optional(v.string()),
    originalSize: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (
      !upload ||
      upload.receiptHash !== args.receiptHash ||
      upload.source !== "url" ||
      upload.state !== "uploading" ||
      upload.importReservedBytes === undefined
    ) {
      throw new Error("UPLOAD_NOT_AVAILABLE");
    }
    if (
      !Number.isSafeInteger(args.originalSize) ||
      args.originalSize <= 0 ||
      args.originalSize > upload.importReservedBytes
    ) {
      throw new Error("INVALID_SIZE");
    }
    await releaseImportReservation(ctx, upload, args.originalSize, args.now);
    await ctx.db.patch(upload._id, {
      originalName: args.originalName.slice(0, 255),
      declaredMime: args.declaredMime?.slice(0, 150),
      originalSize: args.originalSize,
      importReservedBytes: undefined,
      publicExpiresAt:
        upload.createdAt +
        publicLifetimeMs(
          upload.ownerTokenIdentifier ? "signedIn" : "anonymous",
          args.originalSize,
        ),
      state: "processing",
      completedAt: args.now,
      updatedAt: args.now,
    });
    await enqueueJob(ctx, upload._id, "process", args.now);
    const updated = await ctx.db.get("quick_share_uploads", upload._id);
    if (!updated) throw new Error("UPLOAD_NOT_AVAILABLE");
    return publicUpload(updated);
  },
});

export const failImport = internalMutation({
  args: {
    uploadId: v.id("quick_share_uploads"),
    receiptHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (
      !upload ||
      upload.receiptHash !== args.receiptHash ||
      upload.source !== "url" ||
      upload.state !== "uploading"
    ) {
      return null;
    }
    await releaseImportReservation(ctx, upload, 0, args.now);
    await ctx.db.patch(upload._id, {
      importReservedBytes: undefined,
      active: false,
      state: "failed",
      failureCode: "IMPORT_FAILED",
      failureMessage: "The remote media could not be imported.",
      updatedAt: args.now,
    });
    return null;
  },
});

export const getPublicUpload = internalQuery({
  args: { slug: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (
      !upload?.active ||
      upload.state !== "ready" ||
      upload.publicExpiresAt <= args.now ||
      !upload.publicKey ||
      !upload.publicMime ||
      !upload.publicSize
    ) {
      return null;
    }
    return {
      key: upload.publicKey,
      mime: upload.publicMime,
      size: upload.publicSize,
      name: upload.originalName,
      expiresAt: upload.publicExpiresAt,
    };
  },
});

export const getPublicCollection = internalQuery({
  args: { slug: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const uploads = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    return uploads
      .filter(
        (upload) =>
          upload.active &&
          upload.state === "ready" &&
          upload.publicExpiresAt > args.now &&
          upload.publicKey &&
          upload.publicMime &&
          upload.publicSize,
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((upload) => ({
        key: upload.publicKey as string,
        mime: upload.publicMime as string,
        size: upload.publicSize as number,
        name: upload.originalName,
        expiresAt: upload.publicExpiresAt,
      }));
  },
});

export const accountUploads = internalQuery({
  args: { ownerTokenIdentifier: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const uploads = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_ownerTokenIdentifier_and_publicExpiresAt", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .gt("publicExpiresAt", args.now),
      )
      .order("desc")
      .take(100);
    return uploads.filter((row) => row.active).map(publicUpload);
  },
});

export const extendUpload = internalMutation({
  args: {
    uploadId: v.id("quick_share_uploads"),
    ownerTokenIdentifier: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (
      !upload ||
      upload.ownerTokenIdentifier !== args.ownerTokenIdentifier ||
      !upload.active ||
      upload.publicExpiresAt <= args.now
    ) {
      throw new Error("UPLOAD_NOT_AVAILABLE");
    }
    if (
      upload.originalSize <= QUICK_SHARE_POLICY.signedIn.smallCutoffBytes ||
      upload.extendedAt !== undefined
    ) {
      throw new Error("NOT_EXTENDABLE");
    }
    const publicExpiresAt = upload.createdAt + 30 * DAY_MS;
    await ctx.db.patch(upload._id, {
      publicExpiresAt,
      extendedAt: args.now,
      updatedAt: args.now,
    });
    const updated = await ctx.db.get("quick_share_uploads", upload._id);
    if (!updated) throw new Error("UPLOAD_NOT_AVAILABLE");
    return publicUpload(updated);
  },
});

export const claimJob = internalMutation({
  args: {
    jobId: v.id("quick_share_jobs"),
    leaseId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("quick_share_jobs", args.jobId);
    if (
      !job ||
      job.status === "done" ||
      (job.status === "leased" && (job.leaseExpiresAt ?? 0) > args.now)
    ) {
      return null;
    }
    const leaseExpiresAt = args.now + JOB_LEASE_MS;
    await ctx.db.patch(job._id, {
      status: "leased",
      leaseId: args.leaseId,
      leaseExpiresAt,
      attempts: job.attempts + 1,
      updatedAt: args.now,
    });
    const upload = await ctx.db.get("quick_share_uploads", job.uploadId);
    if (!upload) {
      await ctx.db.patch(job._id, { status: "done", updatedAt: args.now });
      return null;
    }
    await ctx.scheduler.runAfter(
      JOB_LEASE_MS,
      internal.quickShare.recoverJobLease,
      { jobId: job._id, leaseId: args.leaseId },
    );
    return {
      jobId: job._id,
      kind: job.kind,
      attempts: job.attempts + 1,
      leaseExpiresAt,
      upload: {
        id: upload._id,
        originalKey: upload.originalKey,
        publicKey: upload.publicKey ?? null,
        originalName: upload.originalName,
        originalSize: upload.originalSize,
        declaredMime: upload.declaredMime ?? null,
        retainedUntil: upload.retainedUntil,
      },
    };
  },
});

export const retryDispatchJob = internalMutation({
  args: {
    jobId: v.id("quick_share_jobs"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("quick_share_jobs", args.jobId);
    if (!job || job.status !== "pending") return null;
    await ctx.scheduler.runAfter(0, internal.quickShareHttp.dispatchJob, {
      jobId: job._id,
      attempt: args.attempt,
    });
    return null;
  },
});

export const recoverJobLease = internalMutation({
  args: {
    jobId: v.id("quick_share_jobs"),
    leaseId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("quick_share_jobs", args.jobId);
    if (!job || job.status !== "leased" || job.leaseId !== args.leaseId) {
      return null;
    }
    const now = Date.now();
    if ((job.leaseExpiresAt ?? 0) > now) {
      await ctx.scheduler.runAfter(
        (job.leaseExpiresAt as number) - now,
        internal.quickShare.recoverJobLease,
        args,
      );
      return null;
    }
    await ctx.db.patch(job._id, {
      status: "pending",
      leaseId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.quickShareHttp.dispatchJob, {
      jobId: job._id,
      attempt: 0,
    });
    return null;
  },
});

export const finishProcessJob = internalMutation({
  args: {
    jobId: v.id("quick_share_jobs"),
    leaseId: v.string(),
    state: v.union(
      v.literal("ready"),
      v.literal("unsupported"),
      v.literal("failed"),
    ),
    detectedMime: v.optional(v.string()),
    publicKey: v.optional(v.string()),
    publicMime: v.optional(v.string()),
    publicSize: v.optional(v.number()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    compatibilityWarning: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("quick_share_jobs", args.jobId);
    if (!job || job.status !== "leased" || job.leaseId !== args.leaseId) {
      return { accepted: false };
    }
    const upload = await ctx.db.get("quick_share_uploads", job.uploadId);
    if (upload?.state === "processing" && upload.active) {
      await ctx.db.patch(upload._id, {
        state: args.state,
        detectedMime: args.detectedMime,
        publicKey: args.publicKey,
        publicMime: args.publicMime,
        publicSize: args.publicSize,
        failureCode: args.failureCode,
        failureMessage: args.failureMessage?.slice(0, 500),
        compatibilityWarning: args.compatibilityWarning?.slice(0, 300),
        active: args.state === "ready",
        updatedAt: args.now,
      });
    }
    await ctx.db.patch(job._id, {
      status: "done",
      leaseId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: args.now,
    });
    return { accepted: upload?.state === "processing" && upload.active };
  },
});

export const adminList = internalQuery({
  args: {
    slug: v.optional(v.string()),
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let uploads: Array<Doc<"quick_share_uploads">>;
    if (args.slug) {
      uploads = await ctx.db
        .query("quick_share_uploads")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug as string))
        .collect();
    } else if (args.ipHash) {
      uploads = await ctx.db
        .query("quick_share_uploads")
        .withIndex("by_ipHash_and_createdAt", (q) =>
          q.eq("ipHash", args.ipHash as string),
        )
        .order("desc")
        .take(100);
    } else {
      uploads = await ctx.db
        .query("quick_share_uploads")
        .withIndex("by_retainedUntil")
        .order("desc")
        .take(100);
    }
    return uploads.map((upload) => ({
      ...publicUpload(upload),
      rawIp: upload.rawIp,
      ipHash: upload.ipHash,
      ownerTokenIdentifier: upload.ownerTokenIdentifier ?? null,
      originalKey: upload.originalKey,
    }));
  },
});

export const adminGet = internalQuery({
  args: { uploadId: v.id("quick_share_uploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (!upload) return null;
    return {
      ...publicUpload(upload),
      rawIp: upload.rawIp,
      ipHash: upload.ipHash,
      ownerTokenIdentifier: upload.ownerTokenIdentifier ?? null,
      originalKey: upload.originalKey,
    };
  },
});

export const banIp = internalMutation({
  args: {
    ipHash: v.string(),
    rawIp: v.string(),
    reason: v.optional(v.string()),
    createdBy: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("quick_share_bans")
      .withIndex("by_ipHash_and_active", (q) =>
        q.eq("ipHash", args.ipHash).eq("active", true),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("quick_share_bans", {
        ipHash: args.ipHash,
        rawIp: args.rawIp,
        rawIpExpiresAt: args.now + QUICK_SHARE_POLICY.retentionMs,
        ...(args.reason ? { reason: args.reason.slice(0, 300) } : {}),
        active: true,
        createdBy: args.createdBy,
        createdAt: args.now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.quickShare.revokeIpBatch, {
      ipHash: args.ipHash,
      now: args.now,
    });
    return null;
  },
});

export const revokeIpBatch = internalMutation({
  args: { ipHash: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const uploads = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_ipHash_and_active", (q) =>
        q.eq("ipHash", args.ipHash).eq("active", true),
      )
      .take(50);
    for (const upload of uploads) {
      await ctx.db.patch(upload._id, {
        active: false,
        state: "removed",
        failureCode: "IP_BANNED",
        failureMessage: "Removed by moderation.",
        updatedAt: args.now,
      });
    }
    if (uploads.length === 50) {
      await ctx.scheduler.runAfter(0, internal.quickShare.revokeIpBatch, args);
    }
    return null;
  },
});

export const unbanIp = internalMutation({
  args: { ipHash: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const ban = await ctx.db
      .query("quick_share_bans")
      .withIndex("by_ipHash_and_active", (q) =>
        q.eq("ipHash", args.ipHash).eq("active", true),
      )
      .unique();
    if (ban) {
      await ctx.db.patch(ban._id, {
        active: false,
        rawIp: undefined,
        rawIpExpiresAt: undefined,
        removedAt: args.now,
      });
    }
    return null;
  },
});

export const removeUpload = internalMutation({
  args: { uploadId: v.id("quick_share_uploads"), now: v.number() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    if (!upload) return null;
    await ctx.db.patch(upload._id, {
      active: false,
      state: "removed",
      retainedUntil: args.now,
      failureCode: "REMOVED_BY_MODERATOR",
      failureMessage: "Removed by moderation.",
      updatedAt: args.now,
    });
    const existing = await ctx.db
      .query("quick_share_jobs")
      .withIndex("by_uploadId_and_kind", (q) =>
        q.eq("uploadId", upload._id).eq("kind", "delete"),
      )
      .unique();
    if (!existing) {
      await enqueueJob(ctx, upload._id, "delete", args.now);
    }
    return null;
  },
});

export const queueRetentionDeletes = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ isDone: boolean; continueCursor: string }> => {
    const now = Date.now();
    const page = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_retainedUntil", (q) => q.lte("retainedUntil", now))
      .paginate(args.paginationOpts);
    for (const upload of page.page) {
      const existing = await ctx.db
        .query("quick_share_jobs")
        .withIndex("by_uploadId_and_kind", (q) =>
          q.eq("uploadId", upload._id).eq("kind", "delete"),
        )
        .unique();
      if (!existing) {
        await enqueueJob(ctx, upload._id, "delete", now);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.quickShare.queueRetentionDeletes,
        {
          paginationOpts: {
            numItems: 25,
            cursor: page.continueCursor,
          },
        },
      );
    }
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const redispatchPendingJobs = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ isDone: boolean; continueCursor: string }> => {
    const page = await ctx.db
      .query("quick_share_jobs")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .paginate(args.paginationOpts);
    for (const job of page.page) {
      await ctx.scheduler.runAfter(0, internal.quickShareHttp.dispatchJob, {
        jobId: job._id,
        attempt: 0,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.quickShare.redispatchPendingJobs,
        {
          paginationOpts: {
            numItems: 25,
            cursor: page.continueCursor,
          },
        },
      );
    }
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const maintenance = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const abandoned = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_state_and_createdAt", (q) =>
        q.eq("state", "uploading").lte("createdAt", now - 60 * 60 * 1000),
      )
      .take(50);
    for (const upload of abandoned) {
      if (upload.importReservedBytes !== undefined) {
        await releaseImportReservation(ctx, upload, 0, now);
      }
      await ctx.db.patch(upload._id, {
        importReservedBytes: undefined,
        active: false,
        state: "failed",
        failureCode: "UPLOAD_TIMED_OUT",
        failureMessage: "The upload was not completed in time.",
        updatedAt: now,
      });
    }

    const expiredPublic = await ctx.db
      .query("quick_share_uploads")
      .withIndex("by_active_and_publicExpiresAt", (q) =>
        q.eq("active", true).lte("publicExpiresAt", now),
      )
      .take(50);
    for (const upload of expiredPublic) {
      await ctx.db.patch(upload._id, {
        active: false,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.quickShare.queueRetentionDeletes, {
      paginationOpts: { numItems: 25, cursor: null },
    });
    await ctx.scheduler.runAfter(0, internal.quickShare.redispatchPendingJobs, {
      paginationOpts: { numItems: 25, cursor: null },
    });

    const usage = await ctx.db
      .query("quick_share_usage")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(100);
    for (const row of usage) await ctx.db.delete(row._id);

    const bans = await ctx.db
      .query("quick_share_bans")
      .withIndex("by_active_and_rawIpExpiresAt", (q) =>
        q.eq("active", true).gt("rawIpExpiresAt", 0).lte("rawIpExpiresAt", now),
      )
      .take(100);
    for (const ban of bans) {
      await ctx.db.patch(ban._id, {
        rawIp: undefined,
        rawIpExpiresAt: undefined,
      });
    }

    if (
      expiredPublic.length === 50 ||
      abandoned.length === 50 ||
      usage.length === 100 ||
      bans.length === 100
    ) {
      await ctx.scheduler.runAfter(0, internal.quickShare.maintenance, {});
    }
    return null;
  },
});

export const finishDeleteJob = internalMutation({
  args: {
    jobId: v.id("quick_share_jobs"),
    leaseId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("quick_share_jobs", args.jobId);
    if (!job || job.status !== "leased" || job.leaseId !== args.leaseId) {
      throw new Error("LEASE_LOST");
    }
    const uploadId: Id<"quick_share_uploads"> = job.uploadId;
    const parts = await ctx.db
      .query("quick_share_parts")
      .withIndex("by_uploadId_and_partNumber", (q) =>
        q.eq("uploadId", uploadId),
      )
      .take(200);
    for (const part of parts) await ctx.db.delete(part._id);
    const jobs = await ctx.db
      .query("quick_share_jobs")
      .withIndex("by_uploadId_and_kind", (q) =>
        q.eq("uploadId", uploadId).eq("kind", "process"),
      )
      .take(20);
    for (const row of jobs) await ctx.db.delete(row._id);
    await ctx.db.delete(job._id);
    const upload = await ctx.db.get("quick_share_uploads", uploadId);
    if (upload) await ctx.db.delete(upload._id);
    return null;
  },
});

export const policy = internalQuery({
  args: { tier: tierValidator },
  handler: async (_ctx, args) => {
    const selected = policyForTier(args.tier);
    return {
      tier: args.tier,
      maxBytes: selected.maxBytes,
      hourlyStarts: selected.hourlyStarts,
      dailyBytes: selected.dailyBytes,
      active: selected.active,
      smallCutoffBytes: selected.smallCutoffBytes,
      smallLifetimeMs: selected.smallLifetimeMs,
      largeLifetimeMs: selected.largeLifetimeMs,
      chunkBytes: QUICK_SHARE_POLICY.chunkBytes,
    };
  },
});

export const assertUploadState = internalQuery({
  args: {
    uploadId: v.id("quick_share_uploads"),
    state: uploadStateValidator,
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("quick_share_uploads", args.uploadId);
    return upload?.state === args.state;
  },
});
