import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase } from "@/server/db/client";

const env = { ...process.env };
let route: typeof import("@/app/api/dash-settings/route");

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  route = await import("@/app/api/dash-settings/route");
});

afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

const post = (body: unknown) =>
  route.POST(
    new NextRequest("http://localhost/api/dash-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const get = (slug: string) =>
  route.GET(new NextRequest(`http://localhost/api/dash-settings?slug=${slug}`));

describe("settings route on PostgreSQL", () => {
  it("creates, reads and edits with the edit token", async () => {
    const created = await post({ config: { v: 1, widgets: ["wheel"] } });
    expect(created.status).toBe(200);
    const { slug, editToken, updated } = await created.json();
    expect(updated).toBe(false);

    const read = await get(slug);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      slug,
      config: { v: 1, widgets: ["wheel"] },
    });

    const edited = await post({
      config: { v: 1, widgets: [] },
      slug,
      editToken,
    });
    expect(await edited.json()).toMatchObject({
      slug,
      updated: true,
      editToken,
    });
  });

  it("maps refusals to the error contract", async () => {
    const { slug } = await (await post({ config: { v: 1 } })).json();
    const denied = await post({ config: { v: 1 }, slug, editToken: "wrong" });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      error: "Not authorized to edit settings",
      code: "forbidden",
    });

    const invalid = await post({ config: { v: 1, widgets: "wheel" } });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "Invalid config",
      code: "invalid_input",
    });

    expect((await post({})).status).toBe(400);
    expect((await get("doesNotExist")).status).toBe(404);
  });
});
