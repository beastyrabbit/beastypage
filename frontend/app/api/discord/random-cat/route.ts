import { NextResponse, type NextRequest } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { api } from '@/convex/_generated/api';
import { getServerConvexUrl } from '@/lib/convexUrl';
import { RENDERER_BASE } from '@/app/api/renderer/_lib/proxy';
import {
  generateRandomParamsServer,
  type DiscordCatOverrides,
} from '@/lib/cat-v3/random-cat-server';

const DISCORD_IMAGE_SIZE = 500;

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://beastyrabbit.com';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  const contentLength = request.headers.get('content-length');
  const hasBody = contentLength !== null && contentLength !== '0';
  if (hasBody) {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  // Build overrides from per-invocation options
  const overrides: DiscordCatOverrides = {};
  if (typeof body.sprite === 'number') overrides.sprite = body.sprite;
  if (typeof body.pelt === 'string') overrides.pelt = body.pelt;
  if (typeof body.colour === 'string') overrides.colour = body.colour;
  if (typeof body.eye_colour === 'string') overrides.eyeColour = body.eye_colour;
  if (typeof body.shading === 'boolean') overrides.shading = body.shading;

  // Fetch user config from Convex if discord_user_id is provided
  const discordUserId = typeof body.discord_user_id === 'string' ? body.discord_user_id : undefined;
  if (discordUserId) {
    try {
      const convexUrl = getServerConvexUrl();
      if (convexUrl) {
        const convex = new ConvexHttpClient(convexUrl);
        const cfg = await convex.query(api.discordUserConfig.get, { discordUserId });
        // User config provides defaults; per-invocation overrides take priority
        overrides.accessoriesMin = cfg.accessoriesMin;
        overrides.accessoriesMax = cfg.accessoriesMax;
        overrides.scarsMin = cfg.scarsMin;
        overrides.scarsMax = cfg.scarsMax;
        overrides.tortiesMin = cfg.tortiesMin;
        overrides.tortiesMax = cfg.tortiesMax;
        overrides.darkForest = cfg.darkForest;
        overrides.starclan = cfg.starclan;
        if (cfg.palettes.length > 0) overrides.palettes = cfg.palettes;
      }
    } catch (error) {
      // Non-fatal — proceed with defaults if config fetch fails
      console.error('[discord/random-cat] Failed to fetch user config', error);
    }
  }

  // Generate random params
  let params;
  try {
    params = await generateRandomParamsServer(overrides);
  } catch (error) {
    console.error('[discord/random-cat] Failed to generate params', error);
    return NextResponse.json(
      { error: 'Failed to generate cat parameters' },
      { status: 500 },
    );
  }

  // Render via the renderer service
  const renderPayload = {
    payload: {
      spriteNumber: params.spriteNumber,
      params: { ...params, source: 'discordkitten' },
    },
  };

  let imageDataUrl: string;
  try {
    const rendererRes = await fetch(`${RENDERER_BASE}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(renderPayload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!rendererRes.ok) {
      const text = await rendererRes.text();
      console.error('[discord/random-cat] Renderer error', rendererRes.status, text);
      return NextResponse.json(
        { error: 'Renderer service error' },
        { status: 502 },
      );
    }

    const renderResult = (await rendererRes.json()) as { image?: string };
    if (!renderResult.image) {
      return NextResponse.json(
        { error: 'Renderer returned no image' },
        { status: 502 },
      );
    }
    // Upscale the small pixel-art sprite to a Discord-friendly size
    const rawDataUrl = renderResult.image;
    const img = await loadImage(Buffer.from(rawDataUrl.split(',')[1], 'base64'));
    const canvas = createCanvas(DISCORD_IMAGE_SIZE, DISCORD_IMAGE_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // nearest-neighbor for pixel art
    ctx.drawImage(img, 0, 0, DISCORD_IMAGE_SIZE, DISCORD_IMAGE_SIZE);
    imageDataUrl = canvas.toDataURL('image/png');
  } catch (error) {
    console.error('[discord/random-cat] Renderer request failed', error);
    return NextResponse.json(
      { error: 'Renderer service unavailable' },
      { status: 502 },
    );
  }

  // Save to Convex
  let slug: string | undefined;
  try {
    const convexUrl = getServerConvexUrl();
    if (!convexUrl) {
      console.warn('[discord/random-cat] No Convex URL configured — skipping persistence');
    } else {
      const convex = new ConvexHttpClient(convexUrl);
      const catData = { ...params, source: 'discordkitten' };
      const result = await convex.mutation(api.mapper.create, {
        catData,
        creatorName: 'Discord Bot',
      });
      slug = result.slug;
    }
  } catch (error) {
    // Non-fatal — we still return the image even if saving fails
    console.error('[discord/random-cat] Failed to save to Convex', error);
  }

  const viewUrl = slug ? `${PUBLIC_BASE_URL}/view/${slug}` : undefined;

  return NextResponse.json({
    image: imageDataUrl,
    params: { ...params, source: 'discordkitten' },
    slug,
    viewUrl,
  });
}
