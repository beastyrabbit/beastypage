import { NextResponse } from 'next/server';

import { RENDERER_BASE } from '../_lib/proxy';

function buildHealthUrl(): string {
  return `${RENDERER_BASE}/health`;
}

export async function GET() {
  try {
    const response = await fetch(buildHealthUrl(), {
      headers: {
        accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const payload = await safeRead(response);
      return NextResponse.json(
        {
          error: payload ?? 'Renderer health check failed',
          upstreamStatus: response.status,
        },
        { status: 503 }
      );
    }

    const data = await response.json();
    return NextResponse.json(
      {
        status: data.status ?? 'unknown',
        metrics: data.metrics ?? data,
      },
      {
        status: 200,
        headers: {
          'cache-control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[renderer-health] upstream error', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}

async function safeRead(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, 200) || null;
  } catch {
    return null;
  }
}
