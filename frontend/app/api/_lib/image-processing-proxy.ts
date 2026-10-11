import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";

const BACKEND_BASE = (
  process.env.IMAGE_PROCESSING_INTERNAL_URL ?? "http://127.0.0.1:8002"
).replace(/\/$/, "");
const DEFAULT_MAX_BODY_BYTES = 16 * 1024 * 1024;

interface ImageProcessingProxyOptions {
  endpoint: string;
  timeoutMs: number;
  timeoutMessage: string;
  maxBodyBytes?: number;
  upstreamLabel?: string;
}

export function createImageProcessingProxyHandler({
  endpoint,
  timeoutMs,
  timeoutMessage,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  upstreamLabel = "",
}: ImageProcessingProxyOptions) {
  const label = upstreamLabel ? `${upstreamLabel} ` : "";

  return async function POST(request: NextRequest) {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return NextResponse.json(
        { error: "Expected application/json" },
        { status: 415 },
      );
    }

    let body: string;
    try {
      body = await readRequestBody(request, maxBodyBytes);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "Request body is too large" },
          { status: 413 },
        );
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return NextResponse.json({ error: "Request aborted" }, { status: 499 });
      }
      throw error;
    }
    if (!body) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetch(`${BACKEND_BASE}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.any([controller.signal, request.signal]),
        redirect: "error",
      });

      const data = await upstream.text();
      clearTimeout(timeout);

      if (!upstream.ok) {
        console.error(
          `[pixelator-proxy] ${label}upstream returned ${upstream.status}:`,
          data.slice(0, 500),
        );
      }

      return new NextResponse(data, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      if (request.signal.aborted) {
        return NextResponse.json({ error: "Request aborted" }, { status: 499 });
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return NextResponse.json({ error: timeoutMessage }, { status: 504 });
      }
      console.error(`[pixelator-proxy] ${label}error:`, error);
      return NextResponse.json(
        { error: "Image processing service unavailable" },
        { status: 502 },
      );
    }
  };
}
