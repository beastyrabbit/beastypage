import { NextRequest } from 'next/server';
import { proxyRendererJson } from '../_lib/proxy';

function validateBatchPayload(body: unknown): string | null {
  if (body == null) {
    return 'Batch request body must not be empty';
  }

  if (Array.isArray(body)) {
    return body.length === 0 ? 'Batch request array must contain at least one item' : null;
  }

  if (typeof body !== 'object') {
    return 'Batch request must be a JSON object or array';
  }

  return null;
}

export async function POST(request: NextRequest) {
  return proxyRendererJson(request, {
    path: '/render/batch',
    validate: validateBatchPayload,
    timeoutMs: 60_000,
  });
}
