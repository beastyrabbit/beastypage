#!/usr/bin/env bun

import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createCanvas, Image } from '@napi-rs/canvas';

import catGenerator from '../lib/single-cat/catGeneratorV2.js';
import spriteSheetLoader from '../lib/single-cat/spriteSheetLoader.js';
import spriteMapper from '../lib/single-cat/spriteMapper.js';

const redirectLog = (logger: (...args: any[]) => void) =>
  (...args: any[]) => {
    const message = args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
    process.stderr.write(message + '\n');
  };

console.log = redirectLog(console.log);
console.warn = redirectLog(console.warn);
console.error = redirectLog(console.error);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.join(projectRoot, 'frontend', 'public');

const resolvePublicPath = (url: string): string => {
  if (/^https?:/i.test(url)) {
    return url;
  }
  if (url.startsWith('/')) {
    const normalisedRoot = url.slice(1);
    return path.join(publicDir, normalisedRoot);
  }
  if (path.isAbsolute(url)) {
    return path.normalize(url);
  }
  const normalised = url;
  return path.join(publicDir, normalised);
};

// ---------------------------------------------------------------------------
// Minimal DOM & browser polyfills
// ---------------------------------------------------------------------------

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage;

globalThis.navigator = {
  userAgent: 'bun',
} as Navigator;

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
    return this.canvas.getContext(type as '2d') as unknown as CanvasRenderingContext2D | null;
  }

  toBuffer(mimeType?: string) {
    return this.canvas.toBuffer(mimeType as 'image/png');
  }

  toDataURL(mimeType?: string) {
    return this.canvas.toDataURL(mimeType as 'image/png');
  }
}

const createNodeCanvas = (width = 50, height = 50) => {
  const canvas = createCanvas(width, height);
  return canvas;
};

// SpriteImage wraps the napi-rs Image class to intercept src assignments
// We use a factory function pattern to avoid TypeScript's accessor/property conflict
function createSpriteImage(): Image {
  const img = new Image();

  // Store original src property descriptor
  const originalDescriptor = Object.getOwnPropertyDescriptor(img, 'src') ||
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(img), 'src');

  let customSrc: string | Buffer = '';

  Object.defineProperty(img, 'src', {
    get() {
      return customSrc;
    },
    set(value: string | Buffer) {
      if (typeof value === 'string') {
        const resolved = resolvePublicPath(value);
        const finalSrc = resolved.startsWith('http')
          ? resolved
          : resolved;
        process.stderr.write(`[sprite] load ${finalSrc}\n`);
        customSrc = finalSrc;
        // Set on the underlying Image using the original setter or direct assignment
        if (originalDescriptor?.set) {
          originalDescriptor.set.call(img, finalSrc);
        } else {
          // napi-rs Image should always have a setter - warn if missing
          console.warn('Image descriptor setter not found, image may not load correctly');
        }
      } else {
        customSrc = value;
        if (originalDescriptor?.set) {
          originalDescriptor.set.call(img, value);
        }
      }
    },
    enumerable: true,
    configurable: true,
  });

  return img;
}

// Create a class that TypeScript will accept as an Image constructor
const SpriteImage = function(this: Image) {
  return createSpriteImage();
} as unknown as typeof Image;
SpriteImage.prototype = Image.prototype;

globalThis.OffscreenCanvas = NodeOffscreenCanvas as unknown as typeof OffscreenCanvas;
(globalThis as unknown as { Image: typeof Image }).Image = SpriteImage;
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

// Bun already provides fetch/Response/Blob/atob/btoa. Override fetch for local assets.
const originalFetch = globalThis.fetch;
const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('/sprite-data/')) {
    const filePath = resolvePublicPath(url);
    process.stderr.write(`[fetch] ${url} -> ${filePath}\n`);
    const data = await readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.startsWith('file://')) {
    const filePath = fileURLToPath(url);
    const data = await readFile(filePath);
    return new Response(data, { status: 200 });
  }
  return originalFetch(input, init);
};
globalThis.fetch = customFetch as typeof fetch;

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

async function initOnce() {
  await catGenerator.initialize();
}

async function renderRandomCat() {
  const params = await (catGenerator.generateRandomParams as (opts: { ignoreForbiddenSprites?: boolean }) => Promise<unknown>)({
    ignoreForbiddenSprites: true,
  });
  const result = await catGenerator.render(params, { outputFormat: 'canvas' });
  const canvas: any = result.canvas;
  const buffer: Buffer = canvas.toBuffer('image/png');
  return {
    params,
    imageBase64: buffer.toString('base64'),
  };
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

await initOnce();
process.stdout.write(JSON.stringify({ ok: true, ready: true }) + '\n');

rl.on('line', async (line) => {
  const command = line.trim();
  if (!command) {
    return;
  }

  if (command === 'random') {
    try {
      const payload = await renderRandomCat();
      process.stdout.write(
        JSON.stringify({ ok: true, type: 'random', ...payload }) + '\n',
      );
    } catch (error) {
      const err = error as Error;
      process.stdout.write(
        JSON.stringify({
          ok: false,
          error: err.message,
          stack: err.stack,
        }) + '\n',
      );
    }
    return;
  }

  process.stdout.write(
    JSON.stringify({ ok: false, error: `Unknown command: ${command}` }) + '\n',
  );
});

rl.on('close', () => {
  process.exit(0);
});
