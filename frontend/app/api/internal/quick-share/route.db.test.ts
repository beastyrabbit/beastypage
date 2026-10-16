import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getRequestIdentity = vi.fn();
vi.mock("@/server/auth/identity", () => ({
  getRequestIdentity,
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => ({}),
}));

describe("POST /api/internal/quick-share", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getRequestIdentity.mockReset();
  });

  it("requires the internal token with a constant-time comparison", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        body: JSON.stringify({ op: "policy" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns the policy through the PostgreSQL route", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    getRequestIdentity.mockResolvedValue({ tokenIdentifier: null });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quick-share-internal-token": "internal-token",
        },
        body: JSON.stringify({ op: "policy" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tier: "anonymous",
      chunkBytes: 16 * 1024 * 1024,
    });
  });

  it("rejects malformed JSON before dispatching an operation", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quick-share-internal-token": "internal-token",
        },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  it("keeps the Convex missing-operation response", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quick-share-internal-token": "internal-token",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing operation" });
  });
});
