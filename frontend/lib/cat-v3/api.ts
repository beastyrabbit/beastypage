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

  const response = await fetch(buildRendererUrl(baseUrl, '/render'), requestInit);

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

  const response = await fetch(buildRendererUrl(baseUrl, '/render/batch'), requestInit);

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
