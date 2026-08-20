import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { httpAction, internalAction } from "./_generated/server.js";

type JsonObject = Record<string, unknown>;

const RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 60_000, 5 * 60_000];

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
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function optionalString(body: JsonObject, key: string) {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function requiredNumber(body: JsonObject, key: string) {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
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

function errorStatus(message: string) {
  if (message.includes("IP_BANNED")) return 403;
  if (message.includes("FILE_TOO_LARGE")) return 413;
  if (
    message.includes("ACTIVE_LIMIT") ||
    message.includes("HOURLY_LIMIT") ||
    message.includes("DAILY_BYTES_LIMIT")
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

export const quickShareInternal = httpAction(async (ctx, request) => {
  const expected = process.env.QUICK_SHARE_INTERNAL_TOKEN;
  const received = request.headers.get("x-quick-share-internal-token");
  if (!expected || !received || expected !== received) {
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

  try {
    switch (op) {
      case "policy": {
        const tier = ownerTokenIdentifier ? "signedIn" : "anonymous";
        const result = await ctx.runQuery(internal.quickShare.policy, { tier });
        return json(result);
      }
      case "create": {
        const declaredMime = optionalString(body, "declaredMime");
        const multipartUploadId = optionalString(body, "multipartUploadId");
        const importReservedBytes =
          body.importReservedBytes === undefined
            ? undefined
            : requiredNumber(body, "importReservedBytes");
        const result = await ctx.runMutation(internal.quickShare.createUpload, {
          slug: requiredString(body, "slug"),
          ...(optionalString(body, "collectionReceiptHash")
            ? {
                collectionReceiptHash: optionalString(
                  body,
                  "collectionReceiptHash",
                ),
              }
            : {}),
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
      case "getUpload": {
        const receiptHash = optionalString(body, "receiptHash");
        const result = await ctx.runQuery(internal.quickShare.getUpload, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          ...(receiptHash ? { receiptHash } : {}),
          ...(ownerTokenIdentifier ? { ownerTokenIdentifier } : {}),
        });
        return result ? json(result) : json({ error: "Not found" }, 404);
      }
      case "recordPart": {
        await ctx.runMutation(internal.quickShare.recordPart, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          receiptHash: requiredString(body, "receiptHash"),
          partNumber: requiredNumber(body, "partNumber"),
          etag: requiredString(body, "etag"),
          size: requiredNumber(body, "size"),
          now,
        });
        return json({ ok: true });
      }
      case "complete": {
        const result = await ctx.runMutation(internal.quickShare.markComplete, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          receiptHash: requiredString(body, "receiptHash"),
          now,
        });
        return json(result);
      }
      case "finishImport": {
        const declaredMime = optionalString(body, "declaredMime");
        const result = await ctx.runMutation(internal.quickShare.finishImport, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          receiptHash: requiredString(body, "receiptHash"),
          originalName: requiredString(body, "originalName"),
          ...(declaredMime ? { declaredMime } : {}),
          originalSize: requiredNumber(body, "originalSize"),
          now,
        });
        return json(result);
      }
      case "failImport": {
        await ctx.runMutation(internal.quickShare.failImport, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          receiptHash: requiredString(body, "receiptHash"),
          now,
        });
        return json({ ok: true });
      }
      case "public": {
        const result = await ctx.runQuery(internal.quickShare.getPublicUpload, {
          slug: requiredString(body, "slug"),
          now,
        });
        return result ? json(result) : json({ error: "Not found" }, 404);
      }
      case "publicCollection": {
        const result = await ctx.runQuery(
          internal.quickShare.getPublicCollection,
          { slug: requiredString(body, "slug"), now },
        );
        return result.length > 0
          ? json(result)
          : json({ error: "Not found" }, 404);
      }
      case "accountList": {
        if (!ownerTokenIdentifier) return json({ error: "Unauthorized" }, 401);
        const result = await ctx.runQuery(internal.quickShare.accountUploads, {
          ownerTokenIdentifier,
          now,
        });
        return json(result);
      }
      case "extend": {
        if (!ownerTokenIdentifier) return json({ error: "Unauthorized" }, 401);
        const result = await ctx.runMutation(internal.quickShare.extendUpload, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          ownerTokenIdentifier,
          now,
        });
        return json(result);
      }
      case "claimJob": {
        const result = await ctx.runMutation(internal.quickShare.claimJob, {
          jobId: requiredString(body, "jobId") as Id<"quick_share_jobs">,
          leaseId: requiredString(body, "leaseId"),
          now,
        });
        return json(result);
      }
      case "finishProcess": {
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
        const compatibilityWarning = optionalString(
          body,
          "compatibilityWarning",
        );
        const result = await ctx.runMutation(
          internal.quickShare.finishProcessJob,
          {
            jobId: requiredString(body, "jobId") as Id<"quick_share_jobs">,
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
          },
        );
        return json(result);
      }
      case "finishDelete": {
        await ctx.runMutation(internal.quickShare.finishDeleteJob, {
          jobId: requiredString(body, "jobId") as Id<"quick_share_jobs">,
          leaseId: requiredString(body, "leaseId"),
        });
        return json({ ok: true });
      }
      case "adminList": {
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
      case "adminGet": {
        if (!isAdmin(ownerTokenIdentifier)) {
          return json({ error: "Forbidden" }, 403);
        }
        const result = await ctx.runQuery(internal.quickShare.adminGet, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
        });
        return result ? json(result) : json({ error: "Not found" }, 404);
      }
      case "adminBan": {
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
      case "adminUnban": {
        if (!isAdmin(ownerTokenIdentifier)) {
          return json({ error: "Forbidden" }, 403);
        }
        await ctx.runMutation(internal.quickShare.unbanIp, {
          ipHash: requiredString(body, "ipHash"),
          now,
        });
        return json({ ok: true });
      }
      case "adminRemove": {
        if (!isAdmin(ownerTokenIdentifier)) {
          return json({ error: "Forbidden" }, 403);
        }
        await ctx.runMutation(internal.quickShare.removeUpload, {
          uploadId: requiredString(
            body,
            "uploadId",
          ) as Id<"quick_share_uploads">,
          now,
        });
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown operation" }, 400);
    }
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
