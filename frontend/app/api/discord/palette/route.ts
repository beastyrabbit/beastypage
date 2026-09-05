import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  if (!isDiscordServiceRequest(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
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
    imageBuffer = await downloadPublicImage(imageUrl);
  } catch (error) {
    console.error("[discord/palette] Failed to fetch image", error);
    return NextResponse.json(
      { error: "Failed to fetch image from URL" },
      { status: 400 },
    );
  }

  // Extract colors
  let colors: Awaited<ReturnType<typeof extractColorsServer>>;
  try {
    colors = await extractColorsServer(imageBuffer, { k: colorCount });
  } catch (error) {
    console.error("[discord/palette] Color extraction failed", error);
    return NextResponse.json(
      { error: "Failed to extract colors from image" },
      { status: 500 },
    );
  }

  // Extract family/accent colors
  let familyColors: ExtractedColor[] = [];
  try {
    familyColors = await extractFamilyColorsServer(imageBuffer, colors, {
      k: colorCount,
    });
  } catch (error) {
    console.warn(
      "[discord/palette] Family extraction failed, using top colors only",
      error,
    );
  }

  // Generate full palette grid image (with brightness/hue variations)
  let paletteImage: string;
  try {
    paletteImage = generatePaletteGridImage(
      colors,
      familyColors.length > 0 ? familyColors : undefined,
    );
  } catch (error) {
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
    const convexUrl = getServerConvexUrl();
    if (convexUrl) {
      const convex = new ConvexHttpClient(convexUrl);

      // Convert the fetched image buffer to a data URL for Convex storage
      const contentType = "image/png";
      const base64 = imageBuffer.toString("base64");
      const dataUrl = `data:${contentType};base64,${base64}`;

      const result = await convex.action(
        api.paletteGeneratorSettingsActions.storeDiscordImage,
        { dataUrl, colors: colorsPayload },
      );
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
