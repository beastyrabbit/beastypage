type RequestPriority = 'high' | 'low' | 'auto';

import {
  CatRenderParams,
  RendererResponse,
  BatchRenderRequest,
  BatchRenderResponse,
} from './types';

const PUBLIC_RENDERER_BASE = '/api/renderer';
const INTERNAL_RENDERER_BASE = 'http://renderer:8001';

function resolveRendererBase(baseUrl?: string): string {
  if (baseUrl) return stripTrailingSlash(baseUrl);
  if (typeof window !== 'undefined') {
    return stripTrailingSlash(PUBLIC_RENDERER_BASE);
  }
  return stripTrailingSlash(INTERNAL_RENDERER_BASE);
}

function stripTrailingSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

function buildRendererUrl(base: string, pathname: string): string {
  const normalized = stripTrailingSlash(base || '');
  if (/^https?:\/\//i.test(base)) {
    return `${normalized}${pathname}`;
  }
  if (pathname === '/render') {
    return normalized || '/api/renderer';
  }
  if (pathname.startsWith('/render/')) {
    return `${normalized}${pathname.slice('/render'.length)}` || normalized;
  }
  return `${normalized}${pathname}`;
}

interface RenderOptions {
  baseUrl?: string;
  priority?: RequestPriority;
}

interface RawLayerDiagnostic {
  id: string;
  label: string;
  duration_ms: number;
  diagnostics: string[];
  blend_mode?: string | null;
  image?: string | null;
}

interface RawRenderResponse {
  image: string;
  meta: RendererResponse['meta'];
  layers?: RawLayerDiagnostic[];
}

export async function renderCatV3(
  payload: CatRenderParams,
  options: RenderOptions = {}
): Promise<RendererResponse> {
  const baseUrl = resolveRendererBase(options.baseUrl);
  const collectLayers = Boolean(payload.collectLayers);
  const includeLayerImages = Boolean(payload.includeLayerImages);
  const requestInit: RequestInit & { priority?: RequestPriority } = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payload: {
        spriteNumber: payload.spriteNumber,
        params: payload.params,
      },
      options: {
        collectLayers,
        includeLayerImages,
      },
    }),
  };
  if (options.priority) {
    requestInit.priority = options.priority;
  }

  const response = await fetchWithRetry(buildRendererUrl(baseUrl, '/render'), requestInit, {
    attempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1200,
    context: 'render-single',
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(`Renderer request failed (${response.status}): ${message}`);
  }

  const data: RawRenderResponse = await response.json();
  return {
    imageDataUrl: data.image,
    meta: data.meta,
    layers: data.layers?.map((layer) => ({
      id: layer.id,
      label: layer.label,
      duration_ms: layer.duration_ms,
      diagnostics: layer.diagnostics,
      blendMode: layer.blend_mode ?? null,
      imageDataUrl: layer.image ?? null,
    })),
  };
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch (error) {
    return String(error);
  }
}

export async function decodeImageFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to acquire canvas context'));
        return;
      }
      ctx.drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = (event) => {
      reject(new Error(`Failed to load image: ${event}`));
    };
    image.src = dataUrl;
  });
}

export async function renderCatBatchV3(
  request: BatchRenderRequest,
  options: RenderOptions = {}
): Promise<BatchRenderResponse> {
  const baseUrl = resolveRendererBase(options.baseUrl);
  const requestInit: RequestInit & { priority?: RequestPriority } = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  };
  if (options.priority) {
    requestInit.priority = options.priority;
  }

  const response = await fetchWithRetry(buildRendererUrl(baseUrl, '/render/batch'), requestInit, {
    attempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1500,
    context: 'render-batch',
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(`Renderer batch request failed (${response.status}): ${message}`);
  }

  const data = await response.json();
  type RawFrame = {
    id: string;
    label?: string | null;
    group?: string | null;
    index: number;
    column: number;
    row: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  type RawSource = {
    id: string;
    image: string;
  };

  const framesData: RawFrame[] = Array.isArray(data.frames) ? data.frames : [];
  const sourcesData: RawSource[] | undefined = Array.isArray(data.sources) ? data.sources : undefined;

  return {
    sheetDataUrl: data.sheet,
    width: data.width,
    height: data.height,
    tileSize: data.tileSize,
    frames: framesData.map((frame) => ({
      id: frame.id,
      label: frame.label ?? null,
      group: frame.group ?? null,
      index: frame.index,
      column: frame.column,
      row: frame.row,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    })),
    sources: sourcesData?.map((source) => ({
      id: source.id,
      imageDataUrl: source.image,
    })),
  };
}

interface RetryConfig {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  context?: string;
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit & { priority?: RequestPriority },
  { attempts = 3, baseDelayMs = 100, maxDelayMs = 1000, context }: RetryConfig = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!shouldRetryResponse(response) || attempt === attempts - 1) {
        return response;
      }
      const delay = computeBackoffDelay(baseDelayMs, attempt, maxDelayMs);
      logRetry(context, attempt + 1, response.status, delay);
      await wait(delay);
      continue;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) {
        throw error;
      }
      const delay = computeBackoffDelay(baseDelayMs, attempt, maxDelayMs);
      logRetry(context, attempt + 1, null, delay, error);
      await wait(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Renderer request failed after retries');
}

function shouldRetryResponse(response: Response): boolean {
  if (response.status >= 500) return true;
  if (response.status === 429) return true;
  return false;
}

function computeBackoffDelay(base: number, attempt: number, maxDelay: number): number {
  const jitter = Math.random() * 0.3 + 0.85;
  const delay = Math.min(maxDelay, base * 2 ** attempt);
  return Math.round(delay * jitter);
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

function logRetry(
  context: string | undefined,
  attemptNumber: number,
  status: number | null,
  delayMs: number,
  error?: unknown
) {
  if (process.env.NODE_ENV === 'development') {
    const prefix = context ? `[renderer:${context}]` : '[renderer]';
    if (status !== null) {
      console.warn(`${prefix} retrying after status ${status} (attempt ${attemptNumber}) in ${delayMs}ms`);
    } else {
      console.warn(`${prefix} retrying after error (attempt ${attemptNumber}) in ${delayMs}ms`, error);
    }
  }
}
