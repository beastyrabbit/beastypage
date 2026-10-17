import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getRequestIdentity = vi.fn();
const handleQuickShareOperation = vi.fn();
vi.mock("@/server/auth/identity", () => ({
  getRequestIdentity,
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
    getRequestIdentity.mockReset();
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
    getRequestIdentity.mockResolvedValue({ tokenIdentifier: null });
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
    getRequestIdentity.mockResolvedValue({ tokenIdentifier: null });
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
      getRequestIdentity.mockResolvedValue({ tokenIdentifier: "iss|owner" });
      handleQuickShareOperation.mockResolvedValue({
        status: 200,
        body: { op },
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
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ op });
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
    getRequestIdentity.mockResolvedValue({ tokenIdentifier: null });
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
