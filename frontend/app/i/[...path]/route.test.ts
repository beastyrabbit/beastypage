import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("media proxy internal paths", () => {
  it("forwards the authenticated canonical worker endpoint", async () => {
    const fetchMock = vi.fn(
      async () => new Response("accepted", { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("https://beastyrabbit.com/i/api/internal/jobs/job-id", {
        method: "POST",
        headers: { "x-quick-share-internal-token": "test-token" },
      }),
    );

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects percent-encoded internal paths before proxying", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("https://beastyrabbit.com/i/api%2Finternal/jobs/job-id", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
