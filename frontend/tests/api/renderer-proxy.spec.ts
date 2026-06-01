import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyRendererJson } from "@/app/api/renderer/_lib/proxy";

describe("renderer proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards render requests to the backend as POST with the JSON body", async () => {
    const body = JSON.stringify({
      payload: {
        spriteNumber: 8,
        params: { peltName: "SingleColour", colour: "WHITE" },
      },
    });
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ image: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/renderer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
    });

    const response = await proxyRendererJson(request, {
      path: "/render",
      validate: () => null,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8001/render",
      expect.objectContaining({
        method: "POST",
        body,
        redirect: "manual",
      }),
    );
  });

  it("surfaces manual upstream redirects as proxy errors", async () => {
    const body = JSON.stringify({
      payload: {
        spriteNumber: 8,
        params: { peltName: "SingleColour", colour: "WHITE" },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(null, {
          status: 307,
          headers: { location: "http://127.0.0.1:8001/render/" },
        });
      }),
    );

    const request = new NextRequest("http://localhost/api/renderer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
    });

    const response = await proxyRendererJson(request, {
      path: "/render",
      validate: () => null,
    });
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(payload.error).toContain("redirected");
    expect(payload.error).toContain("/render/");
  });
});
