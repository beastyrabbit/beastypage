import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { RENDERER_BASE } from "@/app/api/renderer/_lib/proxy";
import { api } from "@/convex/_generated/api";
import { isDiscordServiceRequest } from "@/convex/discordAuth";
import { catDataToLegacyPersistence } from "@/lib/cat-system";
import { CAT_CATALOG_HASH } from "@/lib/cat-system/generated/cat-schema.generated";
import {
  type DiscordCatOverrides,
  generateRandomParamsServerDetailed,
  parseDiscordTraitOverride,
} from "@/lib/cat-v3/random-cat-server";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { discordConfig } from "@/lib/discord-service";

const DISCORD_IMAGE_SIZE = 500;

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://beastyrabbit.com";
const MAX_BODY_BYTES = 32 * 1024;

type BodyResult =
  | { body: Record<string, unknown> }
  | { response: NextResponse };

type OverrideResult =
  | { overrides: DiscordCatOverrides }
  | { response: NextResponse };

type RenderResult = { image: string } | { response: NextResponse };

async function parseRequestBody(request: NextRequest): Promise<BodyResult> {
  let body: Record<string, unknown> = {};
  try {
    const rawBody = await readRequestBody(request, MAX_BODY_BYTES);
    if (rawBody.trim()) {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { response: invalidBodyResponse() };
      }
      body = parsed as Record<string, unknown>;
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return {
        response: NextResponse.json(
          { error: "Request body is too large" },
          { status: 413 },
        ),
      };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return { response: abortedResponse() };
    }
    return { response: invalidBodyResponse() };
  }
  return { body };
}

function invalidBodyResponse() {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}

function abortedResponse() {
  return NextResponse.json({ error: "Request aborted" }, { status: 499 });
}

function buildOverrides(body: Record<string, unknown>): OverrideResult {
  const overrides: DiscordCatOverrides = {};

  if (typeof body.sprite === "number") overrides.sprite = body.sprite;
  if (typeof body.pelt === "string") overrides.pelt = body.pelt;
  if (typeof body.colour === "string") overrides.colour = body.colour;
  if (typeof body.eye_colour === "string")
    overrides.eyeColour = body.eye_colour;
  if (typeof body.shading === "boolean") overrides.shading = body.shading;
  const rawTrait = typeof body.trait === "string" ? body.trait : undefined;
  const rawValue = typeof body.value === "string" ? body.value : undefined;
  if (
    (rawTrait && rawValue === undefined) ||
    (!rawTrait && rawValue !== undefined)
  ) {
    return {
      response: NextResponse.json(
        { error: "Use trait and value together" },
        { status: 400 },
      ),
    };
  }
  if (rawTrait && rawValue !== undefined) {
    const parsed = parseDiscordTraitOverride(rawTrait, rawValue);
    if (!parsed) {
      return {
        response: NextResponse.json(
          { error: "Invalid registry trait override" },
          { status: 400 },
        ),
      };
    }
    overrides.traitOverrides = { [parsed.traitId]: parsed.value };
  }
  return { overrides };
}

async function applyUserConfig(
  body: Record<string, unknown>,
  overrides: DiscordCatOverrides,
): Promise<void> {
  const discordUserId =
    typeof body.discord_user_id === "string" ? body.discord_user_id : undefined;
  if (!discordUserId) return;

  try {
    const cfg = await discordConfig("get", { discordUserId });
    overrides.accessoriesMin = cfg.accessoriesMin;
    overrides.accessoriesMax = cfg.accessoriesMax;
    overrides.scarsMin = cfg.scarsMin;
    overrides.scarsMax = cfg.scarsMax;
    overrides.tortiesMin = cfg.tortiesMin;
    overrides.tortiesMax = cfg.tortiesMax;
    overrides.darkForest = cfg.darkForest;
    overrides.starclan = cfg.starclan;
    if (cfg.palettes.length > 0) overrides.palettes = cfg.palettes;
  } catch (error) {
    console.error("[discord/random-cat] Failed to fetch user config", error);
  }
}

async function generateCatParams(overrides: DiscordCatOverrides) {
  try {
    return await generateRandomParamsServerDetailed(overrides);
  } catch (error) {
    console.error("[discord/random-cat] Failed to generate params", error);
    return {
      response: NextResponse.json(
        { error: "Failed to generate cat parameters" },
        { status: 500 },
      ),
    } as const;
  }
}

async function renderImage(
  document: Awaited<
    ReturnType<typeof generateRandomParamsServerDetailed>
  >["document"],
  params: Awaited<
    ReturnType<typeof generateRandomParamsServerDetailed>
  >["params"],
  signal: AbortSignal,
): Promise<RenderResult> {
  const renderPayload = {
    payload: {
      spriteNumber: params.spriteNumber,
      document,
      params: { ...params, source: "discordkitten" },
    },
  };

  let imageDataUrl: string;
  try {
    const rendererRes = await fetch(`${RENDERER_BASE}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(renderPayload),
      signal: AbortSignal.any([AbortSignal.timeout(30_000), signal]),
    });

    if (!rendererRes.ok) {
      const text = await rendererRes.text();
      console.error(
        "[discord/random-cat] Renderer error",
        rendererRes.status,
        text,
      );
      return {
        response: NextResponse.json(
          { error: "Renderer service error" },
          { status: 502 },
        ),
      };
    }

    const renderResult = (await rendererRes.json()) as {
      image?: string;
      meta?: { catalogHash?: string; catalog_hash?: string };
    };
    if (!renderResult.image) {
      return {
        response: NextResponse.json(
          { error: "Renderer returned no image" },
          { status: 502 },
        ),
      };
    }
    const rendererCatalogHash =
      renderResult.meta?.catalogHash ?? renderResult.meta?.catalog_hash;
    if (
      rendererCatalogHash !== undefined &&
      rendererCatalogHash !== CAT_CATALOG_HASH
    ) {
      console.error(
        "[discord/random-cat] Renderer catalog mismatch",
        CAT_CATALOG_HASH,
        rendererCatalogHash,
      );
      return {
        response: NextResponse.json(
          { error: "Renderer catalog mismatch" },
          { status: 502 },
        ),
      };
    }
    // Upscale the small pixel-art sprite to a Discord-friendly size
    const rawDataUrl = renderResult.image;
    const img = await loadImage(
      Buffer.from(rawDataUrl.split(",")[1], "base64"),
    );
    const canvas = createCanvas(DISCORD_IMAGE_SIZE, DISCORD_IMAGE_SIZE);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false; // nearest-neighbor for pixel art
    ctx.drawImage(img, 0, 0, DISCORD_IMAGE_SIZE, DISCORD_IMAGE_SIZE);
    imageDataUrl = canvas.toDataURL("image/png");
  } catch (error) {
    console.error("[discord/random-cat] Renderer request failed", error);
    if (signal.aborted) {
      return { response: abortedResponse() };
    }
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return {
        response: NextResponse.json(
          { error: "Renderer request timed out" },
          { status: 504 },
        ),
      };
    }
    return {
      response: NextResponse.json(
        { error: "Renderer service unavailable" },
        { status: 502 },
      ),
    };
  }
  return { image: imageDataUrl };
}

async function saveCat(
  body: Record<string, unknown>,
  params: Awaited<
    ReturnType<typeof generateRandomParamsServerDetailed>
  >["params"],
): Promise<string | undefined> {
  let slug: string | undefined;
  try {
    const convexUrl = getServerConvexUrl();
    if (!convexUrl) {
      console.warn(
        "[discord/random-cat] No Convex URL configured — skipping persistence",
      );
    } else {
      const convex = new ConvexHttpClient(convexUrl);
      const catData = {
        params: { ...params, source: "discordkitten" },
        accessorySlots: params.accessories ?? [],
        scarSlots: params.scars ?? [],
        tortieSlots: params.tortie ?? [],
        counts: {
          accessories: (params.accessories ?? []).length,
          scars: (params.scars ?? []).length,
          tortie: (params.tortie ?? []).length,
        },
      };
      const discordUsername =
        typeof body.discord_username === "string"
          ? body.discord_username
          : undefined;
      const result = await convex.mutation(api.mapper.create, {
        catData: catDataToLegacyPersistence(catData),
        creatorName: discordUsername || "Discord",
      });
      slug = result.slug;
    }
  } catch (error) {
    // Non-fatal — we still return the image even if saving fails
    console.error("[discord/random-cat] Failed to save to Convex", error);
  }
  return slug;
}

export async function POST(request: NextRequest) {
  if (!isDiscordServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await parseRequestBody(request);
  if ("response" in bodyResult) return bodyResult.response;

  const overrideResult = buildOverrides(bodyResult.body);
  if ("response" in overrideResult) return overrideResult.response;
  await applyUserConfig(bodyResult.body, overrideResult.overrides);

  const generated = await generateCatParams(overrideResult.overrides);
  if ("response" in generated) return generated.response;

  const { document, params } = generated;
  const renderResult = await renderImage(document, params, request.signal);
  if ("response" in renderResult) return renderResult.response;

  const slug = await saveCat(bodyResult.body, params);
  const viewUrl = slug ? `${PUBLIC_BASE_URL}/view/${slug}` : undefined;

  return NextResponse.json({
    image: renderResult.image,
    params: { ...params, source: "discordkitten" },
    slug,
    viewUrl,
  });
}
