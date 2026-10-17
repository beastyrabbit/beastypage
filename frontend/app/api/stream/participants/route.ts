import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  createStreamParticipant,
  listStreamParticipants,
  updateStreamParticipant,
} from "@/server/services/stream";

const querySchema = z.object({
  session: z.string().uuid(),
  viewerSession: z.string().optional(),
  limit: z.coerce.number().optional(),
});
const bodySchema = z
  .object({
    operation: z.enum(["create", "update"]),
    id: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    viewerSession: z.string().optional(),
    displayName: z.string().optional(),
    status: z.string().optional(),
    fingerprint: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.operation === "create") {
      if (!value.sessionId)
        context.addIssue({
          code: "custom",
          path: ["sessionId"],
          message: "Session id is required",
        });
      if (value.displayName === undefined)
        context.addIssue({
          code: "custom",
          path: ["displayName"],
          message: "Display name is required",
        });
      if (value.status === undefined)
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "Status is required",
        });
    }
    if (value.operation === "update" && !value.id)
      context.addIssue({
        code: "custom",
        path: ["id"],
        message: "Participant id is required",
      });
  });
function unavailable() {
  return NextResponse.json(
    { error: "Not found", code: "not_found" },
    { status: 404 },
  );
}
export async function GET(request: NextRequest) {
  if (dataBackend() !== "postgres") return unavailable();
  try {
    return NextResponse.json(
      await listStreamParticipants(
        getDb(),
        parseSearchParams(request.nextUrl.searchParams, querySchema),
        await getRequestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load participants",
      "stream participants GET",
    );
  }
}
export async function POST(request: NextRequest) {
  if (dataBackend() !== "postgres") return unavailable();
  try {
    const input = await parseJsonBody(request, bodySchema);
    if (input.operation === "create")
      return NextResponse.json(
        await createStreamParticipant(getDb(), {
          sessionId: input.sessionId ?? "",
          viewerSession: input.viewerSession,
          displayName: input.displayName ?? "",
          status: input.status ?? "",
          fingerprint: input.fingerprint,
        }),
      );
    if (!input.id) throw new ServiceError("invalid_input", "Invalid request");
    return NextResponse.json(
      await updateStreamParticipant(
        getDb(),
        {
          id: input.id,
          displayName: input.displayName,
          status: input.status,
          fingerprint: input.fingerprint,
          viewerSession: input.viewerSession,
        },
        await getRequestIdentity(),
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to save participant",
      "stream participants POST",
    );
  }
}
export const PATCH = POST;
