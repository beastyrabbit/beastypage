import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase, getDb } from "@/server/db/client";
import { getOrCreateUser } from "@/server/services/users";

const getRequestIdentity = vi.fn();

vi.mock("@/server/auth/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/identity")>()),
  getRequestIdentity,
}));

const env = { ...process.env };
const owner = {
  tokenIdentifier: `https://routes.variants|${crypto.randomUUID()}`,
};
const anonymous = { tokenIdentifier: null };
let route: typeof import("./route");

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  getRequestIdentity.mockResolvedValue(owner);
  route = await import("./route");
});

afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/user-variants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("user variants route", () => {
  it("lists and upserts a variant", async () => {
    getRequestIdentity.mockResolvedValue(owner);
    await getOrCreateUser(getDb(), owner);
    const created = await route.POST(
      request({
        operation: "upsert",
        toolKey: "dash",
        variantId: "route-variant",
        name: "Route variant",
        settings: {},
        isActive: false,
      }),
    );
    expect(created.status).toBe(200);
    const listed = await route.GET(
      new NextRequest("http://localhost/api/user-variants?toolKey=dash"),
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variantId: "route-variant" }),
      ]),
    );
  });

  it("denies anonymous mutations and rejects malformed bodies", async () => {
    getRequestIdentity.mockResolvedValue(anonymous);
    const denied = await route.POST(
      request({
        operation: "setActive",
        toolKey: "dash",
      }),
    );
    expect(denied.status).toBe(403);
    getRequestIdentity.mockResolvedValue(owner);
    const invalid = await route.POST(request({ operation: "upsert" }));
    expect(invalid.status).toBe(400);
  });
});
