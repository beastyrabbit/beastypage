import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIdentity } from "@/server/auth/identity";
import { getDb } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { errorResponse } from "@/server/http";
import { parseJsonBody, parseSearchParams } from "@/server/request";
import {
  createStreamSession,
  listStreamSessions,
  updateStreamSession,
} from "@/server/services/stream";

const querySchema = z.object({
  status: z.string().optional(),
  exclude: z.string().optional(),
  viewerKey: z.string().optional(),
  limit: z.coerce.number().optional(),
});
const bodySchema = z
  .object({
    operation: z.enum(["create", "update"]),
    id: z.string().uuid().optional(),
    allowedOptions: z.array(z.string()).max(2000).optional(),
    viewerKey: z.string().optional(),
    status: z.enum(["live", "completed"]).optional(),
    currentStep: z.string().optional(),
    stepIndex: z.number().optional(),
    stepHistory: z.unknown().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    allowRepeatIps: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.operation === "create") {
      if (!value.viewerKey)
        context.addIssue({
          code: "custom",
          path: ["viewerKey"],
          message: "Viewer key is required",
        });
      if (!value.status)
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
        message: "Session id is required",
      });
  });

export async function GET(request: NextRequest) {
  try {
    const args = parseSearchParams(request.nextUrl.searchParams, querySchema);
    return NextResponse.json(
      await listStreamSessions(getDb(), args, await getRequestIdentity()),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load stream sessions",
      "stream sessions GET",
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseJsonBody(request, bodySchema);
    const identity = await getRequestIdentity();
    if (input.operation === "create")
      return NextResponse.json(
        await createStreamSession(
          getDb(),
          {
            ...input,
            viewerKey: input.viewerKey ?? "",
            status: input.status ?? "live",
          },
          identity,
        ),
      );
    if (!input.id) throw new ServiceError("invalid_input", "Invalid request");
    return NextResponse.json(
      await updateStreamSession(
        getDb(),
        {
          ...input,
          id: input.id,
          viewerKey: input.viewerKey,
          status: input.status,
        },
        identity,
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Failed to save stream session",
      "stream sessions POST",
    );
  }
}

export const PATCH = POST;
