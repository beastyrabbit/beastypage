import { NextRequest, NextResponse } from "next/server";

export const config = {
  api: { bodyParser: { sizeLimit: "60mb" } },
};

const BACKEND_BASE = (
  process.env.IMAGE_PROCESSING_INTERNAL_URL ?? "http://127.0.0.1:8002"
).replace(/\/$/, "");

const TIMEOUT_MS = 60_000;

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
    const upstream = await fetch(`${BACKEND_BASE}/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await upstream.text();

    if (!upstream.ok) {
      console.error(`[pixelator-proxy] upstream returned ${upstream.status}:`, data.slice(0, 500));
    }

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
      return NextResponse.json({ error: "Processing timed out" }, { status: 504 });
    }
    console.error("[pixelator-proxy] upstream error:", error);
    return NextResponse.json({ error: "Image processing service unavailable" }, { status: 502 });
  }
}
