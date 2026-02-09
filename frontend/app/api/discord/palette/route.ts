import { NextResponse, type NextRequest } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getServerConvexUrl } from '@/lib/convexUrl';
import { extractColorsServer, extractFamilyColorsServer, generatePaletteGridImage } from '@/lib/color-extraction/server-extraction';
import type { ExtractedColor } from '@/lib/color-extraction/types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://beastyrabbit.com';

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]']);

function isPrivateIp(hostname: string): boolean {
  // Strip IPv6 brackets so checks work for both [::1] and ::1
  const h = hostname.replace(/^\[|\]$/g, '');
  // IPv4 private ranges
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === '0.0.0.0') return true;
  // IPv6 loopback / link-local / unique-local
  if (h === '::1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('fe80')) return true;
  return false;
}

function isValidUrl(s: string): boolean {
  try {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (BLOCKED_HOSTNAMES.has(url.hostname)) return false;
    if (isPrivateIp(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const imageUrl = body.imageUrl;
  if (typeof imageUrl !== 'string' || !isValidUrl(imageUrl)) {
    return NextResponse.json(
      { error: 'Missing or invalid imageUrl' },
      { status: 400 },
    );
  }

  const rawColors = typeof body.colors === 'number' ? body.colors : 6;
  const colorCount = Math.min(Math.max(Math.round(rawColors), 2), 12);

  // Fetch the image
  let imageBuffer: Buffer;
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: HTTP ${res.status}` },
        { status: 400 },
      );
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: `URL returned content-type "${contentType}" which is not an image` },
        { status: 400 },
      );
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Image is too large (max 10MB)' },
        { status: 400 },
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Image is too large (max 10MB)' },
        { status: 400 },
      );
    }

    imageBuffer = Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[discord/palette] Failed to fetch image', error);
    return NextResponse.json(
      { error: 'Failed to fetch image from URL' },
      { status: 400 },
    );
  }

  // Extract colors
  let colors;
  try {
    colors = await extractColorsServer(imageBuffer, { k: colorCount });
  } catch (error) {
    console.error('[discord/palette] Color extraction failed', error);
    return NextResponse.json(
      { error: 'Failed to extract colors from image' },
      { status: 500 },
    );
  }

  // Extract family/accent colors
  let familyColors: ExtractedColor[] = [];
  try {
    familyColors = await extractFamilyColorsServer(imageBuffer, colors, { k: colorCount });
  } catch (error) {
    console.warn('[discord/palette] Family extraction failed, using top colors only', error);
  }

  // Generate full palette grid image (with brightness/hue variations)
  let paletteImage: string;
  try {
    paletteImage = generatePaletteGridImage(colors, familyColors.length > 0 ? familyColors : undefined);
  } catch (error) {
    console.error('[discord/palette] Palette image generation failed', error);
    return NextResponse.json(
      { error: 'Failed to generate palette image' },
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
      const contentType = 'image/png';
      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;

      const result = await convex.action(
        api.paletteGeneratorSettingsActions.storeDiscordImage,
        { dataUrl, colors: colorsPayload },
      );
      slug = result.slug;
      customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?paletteSlug=${slug}`;
    } else {
      console.warn('[discord/palette] No Convex URL configured — skipping persistence');
    }
  } catch (error) {
    // Non-fatal — we still return the palette even if storage fails
    console.error('[discord/palette] Failed to store in Convex', error);
  }

  const familyColorsPayload = familyColors.map((c) => ({
    hex: c.hex,
    rgb: c.rgb,
    prevalence: c.prevalence,
  }));

  return NextResponse.json({
    colors: colorsPayload,
    familyColors: familyColorsPayload.length > 0 ? familyColorsPayload : undefined,
    paletteImage,
    customizeUrl,
    slug,
  });
}
