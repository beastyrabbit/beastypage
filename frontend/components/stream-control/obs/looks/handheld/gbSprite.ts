"use client";

import { useEffect, useState } from "react";

/** The four DMG greens, darkest first. */
export const GB_SHADES = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] as const;
export const GB_SCREEN = "#9bbc0f";
export const GB_INK = "#0f380f";
export const GB_DIM = "#306230";

const SHADE_RGB: [number, number, number][] = [
  [15, 56, 15],
  [48, 98, 48],
  [139, 172, 15],
  [155, 188, 15],
];

const cache = new Map<string, Promise<string>>();

/**
 * Re-colour a rendered sprite (data URL) into the four-shade LCD palette by
 * luminance. Results are cached per source URL, so a board re-render never
 * re-quantises.
 */
export function toGbSprite(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached) return cached;
  const promise = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("2d context unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 8) {
          px[i + 3] = 0;
          continue;
        }
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const shade = lum < 64 ? 0 : lum < 128 ? 1 : lum < 200 ? 2 : 3;
        const [r, g, b] = SHADE_RGB[shade];
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("sprite failed to load"));
    image.src = url;
  });
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
}

/** The LCD version of a sprite URL; null until converted (or if `url` is null). */
export function useGbSprite(url: string | null): string | null {
  const [gb, setGb] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setGb(null);
      return;
    }
    let cancelled = false;
    toGbSprite(url)
      .then((result) => {
        if (!cancelled) setGb(result);
      })
      .catch(() => {
        if (!cancelled) setGb(url);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return gb;
}
