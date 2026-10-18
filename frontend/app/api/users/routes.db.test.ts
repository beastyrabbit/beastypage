import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase } from "@/server/db/client";

const getRequestIdentity = vi.fn();

vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity,
}));

const env = { ...process.env };
const owner = {
  tokenIdentifier: `https://routes.users|${crypto.randomUUID()}`,
};
const anonymous = { tokenIdentifier: null };
let apiKeyRoute: typeof import("./api-key/route");
let ensureRoute: typeof import("./ensure/route");
let profileRoute: typeof import("./profile/route");
let resetRoute: typeof import("./reset-variants/route");
let resolveRoute: typeof import("./resolve/route");
let searchRoute: typeof import("./search/route");
let viewerRoute: typeof import("./viewer/route");

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  getRequestIdentity.mockResolvedValue(owner);
  [
    apiKeyRoute,
    ensureRoute,
    profileRoute,
    resetRoute,
    resolveRoute,
    searchRoute,
    viewerRoute,
  ] = await Promise.all([
    import("./api-key/route"),
    import("./ensure/route"),
    import("./profile/route"),
    import("./reset-variants/route"),
    import("./resolve/route"),
    import("./search/route"),
    import("./viewer/route"),
  ]);
});

afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("users routes", () => {
  it("supports ensure, viewer, profile, API key and reset success paths", async () => {
    getRequestIdentity.mockResolvedValue(owner);
    expect((await ensureRoute.POST()).status).toBe(200);
    expect((await viewerRoute.GET()).status).toBe(200);

    const profile = await profileRoute.PATCH(
      jsonRequest("http://localhost/api/users/profile", {
        username: `Route_User_${crypto.randomUUID().slice(0, 8)}`,
      }),
    );
    expect(profile.status).toBe(200);
    expect((await apiKeyRoute.POST()).status).toBe(200);
    expect((await resetRoute.POST()).status).toBe(200);
  });

  it("denies anonymous ensure, API key and reset requests", async () => {
    getRequestIdentity.mockResolvedValue(anonymous);
    expect((await ensureRoute.POST()).status).toBe(403);
    expect((await apiKeyRoute.POST()).status).toBe(403);
    expect((await resetRoute.POST()).status).toBe(403);
  });

  it("accepts username search and resolve results", async () => {
    getRequestIdentity.mockResolvedValue(owner);
    const search = await searchRoute.GET(
      new NextRequest("http://localhost/api/users/search?prefix=route"),
    );
    expect(search.status).toBe(200);
    const resolved = await resolveRoute.GET(
      new NextRequest(
        `http://localhost/api/users/resolve?userId=${owner.tokenIdentifier.split("|").at(-1)}`,
      ),
    );
    expect(resolved.status).toBe(200);
  });

  it("returns invalid-input responses for profile, search and resolve", async () => {
    getRequestIdentity.mockResolvedValue(owner);
    const invalidProfile = await profileRoute.PATCH(
      jsonRequest("http://localhost/api/users/profile", {
        username: "has space",
      }),
    );
    expect(invalidProfile.status).toBe(400);
    const invalidSearch = await searchRoute.GET(
      new NextRequest("http://localhost/api/users/search?prefix=a&prefix=b"),
    );
    expect(invalidSearch.status).toBe(400);
    const invalidResolve = await resolveRoute.GET(
      new NextRequest(
        `http://localhost/api/users/resolve?userId=${"x".repeat(129)}`,
      ),
    );
    expect(invalidResolve.status).toBe(400);
  });

  it("returns null for an anonymous viewer", async () => {
    getRequestIdentity.mockResolvedValue(anonymous);
    const response = await viewerRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
