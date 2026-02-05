import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = (
  process.env.IMAGE_PROCESSING_INTERNAL_URL ?? "http://127.0.0.1:8002"
).replace(/\/$/, "");

const TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
  }

  const body = await request.text();
  if (!body) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(`${BACKEND_BASE}/detect-grid`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await upstream.text();
    return new NextResponse(data, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Detection timed out" }, { status: 504 });
    }
    console.error("[pixelator-proxy] detect-grid error:", error);
    return NextResponse.json({ error: "Image processing service unavailable" }, { status: 502 });
  }
}
