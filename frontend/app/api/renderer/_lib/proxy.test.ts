import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../preview/[id]/route";
import { proxyRendererJson } from "./proxy";

const originalFetch = globalThis.fetch;

function jsonRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/renderer/render", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ payload: { params: {} } }),
  });
}

function encodedCatUrl(payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `http://localhost/api/preview/_?cat=${encodeURIComponent(encoded)}`;
}

describe("proxyRendererJson", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not forward client auth and only returns safe upstream headers", async () => {
    const forwardedHeaders: Headers[] = [];
    globalThis.fetch = vi.fn(async (_input, init) => {
      forwardedHeaders.push(init?.headers as Headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": "11",
          "set-cookie": "session=leaked",
          "x-internal-renderer": "debug",
        },
      });
    }) as typeof fetch;

    const response = await proxyRendererJson(
      jsonRequest({
        authorization: "Bearer client-token",
        "x-request-id": "request-1",
        "x-trace-id": "trace-1",
      }),
      { path: "/render" },
    );

    expect(forwardedHeaders[0]?.get("authorization")).toBeNull();
    expect(forwardedHeaders[0]?.get("x-request-id")).toBe("request-1");
    expect(forwardedHeaders[0]?.get("x-trace-id")).toBe("trace-1");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-length")).toBe("11");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-internal-renderer")).toBeNull();
  });
});

describe("preview route", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a PNG response for a valid renderer sheet", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        sheet: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString(
          "base64",
        )}`,
      }),
    ) as typeof fetch;

    const response = await GET(new NextRequest(encodedCatUrl({ params: {} })), {
      params: Promise.resolve({ id: "_" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("rejects invalid renderer image payloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ sheet: "data:text/plain;base64,Zm9v" }),
    ) as typeof fetch;

    const response = await GET(new NextRequest(encodedCatUrl({ params: {} })), {
      params: Promise.resolve({ id: "_" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Renderer returned invalid image data",
    });
  });

  it("times out stuck renderer requests", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    ) as typeof fetch;

    const pending = GET(new NextRequest(encodedCatUrl({ params: {} })), {
      params: Promise.resolve({ id: "_" }),
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await pending;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "Renderer request timed out",
    });
  });
});
