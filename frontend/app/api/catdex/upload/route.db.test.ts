import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OPTIONS, POST } from "./route";

describe("Catdex upload route", () => {
  beforeEach(() => {
    process.env.DATA_BACKEND = "postgres";
  });
  afterEach(() => {
    delete process.env.DATA_BACKEND;
  });

  it("keeps the Convex CORS contract for preflight and media rejection", async () => {
    const preflight = await OPTIONS();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    const response = await POST(
      new NextRequest("http://localhost/api/catdex/upload?token=fixture", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "fixture",
      }),
    );
    expect(response.status).toBe(415);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
