import { NextRequest } from 'next/server';
import { proxyRendererJson } from './_lib/proxy';

function validateRenderPayload(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }

  const record = body as Record<string, unknown>;
  if (record.payload == null || typeof record.payload !== 'object') {
    return 'Missing "payload" object for renderer request';
  }

  return null;
}

export async function POST(request: NextRequest) {
  return proxyRendererJson(request, {
    path: '/render',
    validate: validateRenderPayload,
  });
}
