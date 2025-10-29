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
} as Storage;

globalThis.navigator = {
  userAgent: 'bun'
} as Navigator;

class SpriteImage extends Image {
  override set src(value: string | Buffer) {
    if (typeof value === 'string') {
      super.src = resolvePublicPath(value);
    } else {
      super.src = value;
    }
  }
}

globalThis.Image = SpriteImage as unknown as typeof Image;

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
    return this.canvas.getContext(type) as CanvasRenderingContext2D | null;
  }

  transferToImageBitmap() {
    return this.canvas as unknown as ImageBitmap;
  }

  toBuffer(mimeType?: string) {
    return this.canvas.toBuffer(mimeType);
  }

  toDataURL(mimeType?: string) {
    return this.canvas.toDataURL(mimeType);
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

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
