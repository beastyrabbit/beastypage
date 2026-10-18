import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ANONYMOUS,
  type Identity,
  identityFromForwardedToken,
} from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { parseJsonBody } from "@/server/request";
import {
  handleQuickShareOperation,
  quickShareErrorStatus,
} from "@/server/services/quickShare";

const bodySchema = z.record(z.string(), z.unknown());

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, noarchive, nosnippet",
    },
  });
}

export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return json({ error: "Not found" }, 404);

  const expected = process.env.QUICK_SHARE_INTERNAL_TOKEN;
  const receivedHeader = request.headers.get("x-quick-share-internal-token");
  const authorization = request.headers.get("authorization");
  const received =
    receivedHeader ??
    (authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : null);
  if (!expected || !received || !constantTimeEqual(expected, received))
    return json({ error: "Unauthorized" }, 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = await parseJsonBody(request, bodySchema);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const op = body.op;
  if (typeof op !== "string" || op.length === 0)
    return json({ error: "Missing operation" }, 400);

  // With the internal-token header present, Authorization carries the end
  // user's Clerk token, forwarded by the media service.
  let identity: Identity = ANONYMOUS;
  const userToken =
    receivedHeader && authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
  if (userToken) {
    try {
      identity = await identityFromForwardedToken(userToken);
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    const result = await handleQuickShareOperation(getDb(), op, body, identity);
    return json(result.body, result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error(`[quick-share] ${op} failed`, message);
    const status = quickShareErrorStatus(message);
    return json(
      {
        error:
          status === 500 ? "Quick Share is temporarily unavailable" : message,
      },
      status,
    );
  }
}
