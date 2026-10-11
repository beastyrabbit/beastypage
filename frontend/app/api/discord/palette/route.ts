import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { api } from "@/convex/_generated/api";
import { isDiscordServiceRequest } from "@/convex/discordAuth";
import {
  extractColorsServer,
  extractFamilyColorsServer,
  generatePaletteGridImage,
} from "@/lib/color-extraction/server-extraction";
import type { ExtractedColor } from "@/lib/color-extraction/types";
import { getServerConvexUrl } from "@/lib/convexUrl";
import { downloadPublicImage } from "@/lib/public-image-download";

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://beastyrabbit.com";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  if (!isDiscordServiceRequest(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const rawBody = await readRequestBody(request, MAX_BODY_BYTES);
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Request body is too large" },
        { status: 413 },
      );
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const imageUrl = body.imageUrl;
  if (typeof imageUrl !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid imageUrl" },
      { status: 400 },
    );
  }

  const rawColors = typeof body.colors === "number" ? body.colors : 6;
  const colorCount = Math.min(Math.max(Math.round(rawColors), 2), 12);

  // Fetch the image
  let imageBuffer: Buffer;
  try {
    imageBuffer = await downloadPublicImage(imageUrl, request.signal);
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Image download timed out" },
        { status: 504 },
      );
    }
    console.error("[discord/palette] Failed to fetch image", error);
    return NextResponse.json(
      { error: "Failed to fetch image from URL" },
      { status: 400 },
    );
  }

  if (request.signal.aborted) {
    return NextResponse.json({ error: "Request aborted" }, { status: 499 });
  }

  // Extract colors
  let colors: Awaited<ReturnType<typeof extractColorsServer>>;
  try {
    colors = await extractColorsServer(imageBuffer, { k: colorCount });
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    console.error("[discord/palette] Color extraction failed", error);
    return NextResponse.json(
      { error: "Failed to extract colors from image" },
      { status: 500 },
    );
  }

  if (request.signal.aborted) {
    return NextResponse.json({ error: "Request aborted" }, { status: 499 });
  }

  // Extract family/accent colors
  let familyColors: ExtractedColor[] = [];
  try {
    familyColors = await extractFamilyColorsServer(imageBuffer, colors, {
      k: colorCount,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    console.warn(
      "[discord/palette] Family extraction failed, using top colors only",
      error,
    );
  }

  if (request.signal.aborted) {
    return NextResponse.json({ error: "Request aborted" }, { status: 499 });
  }

  // Generate full palette grid image (with brightness/hue variations)
  let paletteImage: string;
  try {
    paletteImage = generatePaletteGridImage(
      colors,
      familyColors.length > 0 ? familyColors : undefined,
    );
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    console.error("[discord/palette] Palette image generation failed", error);
    return NextResponse.json(
      { error: "Failed to generate palette image" },
      { status: 500 },
    );
  }

  // Store source image in Convex and save config with slug
  const colorsPayload = colors.map((c) => ({
    hex: c.hex,
    rgb: c.rgb,
    prevalence: c.prevalence,
  }));

  let slug: string | undefined;
  let customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?imageUrl=${encodeURIComponent(imageUrl)}`;

  try {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    const convexUrl = getServerConvexUrl();
    if (convexUrl) {
      const convex = new ConvexHttpClient(convexUrl);

      // Convert the fetched image buffer to a data URL for Convex storage
      const contentType = "image/png";
      const base64 = imageBuffer.toString("base64");
      const dataUrl = `data:${contentType};base64,${base64}`;

      const result = await convex.action(
        api.paletteGeneratorSettingsActions.storeDiscordImage,
        {
          dataUrl,
          colors: colorsPayload,
          serviceToken: process.env.DISCORD_API_TOKEN ?? "",
        },
      );
      if (request.signal.aborted) {
        return NextResponse.json({ error: "Request aborted" }, { status: 499 });
      }
      slug = result.slug;
      customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?paletteSlug=${slug}`;
    } else {
      console.warn(
        "[discord/palette] No Convex URL configured — skipping persistence",
      );
    }
  } catch (error) {
    // Non-fatal — we still return the palette even if storage fails
    console.error("[discord/palette] Failed to store in Convex", error);
  }

  const familyColorsPayload = familyColors.map((c) => ({
    hex: c.hex,
    rgb: c.rgb,
    prevalence: c.prevalence,
  }));

  return NextResponse.json({
    colors: colorsPayload,
    familyColors:
      familyColorsPayload.length > 0 ? familyColorsPayload : undefined,
    paletteImage,
    customizeUrl,
    slug,
  });
}
