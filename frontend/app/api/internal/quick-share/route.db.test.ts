import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const identityFromForwardedToken = vi.fn();
const handleQuickShareOperation = vi.fn();
vi.mock("@/server/auth/identity", () => ({
  ANONYMOUS: { tokenIdentifier: null },
  identityFromForwardedToken,
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => ({}),
}));
vi.mock("@/server/services/quickShare", () => ({
  handleQuickShareOperation,
  quickShareErrorStatus: () => 500,
}));

describe("POST /api/internal/quick-share", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    identityFromForwardedToken.mockReset();
    handleQuickShareOperation.mockReset();
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

  it("is unavailable while Convex remains the selected backend", async () => {
    vi.stubEnv("DATA_BACKEND", "convex");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
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
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("returns the policy through the PostgreSQL route", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    handleQuickShareOperation.mockResolvedValue({
      status: 200,
      body: { tier: "anonymous", chunkBytes: 16 * 1024 * 1024 },
    });
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

  it("accepts the internal token as a bearer credential", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    handleQuickShareOperation.mockResolvedValue({
      status: 200,
      body: { tier: "anonymous" },
    });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          authorization: "Bearer internal-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ op: "policy" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tier: "anonymous" });
  });

  it("never treats the internal bearer credential as a user token", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    handleQuickShareOperation.mockResolvedValue({ status: 200, body: {} });
    const { POST } = await import("./route");
    await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          authorization: "Bearer internal-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ op: "policy" }),
      }),
    );
    expect(identityFromForwardedToken).not.toHaveBeenCalled();
    expect(handleQuickShareOperation).toHaveBeenCalledWith(
      expect.anything(),
      "policy",
      expect.anything(),
      { tokenIdentifier: null },
    );
  });

  it("rejects an invalid forwarded user token", async () => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    identityFromForwardedToken.mockRejectedValue(new Error("expired"));
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          authorization: "Bearer stale-user-token",
          "content-type": "application/json",
          "x-quick-share-internal-token": "internal-token",
        },
        body: JSON.stringify({ op: "adminList" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(handleQuickShareOperation).not.toHaveBeenCalled();
  });

  const operations = [
    "policy",
    "create",
    "getUpload",
    "recordPart",
    "complete",
    "finishImport",
    "failImport",
    "public",
    "publicCollection",
    "accountList",
    "extend",
    "claimJob",
    "finishProcess",
    "finishDelete",
    "adminList",
    "adminGet",
    "adminBan",
    "adminUnban",
    "adminRemove",
  ] as const;

  it.each(operations)(
    "dispatches %s through the PostgreSQL route",
    async (op) => {
      vi.stubEnv("DATA_BACKEND", "postgres");
      vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
      identityFromForwardedToken.mockResolvedValue({
        tokenIdentifier: "iss|owner",
      });
      handleQuickShareOperation.mockResolvedValue({
        status: 200,
        body: { op },
      });
      const { POST } = await import("./route");
      const response = await POST(
        new NextRequest("http://localhost/api/internal/quick-share", {
          method: "POST",
          headers: {
            authorization: "Bearer user-token",
            "content-type": "application/json",
            "x-quick-share-internal-token": "internal-token",
          },
          body: JSON.stringify({ op }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ op });
      expect(identityFromForwardedToken).toHaveBeenCalledWith("user-token");
      expect(handleQuickShareOperation).toHaveBeenCalledWith(
        expect.anything(),
        op,
        expect.objectContaining({ op }),
        { tokenIdentifier: "iss|owner" },
      );
    },
  );

  it.each(operations)("preserves a denial from %s", async (op) => {
    vi.stubEnv("DATA_BACKEND", "postgres");
    vi.stubEnv("QUICK_SHARE_INTERNAL_TOKEN", "internal-token");
    handleQuickShareOperation.mockResolvedValue({
      status: 403,
      body: { error: "Forbidden" },
    });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/quick-share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-quick-share-internal-token": "internal-token",
        },
        body: JSON.stringify({ op }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
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
