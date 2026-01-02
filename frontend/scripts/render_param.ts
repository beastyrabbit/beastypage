#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, Image } from '@napi-rs/canvas';

import catGenerator from '../lib/single-cat/catGeneratorV2.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(projectRoot, 'public');

const resolvePublicPath = (url: string): string => {
  if (/^https?:/i.test(url)) {
    return url;
  }
  if (url.startsWith('/')) {
    return path.join(publicDir, url.slice(1));
  }
  if (path.isAbsolute(url)) {
    return path.normalize(url);
  }
  return path.join(publicDir, url);
};

const redirectLog = (logger: (...args: unknown[]) => void) =>
  (...args: unknown[]) => {
    const message = args
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');
    process.stderr.write(message + '\n');
  };

console.log = redirectLog(console.log);
console.warn = redirectLog(console.warn);
console.error = redirectLog(console.error);

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage;

globalThis.navigator = {
  userAgent: 'bun'
} as Navigator;

class SpriteImage extends Image {
  setSrc(value: string | Buffer | Uint8Array): void {
    if (typeof value === 'string') {
      this.src = resolvePublicPath(value);
    } else {
      this.src = value instanceof Buffer ? new Uint8Array(value) : value;
    }
  }
}

// Override the Image constructor to intercept src assignments
const OriginalImage = Image;
const SpriteImageProxy = new Proxy(SpriteImage, {
  construct(target, args) {
    const instance = Reflect.construct(target, args) as SpriteImage;
    return new Proxy(instance, {
      set(obj, prop, value) {
        if (prop === 'src') {
          if (typeof value === 'string') {
            obj.src = resolvePublicPath(value);
          } else {
            obj.src = value instanceof Buffer ? new Uint8Array(value) : value;
          }
          return true;
        }
        return Reflect.set(obj, prop, value);
      }
    });
  }
});

(globalThis as { Image: unknown }).Image = SpriteImageProxy;

class NodeOffscreenCanvas {
  private canvas = createCanvas(1, 1);

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  get width(): number {
    return this.canvas.width;
  }

  set width(value: number) {
    this.canvas.width = value;
  }

  get height(): number {
    return this.canvas.height;
  }

  set height(value: number) {
    this.canvas.height = value;
  }

  getContext(type: string): CanvasRenderingContext2D | null {
    if (type === '2d') {
      return this.canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    }
    return null;
  }

  transferToImageBitmap() {
    return this.canvas as unknown as ImageBitmap;
  }

  toBuffer(mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif' | 'image/gif' = 'image/png') {
    if (mimeType === 'image/png') {
      return this.canvas.toBuffer('image/png');
    }
    if (mimeType === 'image/avif') {
      return this.canvas.toBuffer('image/avif');
    }
    if (mimeType === 'image/gif') {
      return this.canvas.toBuffer('image/gif');
    }
    return this.canvas.toBuffer(mimeType as 'image/jpeg' | 'image/webp');
  }

  toDataURL(mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/avif' = 'image/png') {
    if (mimeType === 'image/png') {
      return this.canvas.toDataURL('image/png');
    }
    if (mimeType === 'image/avif') {
      return this.canvas.toDataURL('image/avif');
    }
    if (mimeType === 'image/gif') {
      return this.canvas.toDataURL('image/gif');
    }
    return this.canvas.toDataURL(mimeType as 'image/jpeg' | 'image/webp');
  }
}

globalThis.OffscreenCanvas = NodeOffscreenCanvas as unknown as typeof OffscreenCanvas;

const createNodeCanvas = (width = 50, height = 50) => createCanvas(width, height);

globalThis.document = {
  createElement(tag: string) {
    if (tag === 'canvas') {
      return createNodeCanvas(50, 50);
    }
    if (tag === 'img') {
      return new SpriteImage();
    }
    throw new Error(`Unsupported element requested: ${tag}`);
  },
} as unknown as Document;

const originalFetch = globalThis.fetch;

const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('/sprite-data/')) {
    const filePath = resolvePublicPath(url);
    const data = await readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.startsWith('file://')) {
    const filePath = new URL(url);
    const data = await readFile(filePath);
    return new Response(data, { status: 200 });
  }
  return originalFetch(input, init);
};

(globalThis as { fetch: unknown }).fetch = customFetch;

await catGenerator.initialize();

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: bun render_param.ts <params.json>');
  process.exit(1);
}

const params = JSON.parse(readFileSync(inputPath, 'utf-8'));
const result = await catGenerator.render(params, { outputFormat: 'canvas' });
const canvas: any = result.canvas;
const buffer: Buffer = canvas.toBuffer('image/png');
process.stdout.write(buffer.toString('base64'));
