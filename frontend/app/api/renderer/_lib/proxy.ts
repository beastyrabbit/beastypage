import { NextRequest, NextResponse } from 'next/server';

export const RENDERER_BASE = (process.env.RENDERER_INTERNAL_URL ?? 'http://127.0.0.1:8001').replace(/\/$/, '');

const DEFAULT_TIMEOUT_MS = 30_000;

type Validator = (body: unknown) => string | null;

interface ProxyOptions {
  timeoutMs?: number;
  validate?: Validator;
  path: string;
}

function buildTargetUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${RENDERER_BASE}${suffix}`;
}

function selectHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

  const requestId = request.headers.get('x-request-id');
  if (requestId) headers.set('x-request-id', requestId);

  const traceId = request.headers.get('x-trace-id');
  if (traceId) headers.set('x-trace-id', traceId);

  headers.set('accept', request.headers.get('accept') || 'application/json');

  const userAgent = request.headers.get('user-agent');
  headers.set('user-agent', userAgent || 'gatcha-web/renderer-proxy');
  return headers;
}

function classifyError(error: unknown): { status: number; message: string } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { status: 504, message: 'Renderer request timed out' };
  }
  return { status: 502, message: 'Renderer service unavailable' };
}

function ensureJson(contentType: string | null): string | null {
  if (!contentType) return 'Missing Content-Type header';
  if (!contentType.toLowerCase().includes('application/json')) {
    return 'Renderer API expects application/json payloads';
  }
  return null;
}

function streamWithFinalizer(body: ReadableStream<Uint8Array>, finalize: () => void) {
  const reader = body.getReader();
  let done = false;

  const runFinalize = () => {
    if (!done) {
      done = true;
      finalize();
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) {
          runFinalize();
          controller.close();
          return;
        }
        if (value !== undefined) {
          controller.enqueue(value);
        }
      } catch (error) {
        runFinalize();
        controller.error(error);
      }
    },
    cancel(reason) {
      runFinalize();
      return reader.cancel(reason);
    },
  });
}

export async function proxyRendererJson(
  request: NextRequest,
  { timeoutMs = DEFAULT_TIMEOUT_MS, validate, path }: ProxyOptions
): Promise<NextResponse> {
  const contentTypeError = ensureJson(request.headers.get('content-type'));
  if (contentTypeError) {
    return NextResponse.json({ error: contentTypeError }, { status: 415 });
  }

  const clone = request.clone();
  const rawBody = await clone.text();
  if (!rawBody) {
    return NextResponse.json({ error: 'Request body must not be empty' }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (error) {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 });
  }

  if (validate) {
    const validationError = validate(parsed);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const clear = () => clearTimeout(timeout);

  try {
    const upstream = await fetch(buildTargetUrl(path), {
      method: 'POST',
      headers: selectHeaders(request),
      body: rawBody,
      signal: controller.signal,
    });

    if (!upstream.body) {
      clear();
      const text = await upstream.text();
      return NextResponse.json(
        { error: text || 'Renderer returned no data' },
        { status: upstream.status || 500 }
      );
    }

    const headers = new Headers(upstream.headers);
    headers.set('cache-control', 'no-store');

    const proxiedBody = streamWithFinalizer(upstream.body, clear);

    return new NextResponse(proxiedBody, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    clear();
    console.error(`[renderer-proxy] upstream request failed for ${path}`, error);
    const { status, message } = classifyError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
