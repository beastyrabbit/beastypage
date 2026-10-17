import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchJson } from "./fetch-json";

describe("fetchJson", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes JSON and parses a successful response", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toBeInstanceOf(Headers);
        expect(new Headers(init?.headers).get("Content-Type")).toBe(
          "application/json",
        );
        expect(init?.body).toBe(JSON.stringify({ name: "Mochi" }));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJson<{ ok: boolean }>("/api/example", {
        method: "POST",
        body: { name: "Mochi" },
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("maps the server error contract to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Nope", code: "forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const promise = fetchJson("/api/example");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Nope",
    });
  });

  it("returns null for an opted-in missing record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(
      fetchJson<{ id: string }>("/api/example", { nullable: true }),
    ).resolves.toBeNull();
  });

  it("still throws server errors for an opted-in nullable lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "Broken", code: "unavailable" }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );

    await expect(
      fetchJson("/api/example", { nullable: true }),
    ).rejects.toMatchObject({ status: 500, code: "unavailable" });
  });
});
