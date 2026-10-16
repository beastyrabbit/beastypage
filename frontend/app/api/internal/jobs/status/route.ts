import { NextResponse } from "next/server";
import { getRequestIdentity, isAdminIdentity } from "@/server/auth/identity";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";
import { getJobStatus } from "@/server/jobs/status";

export const dynamic = "force-dynamic";

export async function GET() {
  if (dataBackend() !== "postgres") {
    return NextResponse.json(
      { error: "Jobs require PostgreSQL", code: "unavailable" },
      { status: 503 },
    );
  }

  try {
    const identity = await getRequestIdentity();
    if (!isAdminIdentity(identity)) {
      return NextResponse.json(
        { error: "Forbidden", code: "forbidden" },
        { status: 403 },
      );
    }

    const report = await getJobStatus(getDb());
    return NextResponse.json(report, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(
      error,
      "Failed to load job status",
      "Failed to load PostgreSQL job status",
    );
  }
}
