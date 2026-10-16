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
});
