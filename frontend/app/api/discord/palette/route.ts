import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { api } from "@/convex/_generated/api";
import { isDiscordServiceRequest } from "@/convex/discordAuth";
import {
  extractPaletteColorsServer,
  generatePaletteGridImage,
} from "@/lib/color-extraction/server-extraction";
import type { ExtractedColor } from "@/lib/color-extraction/types";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { downloadPublicImage } from "@/lib/public-image-download";
import { dataBackend } from "@/server/backend";
import { getDb } from "@/server/db/client";
import { storeDiscordImage as storePostgresDiscordImage } from "@/server/services/palette";

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://beastyrabbit.com";
const MAX_BODY_BYTES = 64 * 1024;

type BodyResult =
  | { body: Record<string, unknown> }
  | { response: NextResponse };

type Result<T> = { value: T } | { response: NextResponse };

function abortedResponse() {
  return NextResponse.json({ error: "Request aborted" }, { status: 499 });
}

async function parseRequestBody(request: NextRequest): Promise<BodyResult> {
  try {
    const rawBody = await readRequestBody(request, MAX_BODY_BYTES);
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        response: NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        ),
      };
    }
    return { body: parsed as Record<string, unknown> };
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
    return {
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
}

async function downloadImage(
  imageUrl: string,
  signal: AbortSignal,
): Promise<Result<Buffer>> {
  try {
    const imageBuffer = await downloadPublicImage(imageUrl, signal);
    return signal.aborted
      ? { response: abortedResponse() }
      : { value: imageBuffer };
  } catch (error) {
    if (signal.aborted) return { response: abortedResponse() };
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        response: NextResponse.json(
          { error: "Image download timed out" },
          { status: 504 },
        ),
      };
    }
    console.error("[discord/palette] Failed to fetch image", error);
    return {
      response: NextResponse.json(
        { error: "Failed to fetch image from URL" },
        { status: 400 },
      ),
    };
  }
}

type ExtractedPalette = {
  colors: Awaited<ReturnType<typeof extractPaletteColorsServer>>["colors"];
  familyColors: ExtractedColor[];
};

async function extractPalette(
  imageBuffer: Buffer,
  colorCount: number,
  signal: AbortSignal,
): Promise<Result<ExtractedPalette>> {
  let palette: Awaited<ReturnType<typeof extractPaletteColorsServer>>;
  try {
    palette = await extractPaletteColorsServer(imageBuffer, { k: colorCount });
  } catch (error) {
    if (signal.aborted) return { response: abortedResponse() };
    console.error("[discord/palette] Color extraction failed", error);
    return {
      response: NextResponse.json(
        { error: "Failed to extract colors from image" },
        { status: 500 },
      ),
    };
  }
  if (signal.aborted) return { response: abortedResponse() };
  return { value: palette };
}

function generatePalette(
  colors: ExtractedPalette["colors"],
  familyColors: ExtractedColor[],
  signal: AbortSignal,
): Result<string> {
  try {
    const paletteImage = generatePaletteGridImage(
      colors,
      familyColors.length > 0 ? familyColors : undefined,
    );
    return { value: paletteImage };
  } catch (error) {
    if (signal.aborted) return { response: abortedResponse() };
    console.error("[discord/palette] Palette image generation failed", error);
    return {
      response: NextResponse.json(
        { error: "Failed to generate palette image" },
        { status: 500 },
      ),
    };
  }
}

function serializeColors(colors: ExtractedColor[]) {
  return colors.map((color) => ({
    hex: color.hex,
    rgb: color.rgb,
    prevalence: color.prevalence,
  }));
}

async function persistPalette(
  imageBuffer: Buffer,
  colorsPayload: ReturnType<typeof serializeColors>,
  imageUrl: string,
  signal: AbortSignal,
): Promise<Result<{ slug: string | undefined; customizeUrl: string }>> {
  let slug: string | undefined;
  let customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?imageUrl=${encodeURIComponent(imageUrl)}`;

  try {
    if (signal.aborted) return { response: abortedResponse() };
    if (dataBackend() === "postgres") {
      const result = await storePostgresDiscordImage(getDb(), {
        dataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
        colors: colorsPayload,
        serviceToken: (process.env.DISCORD_API_TOKEN ?? "").trim(),
      });
      slug = result.slug;
      customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?paletteSlug=${slug}`;
      return { value: { slug, customizeUrl } };
    }
    const convexUrl = getServerConvexUrl();
    if (convexUrl) {
      const convex = new ConvexHttpClient(convexUrl);
      const base64 = imageBuffer.toString("base64");
      const result = await convex.action(
        api.paletteGeneratorSettingsActions.storeDiscordImage,
        {
          dataUrl: `data:image/png;base64,${base64}`,
          colors: colorsPayload,
          serviceToken: (process.env.DISCORD_API_TOKEN ?? "").trim(),
        },
      );
      if (signal.aborted) return { response: abortedResponse() };
      slug = result.slug;
      customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?paletteSlug=${slug}`;
    } else {
      console.warn(
        "[discord/palette] No Convex URL configured — skipping persistence",
      );
    }
  } catch (error) {
    console.error("[discord/palette] Failed to store in Convex", error);
  }
  return { value: { slug, customizeUrl } };
}

export async function POST(request: NextRequest) {
  if (!isDiscordServiceRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await parseRequestBody(request);
  if ("response" in bodyResult) return bodyResult.response;

  const imageUrl = bodyResult.body.imageUrl;
  if (typeof imageUrl !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid imageUrl" },
      { status: 400 },
    );
  }

  const rawColors =
    typeof bodyResult.body.colors === "number" ? bodyResult.body.colors : 6;
  const colorCount = Math.min(Math.max(Math.round(rawColors), 2), 12);
  const imageResult = await downloadImage(imageUrl, request.signal);
  if ("response" in imageResult) return imageResult.response;

  const paletteResult = await extractPalette(
    imageResult.value,
    colorCount,
    request.signal,
  );
  if ("response" in paletteResult) return paletteResult.response;

  const { colors, familyColors } = paletteResult.value;
  const paletteImageResult = generatePalette(
    colors,
    familyColors,
    request.signal,
  );
  if ("response" in paletteImageResult) return paletteImageResult.response;

  const colorsPayload = serializeColors(colors);
  const persistenceResult = await persistPalette(
    imageResult.value,
    colorsPayload,
    imageUrl,
    request.signal,
  );
  if ("response" in persistenceResult) return persistenceResult.response;

  const familyColorsPayload = serializeColors(familyColors);
  return NextResponse.json({
    colors: colorsPayload,
    familyColors:
      familyColorsPayload.length > 0 ? familyColorsPayload : undefined,
    paletteImage: paletteImageResult.value,
    customizeUrl: persistenceResult.value.customizeUrl,
    slug: persistenceResult.value.slug,
  });
}
