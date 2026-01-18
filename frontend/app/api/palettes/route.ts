import { NextResponse } from 'next/server';

const RENDERER_BASE = (process.env.RENDERER_INTERNAL_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');

export async function GET() {
  try {
    const response = await fetch(`${RENDERER_BASE}/palettes`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch palettes from renderer' },
        { status: response.status }
      );
    }

    const palettes = await response.json();
    return NextResponse.json(palettes);
  } catch (error) {
    console.error('Failed to fetch palettes:', error);
    return NextResponse.json(
      { error: 'Renderer service unavailable' },
      { status: 502 }
    );
  }
}
