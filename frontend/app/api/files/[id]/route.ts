import { type NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { isUuid } from "@/server/repositories/legacyLinks";
import { findServableFile, readFileBytes } from "@/server/services/files";

export const dynamic = "force-dynamic";

const notFound = () =>
  NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });

/**
 * Serves image bytes from PostgreSQL (#110). File ids never change content,
 * so responses are immutable and revalidate by ETag (the SHA-256).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (dataBackend() !== "postgres") return notFound();
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const db = getDb();
  const file = await findServableFile(db, id);
  if (!file) return notFound();

  const etag = `"${file.sha256}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (
    ifNoneMatch
      ?.split(",")
      .some((tag) => tag.trim().replace(/^W\//, "") === etag)
  ) {
    return new NextResponse(null, { status: 304, headers });
  }

  const bytes = await readFileBytes(db, id);
  if (!bytes) return notFound();
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Length": String(file.byteSize),
    },
  });
}
