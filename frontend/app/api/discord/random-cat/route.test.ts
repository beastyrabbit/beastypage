import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAT_CATALOG_HASH } from "@/lib/cat-system/generated/cat-schema.generated";

vi.mock("@napi-rs/canvas", () => ({
  createCanvas: () => ({
    getContext: () => ({
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
    }),
    toDataURL: () => "data:image/png;base64,dXBzY2FsZWQ=",
  }),
  loadImage: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/cat-v3/random-cat-server", () => ({
  generateRandomParamsServerDetailed: vi.fn().mockResolvedValue({
    document: {
      schemaVersion: 1,
      traits: {},
      unknownTraits: {},
    },
    params: {
      spriteNumber: 7,
      accessories: [],
      scars: [],
      tortie: [],
    },
  }),
  parseDiscordTraitOverride: vi.fn(),
}));

vi.mock("@/lib/convexUrl", () => ({
  getServerConvexUrl: () => null,
}));

import { POST } from "./route";

function request() {
  return new NextRequest("http://localhost/api/discord/random-cat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("Discord random-cat renderer catalog guard", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts an image rendered from the current catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          image: "data:image/png;base64,AA==",
          meta: { catalogHash: CAT_CATALOG_HASH },
        }),
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      image: "data:image/png;base64,dXBzY2FsZWQ=",
      params: { spriteNumber: 7, source: "discordkitten" },
    });
  });

  it("accepts a legacy renderer response without a catalog hash during rollout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          image: "data:image/png;base64,AA==",
          meta: {},
        }),
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
  });

  it("rejects a renderer response with a different catalog hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          image: "data:image/png;base64,AA==",
          meta: { catalogHash: "f".repeat(64) },
        }),
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Renderer catalog mismatch",
    });
  });
});
