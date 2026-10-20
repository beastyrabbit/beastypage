// Loads the Blender-rendered tile sheets and keeps tinted copies of them for
// each atmosphere. Until the sheets arrive, or for anything they lack, the
// renderer keeps using its procedural art.

import type { TileIndex } from "./tileset";

const BASE_URL = "/scene-planner/tiles";

export interface TileSet {
  index: TileIndex;
  images: Map<string, HTMLImageElement>;
  glows: Map<string, HTMLImageElement>;
}

let current: TileSet | null = null;
let loading: Promise<TileSet | null> | null = null;

/** The loaded tile set, or null while loading or when there is none. */
export function currentTileSet() {
  return current;
}

function image(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Starts loading once; later calls share the same promise. */
export function loadTileSet() {
  loading ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/tiles.json`);
      if (!response.ok) return null;
      const index = (await response.json()) as TileIndex;
      const images = new Map<string, HTMLImageElement>();
      const glows = new Map<string, HTMLImageElement>();
      const v = `?v=${index.version}`;
      await Promise.all(
        Object.entries(index.sheets).flatMap(([name, sheet]) => [
          image(`${BASE_URL}/${sheet.file}${v}`).then((img) =>
            images.set(name, img),
          ),
          ...(sheet.glow
            ? [
                image(`${BASE_URL}/${sheet.glow}${v}`).then((img) =>
                  glows.set(name, img),
                ),
              ]
            : []),
        ]),
      );
      current = { index, images, glows };
      return current;
    } catch (error) {
      console.warn("Scene Planner tiles unavailable", error);
      return null;
    }
  })();
  return loading;
}

export interface Grade {
  /** Multiplied into every pixel, 0–255 per channel. */
  light: [number, number, number];
  /** Colour mixed over the result for distance haze. */
  haze: [number, number, number];
  hazeAmount: number;
  /** Canvas filter for seasonal foliage, or "none". */
  filter: string;
}

const tinted = new Map<string, HTMLCanvasElement>();

/** A sheet with the atmosphere's light, haze and season baked in. */
export function gradedSheet(source: HTMLImageElement, name: string, g: Grade) {
  const key = `${name}|${g.light.join(",")}|${g.haze.join(",")}|${g.hazeAmount}|${g.filter}`;
  const cached = tinted.get(key);
  if (cached) return cached;
  if (tinted.size > 240) tinted.clear();

  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.filter = g.filter;
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${g.light.map(Math.round).join(",")})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (g.hazeAmount > 0) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${g.haze.map(Math.round).join(",")},${g.hazeAmount})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Multiply and haze fill the transparent pixels too; cut them back out.
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(source, 0, 0);
  tinted.set(key, canvas);
  return canvas;
}
