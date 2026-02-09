import { NextResponse, type NextRequest } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { getServerConvexUrl } from '@/lib/convexUrl';

function getConvex(): ConvexHttpClient | null {
  const url = getServerConvexUrl();
  if (!url) return null;
  return new ConvexHttpClient(url);
}

export async function GET(request: NextRequest) {
  const discordUserId = request.nextUrl.searchParams.get('discordUserId');
  if (!discordUserId) {
    return NextResponse.json({ error: 'Missing discordUserId' }, { status: 400 });
  }

  const convex = getConvex();
  if (!convex) {
    return NextResponse.json({ error: 'Convex not configured' }, { status: 503 });
  }

  try {
    const config = await convex.query(api.discordUserConfig.get, { discordUserId });
    return NextResponse.json(config);
  } catch (error) {
    console.error('[discord/user-config] GET failed', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const discordUserId = body.discordUserId;
  if (typeof discordUserId !== 'string') {
    return NextResponse.json({ error: 'Missing discordUserId' }, { status: 400 });
  }

  const convex = getConvex();
  if (!convex) {
    return NextResponse.json({ error: 'Convex not configured' }, { status: 503 });
  }

  try {
    // Reset
    if (body.reset === true) {
      await convex.mutation(api.discordUserConfig.reset, { discordUserId });
      return NextResponse.json({ ok: true, action: 'reset' });
    }

    // Add palette
    if (typeof body.addPalette === 'string') {
      await convex.mutation(api.discordUserConfig.addPalette, {
        discordUserId,
        paletteId: body.addPalette,
      });
      return NextResponse.json({ ok: true, action: 'addPalette' });
    }

    // Remove palette
    if (typeof body.removePalette === 'string') {
      await convex.mutation(api.discordUserConfig.removePalette, {
        discordUserId,
        paletteId: body.removePalette,
      });
      return NextResponse.json({ ok: true, action: 'removePalette' });
    }

    // Field updates
    const fields: Record<string, unknown> = { discordUserId };
    const numericKeys = [
      'accessoriesMin', 'accessoriesMax',
      'scarsMin', 'scarsMax',
      'tortiesMin', 'tortiesMax',
    ] as const;
    for (const key of numericKeys) {
      if (typeof body[key] === 'number') fields[key] = body[key];
    }
    const booleanKeys = ['darkForest', 'starclan'] as const;
    for (const key of booleanKeys) {
      if (typeof body[key] === 'boolean') fields[key] = body[key];
    }

    await convex.mutation(api.discordUserConfig.upsert, fields as Parameters<typeof convex.mutation<typeof api.discordUserConfig.upsert>>[1]);
    return NextResponse.json({ ok: true, action: 'upsert' });
  } catch (error) {
    console.error('[discord/user-config] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
