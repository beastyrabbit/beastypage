import { NextResponse } from "next/server";

const RENDERER_BASE = (
  process.env.RENDERER_INTERNAL_URL ?? "http://127.0.0.1:8001"
).replace(/\/$/, "");

export async function GET() {
  try {
    const upstream = await fetch(`${RENDERER_BASE}/openapi.json`, {
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Renderer OpenAPI spec unavailable" },
        { status: upstream.status },
      );
    }

    const spec = await upstream.json();
    return NextResponse.json(spec, {
      headers: { "cache-control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json(
      { error: "Renderer service unavailable" },
      { status: 502 },
    );
  }
}
