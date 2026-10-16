import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/pool";
import { type Transaction, withTransaction } from "../db/transaction";
import { enqueueJob } from "../jobs/enqueue";
import {
  deleteJob,
  deleteJobs,
  deleteParts,
  deleteUpload,
  deleteUsage,
  findActiveBan,
  findActiveByRateIdentity,
  findActiveRetainedUploadsBySlug,
  findFirstUploadBySlug,
  findPublicCollectionUploads,
  findUploadsByReceipt,
  findUploadsBySlug,
  getJob,
  getJobForUploadKind,
  getParts,
  getUpload,
  getUsage,
  insertBan,
  insertJob,
  insertUpload,
  insertUsage,
  listAbandonedUploads,
  listActiveUploadsByIp,
  listAdminUploads,
  listExpiredBanRawIps,
  listExpiredPublicUploads,
  listExpiredUploads,
  listExpiredUsage,
  listPendingJobs,
  listUploadsByOwner,
  updateBan,
  updateJob,
  updateUpload,
  updateUsage,
  upsertPart,
} from "../repositories/quickShare";

export const MIB = 1024 * 1024;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const JOB_LEASE_MS = 25 * 60 * 1000;
export const RETRY_DELAYS_MS = [
  1_000,
  5_000,
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
] as const;
export const QUICK_SHARE_POLICY = {
  anonymous: {
    maxBytes: 250 * MIB,
    hourlyStarts: 10,
    dailyBytes: 500 * MIB,
    active: 2,
    smallCutoffBytes: 25 * MIB,
    smallLifetimeMs: 7 * DAY_MS,
    largeLifetimeMs: DAY_MS,
  },
  signedIn: {
    maxBytes: 2 * 1024 * MIB,
    hourlyStarts: 60,
    dailyBytes: 5 * 1024 * MIB,
    active: 5,
    smallCutoffBytes: 250 * MIB,
    smallLifetimeMs: 30 * DAY_MS,
    largeLifetimeMs: 7 * DAY_MS,
  },
  retentionMs: 30 * DAY_MS,
  chunkBytes: 16 * MIB,
  publicIdLength: 8,
  collectionMaxItems: 100,
} as const;

type Tier = "anonymous" | "signedIn";
type UploadState =
  | "uploading"
  | "processing"
  | "ready"
  | "unsupported"
  | "failed"
  | "removed";
type OpBody = Record<string, unknown>;

const UUID = z.string().uuid();

function requiredString(body: OpBody, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function optionalString(body: OpBody, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string")
    throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function requiredNumber(body: OpBody, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function id(body: OpBody, key: string): string {
  const value = requiredString(body, key);
  if (!UUID.safeParse(value).success)
    throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function dateMs(value: Date | null | undefined): number | null {
  return value ? value.getTime() : null;
}

function publicUpload(upload: Awaited<ReturnType<typeof getUpload>>) {
  if (!upload) return null;
  return {
    id: upload.id,
    slug: upload.slug,
    source: upload.source,
    originalName: upload.originalName,
    originalSize: upload.originalSize,
    declaredMime: upload.declaredMime,
    detectedMime: upload.detectedMime,
    publicMime: upload.publicMime,
    publicSize: upload.publicSize,
    state: upload.state,
    publicExpiresAt: upload.publicExpiresAt.getTime(),
    retainedUntil: upload.retainedUntil.getTime(),
    extendedAt: dateMs(upload.extendedAt),
    completedAt: dateMs(upload.completedAt),
    failureCode: upload.failureCode,
    failureMessage: upload.failureMessage,
    compatibilityWarning: upload.compatibilityWarning,
    createdAt: upload.createdAt.getTime(),
    updatedAt: upload.updatedAt.getTime(),
  };
}

function adminUpload(
  upload: NonNullable<Awaited<ReturnType<typeof getUpload>>>,
) {
  return {
    ...publicUpload(upload),
    rawIp: upload.rawIp,
    ipHash: upload.ipHash,
    ownerTokenIdentifier: upload.ownerTokenIdentifier,
    originalKey: upload.originalKey,
  };
}

function policyForTier(tier: Tier) {
  return QUICK_SHARE_POLICY[tier];
}

function startOfHour(now: number) {
  return new Date(Math.floor(now / (60 * 60 * 1000)) * 60 * 60 * 1000);
}

function startOfDay(now: number) {
  return new Date(Math.floor(now / DAY_MS) * DAY_MS);
}

function publicLifetimeMs(tier: Tier, size: number) {
  const policy = policyForTier(tier);
  return size <= policy.smallCutoffBytes
    ? policy.smallLifetimeMs
    : policy.largeLifetimeMs;
}

function errorStatus(message: string): number {
  if (message.includes("IP_BANNED")) return 403;
  if (message.includes("FILE_TOO_LARGE")) return 413;
  if (
    message.includes("ACTIVE_LIMIT") ||
    message.includes("HOURLY_LIMIT") ||
    message.includes("DAILY_BYTES_LIMIT") ||
    message.includes("COLLECTION_LIMIT")
  )
    return 429;
  if (
    message.includes("UPLOAD_NOT_AVAILABLE") ||
    message.includes("NOT_EXTENDABLE")
  )
    return 404;
  if (message.includes("SLUG_COLLISION")) return 409;
  if (message.includes("INVALID_")) return 400;
  return 500;
}

function isAdmin(
  tokenIdentifier: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (!tokenIdentifier) return false;
  const values = (env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const actual = Buffer.from(tokenIdentifier, "utf8");
  return values.some((entry) => {
    const expected = Buffer.from(entry, "utf8");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
}

async function notifyDispatch(tx: Transaction, jobId: string, runAfter?: Date) {
  await enqueueJob(tx, {
    kind: "quick-share.dispatch",
    dedupeKey: `${jobId}:0`,
    payload: { jobId, attempt: 0 },
    runAfter,
  });
}

async function enqueueMediaJob(
  tx: Transaction,
  uploadId: string,
  kind: "process" | "delete",
  now: Date,
) {
  const job = await insertJob(tx, {
    uploadId,
    kind,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });
  if (job) await notifyDispatch(tx, job.id);
  return job;
}

async function reserveUsage(
  tx: Transaction,
  identity: string,
  tier: Tier,
  bytes: number,
  now: number,
) {
  const policy = policyForTier(tier);
  const active = await findActiveByRateIdentity(
    tx,
    identity,
    policy.active,
    true,
  );
  if (active.length >= policy.active) throw new Error("ACTIVE_LIMIT");
  const windows = [
    {
      kind: "hour" as const,
      start: startOfHour(now),
      startsLimit: policy.hourlyStarts,
      bytesLimit: Number.POSITIVE_INFINITY,
      expiresAt: new Date(startOfHour(now).getTime() + 2 * 60 * 60 * 1000),
    },
    {
      kind: "day" as const,
      start: startOfDay(now),
      startsLimit: Number.POSITIVE_INFINITY,
      bytesLimit: policy.dailyBytes,
      expiresAt: new Date(startOfDay(now).getTime() + 2 * DAY_MS),
    },
  ];
  for (const window of windows) {
    const row = await getUsage(tx, identity, window.kind, window.start, true);
    const starts = (row?.starts ?? 0) + 1;
    const totalBytes = (row?.bytes ?? 0) + bytes;
    if (starts > window.startsLimit) throw new Error("HOURLY_LIMIT");
    if (totalBytes > window.bytesLimit) throw new Error("DAILY_BYTES_LIMIT");
    if (row)
      await updateUsage(tx, row.id, {
        starts,
        bytes: totalBytes,
        updatedAt: new Date(now),
      });
    else
      await insertUsage(tx, {
        identity,
        kind: window.kind,
        windowStart: window.start,
        starts,
        bytes: totalBytes,
        expiresAt: window.expiresAt,
        updatedAt: new Date(now),
      });
  }
}

function collectionOwner(
  row: NonNullable<Awaited<ReturnType<typeof getUpload>>>,
  args: {
    slug: string;
    receipt?: string;
    identity: string;
    ipHash: string;
    now: number;
  },
) {
  return (
    row.slug === args.slug &&
    row.receiptHash === args.receipt &&
    row.rateIdentity === args.identity &&
    row.ipHash === args.ipHash &&
    row.active &&
    row.state !== "removed" &&
    row.retainedUntil.getTime() > args.now
  );
}

async function assertCollectionAdmission(
  tx: Transaction,
  args: {
    slug: string;
    collectionReceiptHash?: string;
    rateIdentity: string;
    ipHash: string;
    now: number;
  },
) {
  const existing = await findUploadsBySlug(tx, args.slug, 1, true);
  if (existing.length === 0) return;
  const receipts = args.collectionReceiptHash
    ? await findUploadsByReceipt(
        tx,
        args.collectionReceiptHash,
        QUICK_SHARE_POLICY.collectionMaxItems + 1,
      )
    : [];
  if (
    !receipts.some((row) =>
      collectionOwner(row, {
        slug: args.slug,
        receipt: args.collectionReceiptHash,
        identity: args.rateIdentity,
        ipHash: args.ipHash,
        now: args.now,
      }),
    )
  )
    throw new Error("SLUG_COLLISION");
  const active = await findActiveRetainedUploadsBySlug(
    tx,
    args.slug,
    new Date(args.now),
    QUICK_SHARE_POLICY.collectionMaxItems + 1,
    true,
  );
  if (active.length >= QUICK_SHARE_POLICY.collectionMaxItems)
    throw new Error("COLLECTION_LIMIT");
}

async function createUpload(
  db: Database,
  body: OpBody,
  owner: string | undefined,
  now: number,
) {
  const source = body.source === "url" ? "url" : "file";
  const originalSize = requiredNumber(body, "originalSize");
  const tier: Tier = owner ? "signedIn" : "anonymous";
  const policy = policyForTier(tier);
  if (!Number.isSafeInteger(originalSize) || originalSize <= 0)
    throw new Error("INVALID_SIZE");
  if (originalSize > policy.maxBytes) throw new Error("FILE_TOO_LARGE");
  const reservation =
    body.importReservedBytes === undefined
      ? undefined
      : requiredNumber(body, "importReservedBytes");
  if (
    reservation !== undefined &&
    (source !== "url" ||
      reservation !== originalSize ||
      reservation !== policy.maxBytes)
  )
    throw new Error("INVALID_IMPORT_RESERVATION");
  const slug = requiredString(body, "slug");
  if (slug.length !== QUICK_SHARE_POLICY.publicIdLength)
    throw new Error("INVALID_SLUG");
  const ownerTokenIdentifier = owner;
  const rateIdentity = owner
    ? `acct:${owner}`
    : requiredString(body, "rateIdentity");
  const ipHash = requiredString(body, "ipHash");
  const rawIp = requiredString(body, "rawIp");
  const createdAt = new Date(now);
  try {
    return await withTransaction(
      db,
      async (tx) => {
        await assertCollectionAdmission(tx, {
          slug,
          collectionReceiptHash: optionalString(body, "collectionReceiptHash"),
          rateIdentity,
          ipHash,
          now,
        });
        if (await findActiveBan(tx, ipHash, true)) throw new Error("IP_BANNED");
        await reserveUsage(tx, rateIdentity, tier, originalSize, now);
        const upload = await insertUpload(tx, {
          slug,
          source,
          originalName: requiredString(body, "originalName").slice(0, 255),
          declaredMime: optionalString(body, "declaredMime")?.slice(0, 150),
          originalSize,
          originalKey: requiredString(body, "originalKey"),
          multipartUploadId: optionalString(body, "multipartUploadId"),
          importReservedBytes: reservation,
          state: "uploading",
          receiptHash: requiredString(body, "receiptHash"),
          ownerTokenIdentifier,
          rateIdentity,
          ipHash,
          rawIp,
          publicExpiresAt: new Date(now + publicLifetimeMs(tier, originalSize)),
          retainedUntil: new Date(now + QUICK_SHARE_POLICY.retentionMs),
          active: true,
          createdAt,
          updatedAt: createdAt,
        });
        if (!upload) throw new Error("Quick Share is temporarily unavailable");
        return {
          id: upload.id,
          slug: upload.slug,
          publicExpiresAt: upload.publicExpiresAt.getTime(),
          retainedUntil: upload.retainedUntil.getTime(),
        };
      },
      { isolation: "serializable", retries: 3 },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /quick_share_uploads_slug_key/.test(error.message)
    )
      throw new Error("SLUG_COLLISION");
    throw error;
  }
}

async function getUploadWithAccess(
  db: Database,
  body: OpBody,
  owner: string | undefined,
) {
  const uploadId = id(body, "uploadId");
  const upload = await withTransaction(db, (tx) => getUpload(tx, uploadId));
  if (!upload) return null;
  const receipt = optionalString(body, "receiptHash");
  if (
    !(receipt && receipt.length > 0 && receipt === upload.receiptHash) &&
    !(owner && owner === upload.ownerTokenIdentifier)
  )
    return null;
  const parts = await withTransaction(db, (tx) => getParts(tx, upload.id));
  return {
    ...publicUpload(upload),
    originalKey: upload.originalKey,
    multipartUploadId: upload.multipartUploadId,
    parts: parts.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag,
      size: part.size,
    })),
  };
}

async function recordPart(db: Database, body: OpBody, now: number) {
  const partNumber = requiredNumber(body, "partNumber");
  const size = requiredNumber(body, "size");
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > 200 ||
    size <= 0 ||
    size > QUICK_SHARE_POLICY.chunkBytes
  )
    throw new Error("INVALID_PART");
  return withTransaction(db, async (tx) => {
    const upload = await getUpload(tx, id(body, "uploadId"), true);
    if (
      !upload ||
      upload.receiptHash !== requiredString(body, "receiptHash") ||
      upload.state !== "uploading"
    )
      throw new Error("UPLOAD_NOT_AVAILABLE");
    await upsertPart(tx, {
      uploadId: upload.id,
      partNumber,
      etag: requiredString(body, "etag"),
      size,
      createdAt: new Date(now),
    });
    await updateUpload(tx, upload.id, { updatedAt: new Date(now) });
    return null;
  });
}

async function complete(db: Database, body: OpBody, now: number) {
  return withTransaction(db, async (tx) => {
    const upload = await getUpload(tx, id(body, "uploadId"), true);
    if (!upload || upload.receiptHash !== requiredString(body, "receiptHash"))
      throw new Error("UPLOAD_NOT_AVAILABLE");
    if (upload.state !== "uploading") return publicUpload(upload);
    const updated = await updateUpload(tx, upload.id, {
      state: "processing",
      completedAt: new Date(now),
      multipartUploadId: null,
      updatedAt: new Date(now),
    });
    await enqueueMediaJob(tx, upload.id, "process", new Date(now));
    return publicUpload(updated);
  });
}

async function releaseImportReservation(
  tx: Transaction,
  upload: NonNullable<Awaited<ReturnType<typeof getUpload>>>,
  actualBytes: number,
  now: number,
) {
  if (upload.importReservedBytes === null) return;
  const row = await getUsage(
    tx,
    upload.rateIdentity,
    "day",
    startOfDay(upload.createdAt.getTime()),
    true,
  );
  if (row)
    await updateUsage(tx, row.id, {
      bytes: Math.max(0, row.bytes - upload.importReservedBytes + actualBytes),
      updatedAt: new Date(now),
    });
}

async function finishImport(db: Database, body: OpBody, now: number) {
  const size = requiredNumber(body, "originalSize");
  return withTransaction(db, async (tx) => {
    const upload = await getUpload(tx, id(body, "uploadId"), true);
    if (
      !upload ||
      upload.receiptHash !== requiredString(body, "receiptHash") ||
      upload.source !== "url" ||
      upload.state !== "uploading" ||
      upload.importReservedBytes === null
    )
      throw new Error("UPLOAD_NOT_AVAILABLE");
    if (
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > upload.importReservedBytes
    )
      throw new Error("INVALID_SIZE");
    await releaseImportReservation(tx, upload, size, now);
    const updated = await updateUpload(tx, upload.id, {
      originalName: requiredString(body, "originalName").slice(0, 255),
      declaredMime: optionalString(body, "declaredMime")?.slice(0, 150) ?? null,
      originalSize: size,
      importReservedBytes: null,
      publicExpiresAt: new Date(
        upload.createdAt.getTime() +
          publicLifetimeMs(
            upload.ownerTokenIdentifier ? "signedIn" : "anonymous",
            size,
          ),
      ),
      state: "processing",
      completedAt: new Date(now),
      updatedAt: new Date(now),
    });
    await enqueueMediaJob(tx, upload.id, "process", new Date(now));
    return publicUpload(updated);
  });
}

async function failImport(db: Database, body: OpBody, now: number) {
  return withTransaction(db, async (tx) => {
    const upload = await getUpload(tx, id(body, "uploadId"), true);
    if (
      !upload ||
      upload.receiptHash !== requiredString(body, "receiptHash") ||
      upload.source !== "url" ||
      upload.state !== "uploading"
    )
      return null;
    if (upload.importReservedBytes !== null)
      await releaseImportReservation(tx, upload, 0, now);
    await updateUpload(tx, upload.id, {
      importReservedBytes: null,
      active: false,
      state: "failed",
      failureCode: "IMPORT_FAILED",
      failureMessage: "The remote media could not be imported.",
      updatedAt: new Date(now),
    });
    return null;
  });
}

function publicObject(
  upload: NonNullable<Awaited<ReturnType<typeof getUpload>>>,
  now: number,
) {
  if (
    !upload.active ||
    upload.state !== "ready" ||
    upload.publicExpiresAt.getTime() <= now ||
    !upload.publicKey ||
    !upload.publicMime ||
    !upload.publicSize
  )
    return null;
  return {
    key: upload.publicKey,
    mime: upload.publicMime,
    size: upload.publicSize,
    name: upload.originalName,
    expiresAt: upload.publicExpiresAt.getTime(),
  };
}

async function publicUploadBySlug(db: Database, slug: string, now: number) {
  const row = await withTransaction(db, (tx) =>
    findFirstUploadBySlug(tx, slug),
  );
  return row ? publicObject(row, now) : null;
}

async function publicCollection(db: Database, slug: string, now: number) {
  const rows = await withTransaction(db, (tx) =>
    findPublicCollectionUploads(
      tx,
      slug,
      new Date(now),
      QUICK_SHARE_POLICY.collectionMaxItems,
    ),
  );
  return rows.reverse().map((row) => publicObject(row, now));
}

async function claimJob(db: Database, body: OpBody, now: number) {
  return withTransaction(db, async (tx) => {
    const job = await getJob(tx, id(body, "jobId"), true);
    const leaseId = requiredString(body, "leaseId");
    if (
      !job ||
      job.status === "done" ||
      (job.status === "leased" && (job.leaseExpiresAt?.getTime() ?? 0) > now)
    )
      return null;
    const leaseExpiresAt = new Date(now + JOB_LEASE_MS);
    const updated = await updateJob(tx, job.id, {
      status: "leased",
      leaseId,
      leaseExpiresAt,
      attempts: job.attempts + 1,
      updatedAt: new Date(now),
    });
    if (!updated) return null;
    await enqueueJob(tx, {
      kind: "quick-share.recover-lease",
      dedupeKey: `${job.id}:${leaseId}`,
      payload: { jobId: job.id, leaseId },
      runAfter: leaseExpiresAt,
    });
    const upload = await getUpload(tx, job.uploadId);
    if (!upload) {
      await updateJob(tx, job.id, { status: "done", updatedAt: new Date(now) });
      return null;
    }
    return {
      jobId: job.id,
      kind: job.kind,
      attempts: job.attempts + 1,
      leaseExpiresAt: leaseExpiresAt.getTime(),
      upload: {
        id: upload.id,
        originalKey: upload.originalKey,
        publicKey: upload.publicKey,
        originalName: upload.originalName,
        originalSize: upload.originalSize,
        declaredMime: upload.declaredMime,
        retainedUntil: upload.retainedUntil.getTime(),
      },
    };
  });
}

async function finishProcess(db: Database, body: OpBody, now: number) {
  const state = requiredString(body, "state");
  if (!(["ready", "unsupported", "failed"] as string[]).includes(state))
    throw new Error("INVALID_STATE");
  return withTransaction(db, async (tx) => {
    const job = await getJob(tx, id(body, "jobId"), true);
    const leaseId = requiredString(body, "leaseId");
    if (job?.status !== "leased" || job.leaseId !== leaseId)
      return { accepted: false };
    const upload = await getUpload(tx, job.uploadId, true);
    if (upload?.state === "processing" && upload.active)
      await updateUpload(tx, upload.id, {
        state: state as UploadState,
        detectedMime: optionalString(body, "detectedMime") ?? null,
        publicKey: optionalString(body, "publicKey") ?? null,
        publicMime: optionalString(body, "publicMime") ?? null,
        publicSize:
          body.publicSize === undefined
            ? null
            : requiredNumber(body, "publicSize"),
        failureCode: optionalString(body, "failureCode") ?? null,
        failureMessage:
          optionalString(body, "failureMessage")?.slice(0, 500) ?? null,
        compatibilityWarning:
          optionalString(body, "compatibilityWarning")?.slice(0, 300) ?? null,
        active: state === "ready",
        updatedAt: new Date(now),
      });
    await updateJob(tx, job.id, {
      status: "done",
      leaseId: null,
      leaseExpiresAt: null,
      updatedAt: new Date(now),
    });
    const next = (await listPendingJobs(tx, 1))[0];
    if (next) await notifyDispatch(tx, next.id, new Date(now + 1_000));
    return {
      accepted: Boolean(upload?.state === "processing" && upload.active),
    };
  });
}

async function finishDelete(db: Database, body: OpBody) {
  return withTransaction(db, async (tx) => {
    const job = await getJob(tx, id(body, "jobId"), true);
    if (
      job?.status !== "leased" ||
      job.leaseId !== requiredString(body, "leaseId")
    )
      throw new Error("LEASE_LOST");
    await deleteParts(tx, job.uploadId);
    await deleteJobs(tx, job.uploadId, job.id);
    await deleteJob(tx, job.id);
    await deleteUpload(tx, job.uploadId);
    return null;
  });
}

async function extend(
  db: Database,
  body: OpBody,
  owner: string | undefined,
  now: number,
) {
  if (!owner) return { status: 401, body: { error: "Unauthorized" } };
  return withTransaction(db, async (tx) => {
    const upload = await getUpload(tx, id(body, "uploadId"), true);
    if (
      !upload ||
      upload.ownerTokenIdentifier !== owner ||
      !upload.active ||
      upload.publicExpiresAt.getTime() <= now
    )
      throw new Error("UPLOAD_NOT_AVAILABLE");
    if (
      upload.originalSize <= QUICK_SHARE_POLICY.signedIn.smallCutoffBytes ||
      upload.extendedAt
    )
      throw new Error("NOT_EXTENDABLE");
    const updated = await updateUpload(tx, upload.id, {
      publicExpiresAt: new Date(upload.createdAt.getTime() + 30 * DAY_MS),
      extendedAt: new Date(now),
      updatedAt: new Date(now),
    });
    if (!updated) throw new Error("UPLOAD_NOT_AVAILABLE");
    return publicUpload(updated);
  });
}

async function adminList(db: Database, body: OpBody, now: number) {
  const rows = await withTransaction(db, (tx) =>
    listAdminUploads(
      tx,
      optionalString(body, "slug"),
      optionalString(body, "ipHash"),
      new Date(now),
    ),
  );
  return rows.map(adminUpload);
}

async function adminGet(db: Database, body: OpBody) {
  const row = await withTransaction(db, (tx) =>
    getUpload(tx, id(body, "uploadId")),
  );
  return row ? adminUpload(row) : null;
}

async function banIp(db: Database, body: OpBody, owner: string, now: number) {
  return withTransaction(db, async (tx) => {
    const existing = await findActiveBan(
      tx,
      requiredString(body, "ipHash"),
      true,
    );
    if (!existing)
      await insertBan(tx, {
        ipHash: requiredString(body, "ipHash"),
        rawIp: requiredString(body, "rawIp"),
        rawIpExpiresAt: new Date(now + QUICK_SHARE_POLICY.retentionMs),
        reason: optionalString(body, "reason")?.slice(0, 300),
        active: true,
        createdBy: owner,
        createdAt: new Date(now),
      });
    await enqueueJob(tx, {
      kind: "quick-share.revoke-ip",
      dedupeKey: requiredString(body, "ipHash"),
      payload: { ipHash: requiredString(body, "ipHash"), now },
    });
    return null;
  });
}

async function unbanIp(db: Database, body: OpBody, now: number) {
  return withTransaction(db, async (tx) => {
    const ban = await findActiveBan(tx, requiredString(body, "ipHash"), true);
    if (ban)
      await updateBan(tx, ban.id, {
        active: false,
        rawIp: null,
        rawIpExpiresAt: null,
        removedAt: new Date(now),
      });
    return null;
  });
}

async function removeUpload(db: Database, body: OpBody, now: number) {
  return withTransaction(db, async (tx) => {
    const upload = await getUpload(tx, id(body, "uploadId"), true);
    if (!upload) return null;
    await updateUpload(tx, upload.id, {
      active: false,
      state: "removed",
      retainedUntil: new Date(now),
      failureCode: "REMOVED_BY_MODERATOR",
      failureMessage: "Removed by moderation.",
      updatedAt: new Date(now),
    });
    if (!(await getJobForUploadKind(tx, upload.id, "delete", true)))
      await enqueueMediaJob(tx, upload.id, "delete", new Date(now));
    return null;
  });
}

export async function maintainQuickShare(db: Database, now = Date.now()) {
  return withTransaction(db, async (tx) => {
    const date = new Date(now);
    const abandoned = await listAbandonedUploads(
      tx,
      new Date(now - 60 * 60 * 1000),
    );
    for (const upload of abandoned) {
      if (upload.importReservedBytes !== null)
        await releaseImportReservation(tx, upload, 0, now);
      await updateUpload(tx, upload.id, {
        importReservedBytes: null,
        active: false,
        state: "failed",
        failureCode: "UPLOAD_TIMED_OUT",
        failureMessage: "The upload was not completed in time.",
        updatedAt: date,
      });
    }
    const expired = await listExpiredPublicUploads(tx, date);
    for (const upload of expired)
      await updateUpload(tx, upload.id, { active: false, updatedAt: date });
    const retention = await listExpiredUploads(tx, date);
    for (const upload of retention)
      if (!(await getJobForUploadKind(tx, upload.id, "delete", true)))
        await enqueueMediaJob(tx, upload.id, "delete", date);
    const usage = await listExpiredUsage(tx, date);
    for (const row of usage) await deleteUsage(tx, row.id);
    const bans = await listExpiredBanRawIps(tx, date);
    for (const ban of bans)
      await updateBan(tx, ban.id, { rawIp: null, rawIpExpiresAt: null });
    await enqueueJob(tx, {
      kind: "quick-share.queue-retention",
      dedupeKey: `${now}:retention-queue`,
      payload: { now },
    });
    await enqueueJob(tx, {
      kind: "quick-share.redispatch",
      dedupeKey: `${now}:retention-redispatch`,
      payload: {},
    });
    return {
      abandoned: abandoned.length,
      expired: expired.length,
      queuedDeletes: retention.length,
      usage: usage.length,
      bans: bans.length,
    };
  });
}

export async function recoverQuickShareLease(
  db: Database,
  jobId: string,
  leaseId: string,
  now = Date.now(),
) {
  return withTransaction(db, async (tx) => {
    const job = await getJob(tx, jobId, true);
    if (job?.status !== "leased" || job.leaseId !== leaseId)
      return { recovered: false };
    if ((job.leaseExpiresAt?.getTime() ?? 0) > now) return { recovered: false };
    await updateJob(tx, job.id, {
      status: "pending",
      leaseId: null,
      leaseExpiresAt: null,
      updatedAt: new Date(now),
    });
    await notifyDispatch(tx, job.id);
    return { recovered: true };
  });
}

export async function revokeQuickShareIpBatch(
  db: Database,
  ipHash: string,
  now = Date.now(),
) {
  return withTransaction(db, async (tx) => {
    const uploads = await listActiveUploadsByIp(tx, ipHash, 50, true);
    for (const upload of uploads)
      await updateUpload(tx, upload.id, {
        active: false,
        state: "removed",
        failureCode: "IP_BANNED",
        failureMessage: "Removed by moderation.",
        updatedAt: new Date(now),
      });
    if (uploads.length >= 50)
      await enqueueJob(tx, {
        kind: "quick-share.revoke-ip",
        dedupeKey: `${ipHash}:${now}`,
        payload: { ipHash, now },
      });
    return { revoked: uploads.length };
  });
}

export async function redispatchQuickSharePending(db: Database) {
  return withTransaction(db, async (tx) => {
    const jobs = await listPendingJobs(tx, 25);
    for (const job of jobs) await notifyDispatch(tx, job.id);
    if (jobs.length >= 25)
      await enqueueJob(tx, {
        kind: "quick-share.redispatch",
        dedupeKey: `${Date.now()}:next`,
        payload: {},
      });
    return { dispatched: jobs.length };
  });
}

export async function queueQuickShareRetentionDeletes(
  db: Database,
  now = Date.now(),
) {
  return withTransaction(db, async (tx) => {
    const uploads = await listExpiredUploads(tx, new Date(now), 100);
    let queued = 0;
    for (const upload of uploads) {
      if (!(await getJobForUploadKind(tx, upload.id, "delete", true))) {
        await enqueueMediaJob(tx, upload.id, "delete", new Date(now));
        queued += 1;
      }
    }
    if (uploads.length >= 100)
      await enqueueJob(tx, {
        kind: "quick-share.queue-retention",
        dedupeKey: `${now}:next`,
        payload: { now },
      });
    return { queued };
  });
}

function policy(tier: Tier) {
  const selected = policyForTier(tier);
  return {
    tier,
    maxBytes: selected.maxBytes,
    hourlyStarts: selected.hourlyStarts,
    dailyBytes: selected.dailyBytes,
    active: selected.active,
    smallCutoffBytes: selected.smallCutoffBytes,
    smallLifetimeMs: selected.smallLifetimeMs,
    largeLifetimeMs: selected.largeLifetimeMs,
    chunkBytes: QUICK_SHARE_POLICY.chunkBytes,
    collectionMaxItems: QUICK_SHARE_POLICY.collectionMaxItems,
  };
}

export interface QuickShareResult {
  status: number;
  body: unknown;
}

export async function handleQuickShareOperation(
  db: Database,
  op: string,
  body: OpBody,
  identity: Identity,
  now = Date.now(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<QuickShareResult> {
  const owner = identity.tokenIdentifier ?? undefined;
  switch (op) {
    case "policy":
      return { status: 200, body: policy(owner ? "signedIn" : "anonymous") };
    case "create":
      return { status: 201, body: await createUpload(db, body, owner, now) };
    case "getUpload": {
      const result = await getUploadWithAccess(db, body, owner);
      return {
        status: result ? 200 : 404,
        body: result ?? { error: "Not found" },
      };
    }
    case "recordPart":
      return { status: 200, body: await recordPart(db, body, now) };
    case "complete":
      return { status: 200, body: await complete(db, body, now) };
    case "finishImport":
      return { status: 200, body: await finishImport(db, body, now) };
    case "failImport":
      return { status: 200, body: await failImport(db, body, now) };
    case "public": {
      const result = await publicUploadBySlug(
        db,
        requiredString(body, "slug"),
        now,
      );
      return {
        status: result ? 200 : 404,
        body: result ?? { error: "Not found" },
      };
    }
    case "publicCollection": {
      const result = await publicCollection(
        db,
        requiredString(body, "slug"),
        now,
      );
      return {
        status: result.length ? 200 : 404,
        body: result.length ? result : { error: "Not found" },
      };
    }
    case "accountList": {
      if (!owner) return { status: 401, body: { error: "Unauthorized" } };
      return {
        status: 200,
        body: await withTransaction(db, (tx) =>
          listUploadsByOwner(tx, owner, new Date(now)),
        ).then((rows) => rows.map(publicUpload)),
      };
    }
    case "extend": {
      const result = await extend(db, body, owner, now);
      return result && typeof result === "object" && "status" in result
        ? result
        : { status: 200, body: result };
    }
    case "claimJob":
      return { status: 200, body: await claimJob(db, body, now) };
    case "finishProcess":
      return { status: 200, body: await finishProcess(db, body, now) };
    case "finishDelete":
      return { status: 200, body: await finishDelete(db, body) };
    case "adminList":
      if (!isAdmin(owner, env))
        return { status: 403, body: { error: "Forbidden" } };
      return { status: 200, body: await adminList(db, body, now) };
    case "adminGet":
      if (!isAdmin(owner, env))
        return { status: 403, body: { error: "Forbidden" } };
      {
        const result = await adminGet(db, body);
        return {
          status: result ? 200 : 404,
          body: result ?? { error: "Not found" },
        };
      }
    case "adminBan":
      if (!isAdmin(owner, env) || !owner)
        return { status: 403, body: { error: "Forbidden" } };
      return { status: 200, body: await banIp(db, body, owner, now) };
    case "adminUnban":
      if (!isAdmin(owner, env))
        return { status: 403, body: { error: "Forbidden" } };
      return { status: 200, body: await unbanIp(db, body, now) };
    case "adminRemove":
      if (!isAdmin(owner, env))
        return { status: 403, body: { error: "Forbidden" } };
      return { status: 200, body: await removeUpload(db, body, now) };
    default:
      return { status: 400, body: { error: "Unknown operation" } };
  }
}

export function quickShareErrorStatus(message: string) {
  return errorStatus(message);
}
