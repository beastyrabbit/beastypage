import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  type ActionCtx,
  httpAction,
  internalAction,
} from "./_generated/server.js";

type JsonObject = Record<string, unknown>;

// A worker serializes media processing and can legitimately hold a lease for
// up to 25 minutes. Keep retrying busy/unreachable dispatches long enough to
// cover that lease before the hourly maintenance sweep becomes the fallback.
// This remains bounded so an outage cannot turn into an unbounded scheduler
// loop.
const RETRY_DELAYS_MS = [
  1_000,
  5_000,
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
];

function retryDelay(attempt: number) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

export const dispatchJob = internalAction({
  args: {
    jobId: v.id("quick_share_jobs"),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<null> => {
    const workerUrl = process.env.QUICK_SHARE_WORKER_URL;
    const internalToken = process.env.QUICK_SHARE_INTERNAL_TOKEN;

    try {
      if (!workerUrl || !internalToken) {
        throw new Error("Quick Share worker dispatch is not configured");
      }
      const url = new URL(
        `/i/api/internal/jobs/${encodeURIComponent(args.jobId)}`,
        workerUrl,
      );
      const response = await fetch(url, {
        method: "POST",
        headers: { "x-quick-share-internal-token": internalToken },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Quick Share worker returned ${response.status}`);
      }
    } catch (error) {
      console.error(
        `[quick-share] could not dispatch job ${args.jobId}`,
        error instanceof Error ? error.message : error,
      );
      if (args.attempt < RETRY_DELAYS_MS.length) {
        await ctx.scheduler.runAfter(
          retryDelay(args.attempt),
          internal.quickShare.retryDispatchJob,
          { jobId: args.jobId, attempt: args.attempt + 1 },
        );
      }
    }

    return null;
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, noarchive, nosnippet",
    },
  });
}

function requiredString(body: JsonObject, key: string) {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function optionalString(body: JsonObject, key: string) {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new TypeError(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function requiredNumber(body: JsonObject, key: string) {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function isAdmin(tokenIdentifier: string | undefined) {
  if (!tokenIdentifier) return false;
  const allowlist = (process.env.QUICK_SHARE_ADMIN_TOKEN_IDENTIFIERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return allowlist.includes(tokenIdentifier);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |=
      (left.codePointAt(index) ?? 0) ^ (right.codePointAt(index) ?? 0);
  }
  return difference === 0;
}

function errorStatus(message: string) {
  if (message.includes("IP_BANNED")) return 403;
  if (message.includes("FILE_TOO_LARGE")) return 413;
  if (
    message.includes("ACTIVE_LIMIT") ||
    message.includes("HOURLY_LIMIT") ||
    message.includes("DAILY_BYTES_LIMIT") ||
    message.includes("COLLECTION_LIMIT")
  ) {
    return 429;
  }
  if (
    message.includes("UPLOAD_NOT_AVAILABLE") ||
    message.includes("NOT_EXTENDABLE")
  ) {
    return 404;
  }
  if (message.includes("SLUG_COLLISION")) return 409;
  if (message.includes("INVALID_")) return 400;
  return 500;
}

type QuickShareHandlerContext = {
  ctx: ActionCtx;
  body: JsonObject;
  ownerTokenIdentifier: string | undefined;
  now: number;
};

type QuickShareHandler = (
  context: QuickShareHandlerContext,
) => Promise<Response>;

function uploadId(body: JsonObject, key = "uploadId") {
  return requiredString(body, key) as Id<"quick_share_uploads">;
}

function jobId(body: JsonObject) {
  return requiredString(body, "jobId") as Id<"quick_share_jobs">;
}

async function handlePolicy({
  ctx,
  ownerTokenIdentifier,
}: QuickShareHandlerContext) {
  const tier = ownerTokenIdentifier ? "signedIn" : "anonymous";
  const result = await ctx.runQuery(internal.quickShare.policy, { tier });
  return json(result);
}

async function handleCreate({
  ctx,
  body,
  ownerTokenIdentifier,
  now,
}: QuickShareHandlerContext) {
  const declaredMime = optionalString(body, "declaredMime");
  const multipartUploadId = optionalString(body, "multipartUploadId");
  const collectionReceiptHash = optionalString(body, "collectionReceiptHash");
  const importReservedBytes =
    body.importReservedBytes === undefined
      ? undefined
      : requiredNumber(body, "importReservedBytes");
  const result = await ctx.runMutation(internal.quickShare.createUpload, {
    slug: requiredString(body, "slug"),
    ...(collectionReceiptHash ? { collectionReceiptHash } : {}),
    source: body.source === "url" ? ("url" as const) : ("file" as const),
    originalName: requiredString(body, "originalName"),
    ...(declaredMime ? { declaredMime } : {}),
    originalSize: requiredNumber(body, "originalSize"),
    originalKey: requiredString(body, "originalKey"),
    ...(multipartUploadId ? { multipartUploadId } : {}),
    ...(importReservedBytes === undefined ? {} : { importReservedBytes }),
    receiptHash: requiredString(body, "receiptHash"),
    ...(ownerTokenIdentifier ? { ownerTokenIdentifier } : {}),
    rateIdentity: ownerTokenIdentifier
      ? `acct:${ownerTokenIdentifier}`
      : requiredString(body, "rateIdentity"),
    ipHash: requiredString(body, "ipHash"),
    rawIp: requiredString(body, "rawIp"),
    tier: ownerTokenIdentifier ? "signedIn" : "anonymous",
    now,
  });
  return json(result, 201);
}

async function handleGetUpload({
  ctx,
  body,
  ownerTokenIdentifier,
}: QuickShareHandlerContext) {
  const receiptHash = optionalString(body, "receiptHash");
  const result = await ctx.runQuery(internal.quickShare.getUpload, {
    uploadId: uploadId(body),
    ...(receiptHash ? { receiptHash } : {}),
    ...(ownerTokenIdentifier ? { ownerTokenIdentifier } : {}),
  });
  return result ? json(result) : json({ error: "Not found" }, 404);
}

async function handleRecordPart({ ctx, body, now }: QuickShareHandlerContext) {
  await ctx.runMutation(internal.quickShare.recordPart, {
    uploadId: uploadId(body),
    receiptHash: requiredString(body, "receiptHash"),
    partNumber: requiredNumber(body, "partNumber"),
    etag: requiredString(body, "etag"),
    size: requiredNumber(body, "size"),
    now,
  });
  return json({ ok: true });
}

async function handleComplete({ ctx, body, now }: QuickShareHandlerContext) {
  const result = await ctx.runMutation(internal.quickShare.markComplete, {
    uploadId: uploadId(body),
    receiptHash: requiredString(body, "receiptHash"),
    now,
  });
  return json(result);
}

async function handleFinishImport({
  ctx,
  body,
  now,
}: QuickShareHandlerContext) {
  const declaredMime = optionalString(body, "declaredMime");
  const result = await ctx.runMutation(internal.quickShare.finishImport, {
    uploadId: uploadId(body),
    receiptHash: requiredString(body, "receiptHash"),
    originalName: requiredString(body, "originalName"),
    ...(declaredMime ? { declaredMime } : {}),
    originalSize: requiredNumber(body, "originalSize"),
    now,
  });
  return json(result);
}

async function handleFailImport({ ctx, body, now }: QuickShareHandlerContext) {
  await ctx.runMutation(internal.quickShare.failImport, {
    uploadId: uploadId(body),
    receiptHash: requiredString(body, "receiptHash"),
    now,
  });
  return json({ ok: true });
}

async function handlePublic({ ctx, body, now }: QuickShareHandlerContext) {
  const result = await ctx.runQuery(internal.quickShare.getPublicUpload, {
    slug: requiredString(body, "slug"),
    now,
  });
  return result ? json(result) : json({ error: "Not found" }, 404);
}

async function handlePublicCollection({
  ctx,
  body,
  now,
}: QuickShareHandlerContext) {
  const result = await ctx.runQuery(internal.quickShare.getPublicCollection, {
    slug: requiredString(body, "slug"),
    now,
  });
  return result.length > 0 ? json(result) : json({ error: "Not found" }, 404);
}

async function handleAccountList({
  ctx,
  ownerTokenIdentifier,
  now,
}: QuickShareHandlerContext) {
  if (!ownerTokenIdentifier) return json({ error: "Unauthorized" }, 401);
  const result = await ctx.runQuery(internal.quickShare.accountUploads, {
    ownerTokenIdentifier,
    now,
  });
  return json(result);
}

async function handleExtend({
  ctx,
  body,
  ownerTokenIdentifier,
  now,
}: QuickShareHandlerContext) {
  if (!ownerTokenIdentifier) return json({ error: "Unauthorized" }, 401);
  const result = await ctx.runMutation(internal.quickShare.extendUpload, {
    uploadId: uploadId(body),
    ownerTokenIdentifier,
    now,
  });
  return json(result);
}

async function handleClaimJob({ ctx, body, now }: QuickShareHandlerContext) {
  const result = await ctx.runMutation(internal.quickShare.claimJob, {
    jobId: jobId(body),
    leaseId: requiredString(body, "leaseId"),
    now,
  });
  return json(result);
}

async function handleFinishProcess({
  ctx,
  body,
  now,
}: QuickShareHandlerContext) {
  const requestedState = requiredString(body, "state");
  if (
    requestedState !== "ready" &&
    requestedState !== "unsupported" &&
    requestedState !== "failed"
  ) {
    throw new Error("INVALID_STATE");
  }
  const detectedMime = optionalString(body, "detectedMime");
  const publicKey = optionalString(body, "publicKey");
  const publicMime = optionalString(body, "publicMime");
  const failureCode = optionalString(body, "failureCode");
  const failureMessage = optionalString(body, "failureMessage");
  const compatibilityWarning = optionalString(body, "compatibilityWarning");
  const result = await ctx.runMutation(internal.quickShare.finishProcessJob, {
    jobId: jobId(body),
    leaseId: requiredString(body, "leaseId"),
    state: requestedState,
    ...(detectedMime ? { detectedMime } : {}),
    ...(publicKey ? { publicKey } : {}),
    ...(publicMime ? { publicMime } : {}),
    ...(body.publicSize === undefined
      ? {}
      : { publicSize: requiredNumber(body, "publicSize") }),
    ...(failureCode ? { failureCode } : {}),
    ...(failureMessage ? { failureMessage } : {}),
    ...(compatibilityWarning ? { compatibilityWarning } : {}),
    now,
  });
  return json(result);
}

async function handleFinishDelete({ ctx, body }: QuickShareHandlerContext) {
  await ctx.runMutation(internal.quickShare.finishDeleteJob, {
    jobId: jobId(body),
    leaseId: requiredString(body, "leaseId"),
  });
  return json({ ok: true });
}

async function handleAdminList({
  ctx,
  body,
  ownerTokenIdentifier,
}: QuickShareHandlerContext) {
  if (!isAdmin(ownerTokenIdentifier)) {
    return json({ error: "Forbidden" }, 403);
  }
  const slug = optionalString(body, "slug");
  const ipHash = optionalString(body, "ipHash");
  const result = await ctx.runQuery(internal.quickShare.adminList, {
    ...(slug ? { slug } : {}),
    ...(ipHash ? { ipHash } : {}),
  });
  return json(result);
}

async function handleAdminGet({
  ctx,
  body,
  ownerTokenIdentifier,
}: QuickShareHandlerContext) {
  if (!isAdmin(ownerTokenIdentifier)) {
    return json({ error: "Forbidden" }, 403);
  }
  const result = await ctx.runQuery(internal.quickShare.adminGet, {
    uploadId: uploadId(body),
  });
  return result ? json(result) : json({ error: "Not found" }, 404);
}

async function handleAdminBan({
  ctx,
  body,
  ownerTokenIdentifier,
  now,
}: QuickShareHandlerContext) {
  if (!isAdmin(ownerTokenIdentifier) || !ownerTokenIdentifier) {
    return json({ error: "Forbidden" }, 403);
  }
  const reason = optionalString(body, "reason");
  await ctx.runMutation(internal.quickShare.banIp, {
    ipHash: requiredString(body, "ipHash"),
    rawIp: requiredString(body, "rawIp"),
    ...(reason ? { reason } : {}),
    createdBy: ownerTokenIdentifier,
    now,
  });
  return json({ ok: true });
}

async function handleAdminUnban({
  ctx,
  body,
  ownerTokenIdentifier,
  now,
}: QuickShareHandlerContext) {
  if (!isAdmin(ownerTokenIdentifier)) {
    return json({ error: "Forbidden" }, 403);
  }
  await ctx.runMutation(internal.quickShare.unbanIp, {
    ipHash: requiredString(body, "ipHash"),
    now,
  });
  return json({ ok: true });
}

async function handleAdminRemove({
  ctx,
  body,
  ownerTokenIdentifier,
  now,
}: QuickShareHandlerContext) {
  if (!isAdmin(ownerTokenIdentifier)) {
    return json({ error: "Forbidden" }, 403);
  }
  await ctx.runMutation(internal.quickShare.removeUpload, {
    uploadId: uploadId(body),
    now,
  });
  return json({ ok: true });
}

const QUICK_SHARE_HANDLERS: Record<string, QuickShareHandler> = {
  policy: handlePolicy,
  create: handleCreate,
  getUpload: handleGetUpload,
  recordPart: handleRecordPart,
  complete: handleComplete,
  finishImport: handleFinishImport,
  failImport: handleFailImport,
  public: handlePublic,
  publicCollection: handlePublicCollection,
  accountList: handleAccountList,
  extend: handleExtend,
  claimJob: handleClaimJob,
  finishProcess: handleFinishProcess,
  finishDelete: handleFinishDelete,
  adminList: handleAdminList,
  adminGet: handleAdminGet,
  adminBan: handleAdminBan,
  adminUnban: handleAdminUnban,
  adminRemove: handleAdminRemove,
};

export const quickShareInternal = httpAction(async (ctx, request) => {
  const expected = process.env.QUICK_SHARE_INTERNAL_TOKEN;
  const received = request.headers.get("x-quick-share-internal-token");
  if (!expected || !received || !constantTimeEqual(expected, received)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: JsonObject;
  try {
    body = (await request.json()) as JsonObject;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const op = body.op;
  if (typeof op !== "string") return json({ error: "Missing operation" }, 400);
  const identity = await ctx.auth.getUserIdentity();
  const ownerTokenIdentifier = identity?.tokenIdentifier;
  const now = Date.now();
  const hasHandler = Object.hasOwn(QUICK_SHARE_HANDLERS, op);
  if (!hasHandler) return json({ error: "Unknown operation" }, 400);
  const handler = QUICK_SHARE_HANDLERS[op];

  try {
    return await handler({ ctx, body, ownerTokenIdentifier, now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error(`[quick-share] ${op} failed`, message);
    const status = errorStatus(message);
    return json(
      {
        error:
          status === 500 ? "Quick Share is temporarily unavailable" : message,
      },
      status,
    );
  }
});
