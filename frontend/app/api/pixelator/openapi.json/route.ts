import { NextResponse } from "next/server";

const BACKEND_BASE = (
  process.env.IMAGE_PROCESSING_INTERNAL_URL ?? "http://127.0.0.1:8002"
).replace(/\/$/, "");

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_BASE}/openapi.json`, {
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Image processing OpenAPI spec unavailable" },
        { status: upstream.status },
      );
    }

    const spec = await upstream.json();
    return NextResponse.json(spec, {
      headers: { "cache-control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json(
      { error: "Image processing service unavailable" },
      { status: 502 },
    );
  }
}
