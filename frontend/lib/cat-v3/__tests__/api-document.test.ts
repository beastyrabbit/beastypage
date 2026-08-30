import { afterEach, describe, expect, it, vi } from "vitest";
import { legacyParamsToCatDocument } from "@/lib/cat-system/document";
import { CAT_CATALOG_HASH } from "@/lib/cat-system/generated/cat-schema.generated";
import { renderCatBatchV3, renderCatV3 } from "../api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderCatV3 canonical document boundary", () => {
  it("sends the document and a merged legacy fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          image: "data:image/png;base64,AA==",
          meta: {
            started_at: 1,
            finished_at: 2,
            duration_ms: 1,
            memory_pressure: false,
            catalogHash: CAT_CATALOG_HASH,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const document = legacyParamsToCatDocument({
      poseName: "adult_short1",
      peltName: "Tabby",
      colour: "GINGER",
      eyeColour: "GREEN",
      skinColour: "PINK",
      shading: false,
      reverse: false,
      isTortie: false,
    });

    await renderCatV3(
      {
        document,
        params: { tint: "blue" },
      },
      { baseUrl: "http://renderer.test" },
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.payload.document).toEqual(document);
    expect(body.payload.spriteNumber).toBe(7);
    expect(body.payload.poseName).toBe("adult_short1");
    expect(body.payload.params.peltName).toBe("Tabby");
    expect(body.payload.params.colour).toBe("GINGER");
    expect(body.payload.params.tint).toBe("blue");
  });

  it("checks and normalizes the renderer's aliased contract metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            image: "data:image/png;base64,AA==",
            meta: {
              started_at: 1,
              finished_at: 2,
              duration_ms: 1,
              memory_pressure: false,
              catalogHash: CAT_CATALOG_HASH,
              manifestHash: "a".repeat(64),
              renderPlanVersion: 1,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await renderCatV3({ params: {} });

    expect(response.catalogHash).toBe(CAT_CATALOG_HASH);
    expect(response.planVersion).toBe(1);
    expect(response.meta.catalog_hash).toBe(CAT_CATALOG_HASH);
    expect(response.meta.manifest_hash).toBe("a".repeat(64));
  });

  it("rejects a renderer image built from another catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            image: "data:image/png;base64,AA==",
            meta: {
              started_at: 1,
              finished_at: 2,
              duration_ms: 1,
              memory_pressure: false,
              catalogHash: "f".repeat(64),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(renderCatV3({ params: {} })).rejects.toThrow(
      "Renderer catalog mismatch",
    );
  });

  it("accepts a legacy renderer image without a catalog hash during rollout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            image: "data:image/png;base64,AA==",
            meta: {
              started_at: 1,
              finished_at: 2,
              duration_ms: 1,
              memory_pressure: false,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(renderCatV3({ params: {} })).resolves.toMatchObject({
      imageDataUrl: "data:image/png;base64,AA==",
    });
  });

  it("applies the same catalog guard to batch renders", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sheet: "data:image/png;base64,AA==",
            width: 50,
            height: 50,
            tileSize: 50,
            catalogHash: CAT_CATALOG_HASH,
            manifestHash: "a".repeat(64),
            renderPlanVersion: 1,
            frames: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await renderCatBatchV3({
      payload: { params: {} },
      variants: [],
    });

    expect(response.catalogHash).toBe(CAT_CATALOG_HASH);
    expect(response.renderPlanVersion).toBe(1);
  });

  it("accepts a legacy batch render without a catalog hash during rollout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sheet: "data:image/png;base64,AA==",
            width: 50,
            height: 50,
            tileSize: 50,
            frames: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      renderCatBatchV3({
        payload: { params: {} },
        variants: [],
      }),
    ).resolves.toMatchObject({
      sheetDataUrl: "data:image/png;base64,AA==",
    });
  });

  it("rejects a batch render from another catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sheet: "data:image/png;base64,AA==",
            width: 50,
            height: 50,
            tileSize: 50,
            catalogHash: "f".repeat(64),
            frames: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      renderCatBatchV3({
        payload: { params: {} },
        variants: [],
      }),
    ).rejects.toThrow("Renderer catalog mismatch");
  });
});
