import { NextResponse } from "next/server";
import { getPool } from "@/server/db/client";
import {
  checkCompatibility,
  readSchemaState,
} from "@/server/db/schema-version";

export const dynamic = "force-dynamic";

/**
 * Readiness for the PostgreSQL backend: 200 only when the database is
 * reachable and its schema is compatible with this build. Not wired into
 * any probe until the cutover (docs/migration/operations.md).
 */
export async function GET() {
  if (process.env.DATA_BACKEND !== "postgres") {
    return NextResponse.json(
      { ok: false, reason: "postgres backend not selected" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, reason: "database not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const compatibility = checkCompatibility(await readSchemaState(getPool()));
    return NextResponse.json(compatibility, {
      status: compatibility.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "[health] database check failed",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { ok: false, reason: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
