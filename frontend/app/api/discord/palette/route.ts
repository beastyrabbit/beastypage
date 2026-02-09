import { NextResponse, type NextRequest } from 'next/server';
import { extractColorsServer, generatePaletteImage } from '@/lib/color-extraction/server-extraction';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://beastypage.com';

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

  // Generate palette swatch image
  let paletteImage: string;
  try {
    paletteImage = generatePaletteImage(colors);
  } catch (error) {
    console.error('[discord/palette] Palette image generation failed', error);
    return NextResponse.json(
      { error: 'Failed to generate palette image' },
      { status: 500 },
    );
  }

  const customizeUrl = `${PUBLIC_BASE_URL}/color-palette-creator?imageUrl=${encodeURIComponent(imageUrl)}`;

  return NextResponse.json({
    colors: colors.map((c) => ({
      hex: c.hex,
      rgb: c.rgb,
      prevalence: c.prevalence,
    })),
    paletteImage,
    customizeUrl,
  });
}
