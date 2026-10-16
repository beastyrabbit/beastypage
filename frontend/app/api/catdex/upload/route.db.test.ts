import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeDatabase, getDb, getPool } from "@/server/db/client";
import { collection } from "@/server/db/schema";
import { MAX_CARD_UPLOAD_BYTES } from "@/server/services/files";

vi.mock("@/server/auth/identity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/auth/identity")>();
  return {
    ...actual,
    getRequestIdentity: vi.fn(async () => ({ tokenIdentifier: null })),
  };
});

const originalEnv = { ...process.env };
let uploadUrlRoute: typeof import("../upload-url/route");
let uploadRoute: typeof import("./route");
let fileRoute: typeof import("@/app/api/files/[id]/route");
const validPng = Buffer.from(
  "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDAT\x08\xd7c\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB\x60\x82",
  "binary",
);

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function issueToken(clientKey: string) {
  const response = await uploadUrlRoute.POST(
    jsonRequest("http://localhost/api/catdex/upload-url", { clientKey }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { uploadUrl: string };
  return new URL(body.uploadUrl, "http://localhost").searchParams.get(
    "token",
  ) as string;
}

function uploadRequest(
  token: string,
  body: BodyInit,
  contentType = "image/png",
  headers?: Record<string, string>,
) {
  return new NextRequest(
    `http://localhost/api/catdex/upload?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": contentType, ...headers },
      body,
    },
  );
}

beforeAll(async () => {
  process.env.DATA_BACKEND = "postgres";
  process.env.DATABASE_URL = inject("databaseUrl");
  uploadUrlRoute = await import("../upload-url/route");
  uploadRoute = await import("./route");
  fileRoute = await import("@/app/api/files/[id]/route");
});

afterAll(async () => {
  await closeDatabase();
  process.env = originalEnv;
});

describe("Catdex PostgreSQL upload routes", () => {
  it("keeps the CORS preflight contract and rejects missing or unsupported tokens/media", async () => {
    const preflight = await uploadRoute.OPTIONS();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );

    const missingToken = await uploadRoute.POST(
      new NextRequest("http://localhost/api/catdex/upload", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: validPng,
      }),
    );
    expect(missingToken.status).toBe(400);
    expect(missingToken.headers.get("access-control-allow-origin")).toBe("*");

    const invalidUploadUrlBody = await uploadUrlRoute.POST(
      jsonRequest("http://localhost/api/catdex/upload-url", {
        clientKey: 123,
      }),
    );
    expect(invalidUploadUrlBody.status).toBe(400);

    const token = await issueToken("upload-media-case-1234");
    const unsupported = await uploadRoute.POST(
      uploadRequest(token, "plain text", "text/plain"),
    );
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({
      error: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects expired and reused one-time tokens", async () => {
    const expiredToken = await issueToken("upload-expired-case-1234");
    await getPool().query(
      "update catdex_uploads set expires_at = now() - interval '1 minute' where token = $1",
      [expiredToken],
    );
    const expired = await uploadRoute.POST(
      uploadRequest(expiredToken, validPng),
    );
    expect(expired.status).toBe(410);
    expect(await expired.json()).toEqual({ error: "UPLOAD_EXPIRED" });

    const replayToken = await issueToken("upload-replay-case-1234");
    const first = await uploadRoute.POST(uploadRequest(replayToken, validPng));
    expect(first.status).toBe(200);
    const replay = await uploadRoute.POST(uploadRequest(replayToken, validPng));
    expect(replay.status).toBe(410);
    expect(await replay.json()).toEqual({ error: "UPLOAD_EXPIRED" });
  });

  it("enforces Content-Length and actual-body size limits", async () => {
    const declaredToken = await issueToken("upload-length-case-1234");
    const declared = await uploadRoute.POST(
      uploadRequest(declaredToken, new Uint8Array(), "image/png", {
        "content-length": String(MAX_CARD_UPLOAD_BYTES + 1),
      }),
    );
    expect(declared.status).toBe(413);
    expect(await declared.json()).toEqual({ error: "FILE_TOO_LARGE" });

    const bodyToken = await issueToken("upload-body-case-1234");
    const oversized = new Uint8Array(MAX_CARD_UPLOAD_BYTES + 1);
    const body = await uploadRoute.POST(
      uploadRequest(bodyToken, oversized, "image/png"),
    );
    expect(body.status).toBe(413);
    expect(await body.json()).toEqual({ error: "FILE_TOO_LARGE" });
  });

  it("rejects undecodable raster bytes and serves a successful upload through files", async () => {
    const invalidToken = await issueToken("upload-invalid-case-1234");
    const invalid = await uploadRoute.POST(
      uploadRequest(invalidToken, "not an image", "image/png"),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "INVALID_IMAGE" });

    const token = await issueToken("upload-success-case-1234");
    const response = await uploadRoute.POST(uploadRequest(token, validPng));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await response.json()) as {
      fileId: string;
      storageId: string;
    };
    expect(body.fileId).toBe(body.storageId);
    expect(body.fileId).toMatch(/^[0-9a-f-]{36}$/);

    await getDb().insert(collection).values({
      artistName: "Upload route fixture",
      animal: "cat",
      link: "https://example.test/upload",
      previewImgFileId: body.fileId,
    });
    const served = await fileRoute.GET(
      new NextRequest(`http://localhost/api/files/${body.fileId}`),
      { params: Promise.resolve({ id: body.fileId }) },
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(validPng);
  });

  it("rate-limits a keyed upload-url bucket", async () => {
    const clientKey = "upload-rate-limit-case-1234";
    for (let index = 0; index < 12; index += 1) {
      await expect(issueToken(clientKey)).resolves.toMatch(/[0-9a-f-]{36}/);
    }
    const limited = await uploadUrlRoute.POST(
      jsonRequest("http://localhost/api/catdex/upload-url", { clientKey }),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
  });
});
