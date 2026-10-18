import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeDatabase, getPool } from "@/server/db/client";

const env = { ...process.env };
let route: typeof import("@/app/api/files/[id]/route");
let publicId: string;
let orphanId: string;
const bytes = Buffer.from("\x89PNG fake image bytes for the route test");
const sha = createHash("sha256").update(bytes).digest("hex");

async function insertFile(content: Buffer) {
  const hash = createHash("sha256").update(content).digest("hex");
  const result = await getPool().query<{ id: string }>(
    "insert into files (sha256, mime_type, byte_size, bytes) values ($1, 'image/png', $2, $3) returning id",
    [hash, content.length, content],
  );
  return result.rows[0]?.id as string;
}

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  route = await import("@/app/api/files/[id]/route");
  publicId = await insertFile(bytes);
  orphanId = await insertFile(Buffer.from("orphan"));
  await getPool().query(
    "insert into collection (artist_name, animal, link, preview_img_file_id) values ('a', 'cat', 'https://example.com', $1)",
    [publicId],
  );
});

afterAll(async () => {
  await closeDatabase();
  process.env = env;
});

const fetchFile = (id: string, headers: Record<string, string> = {}) =>
  route.GET(new NextRequest(`http://localhost/api/files/${id}`, { headers }), {
    params: Promise.resolve({ id }),
  });

describe("file route", () => {
  it("serves referenced bytes with immutable caching", async () => {
    const response = await fetchFile(publicId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe(`"${sha}"`);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("answers 304 to a matching If-None-Match", async () => {
    const response = await fetchFile(publicId, {
      "if-none-match": `W/"other", "${sha}"`,
    });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("does not serve orphaned files, unknown ids or non-UUIDs", async () => {
    expect((await fetchFile(orphanId)).status).toBe(404);
    expect(
      (await fetchFile("00000000-0000-4000-8000-000000000000")).status,
    ).toBe(404);
    expect((await fetchFile("kg2abc")).status).toBe(404);
  });
});
