"use client";

import { useEffect, useState } from "react";
import {
  computeAnchorsFromMasks,
  fillOutline,
  maskFromAlpha,
  SPRITE_SIZE,
  type SpriteAnchors,
  type SpriteMask,
} from "./spriteAnchors";

/**
 * Browser half of the anchor system: decodes the public sprite sheets once,
 * cuts the pose cell out of the lineart (silhouette) and eyes sheets, and
 * caches the computed anchors per `${pose}:${reverse}`.
 */

const LINEART_SHEET = "/sprites/lineart.png";
const EYES_SHEET = "/sprites/eyes.png";
const POSE_DATA = "/sprite-data/poseData.json";

interface PoseData {
  poseNameToOffset: Record<string, { x: number; y: number }>;
}

let poseDataPromise: Promise<PoseData> | null = null;
const sheetPromises = new Map<string, Promise<HTMLImageElement>>();
const anchorCache = new Map<string, Promise<SpriteAnchors | null>>();

function loadPoseData(): Promise<PoseData> {
  poseDataPromise ??= fetch(POSE_DATA)
    .then((r) => r.json() as Promise<PoseData>)
    .catch((err) => {
      poseDataPromise = null;
      throw err;
    });
  return poseDataPromise;
}

function loadSheet(src: string): Promise<HTMLImageElement> {
  let p = sheetPromises.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        sheetPromises.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      img.src = src;
    });
    sheetPromises.set(src, p);
  }
  return p;
}

function cellMask(
  img: HTMLImageElement,
  cellX: number,
  cellY: number,
): SpriteMask | null {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(
    img,
    cellX * SPRITE_SIZE,
    cellY * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE,
    0,
    0,
    SPRITE_SIZE,
    SPRITE_SIZE,
  );
  return maskFromAlpha(ctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE).data);
}

/** Compute (or fetch from cache) the anchors for a pose. Resolves null if the pose is unknown. */
export function loadSpriteAnchors(
  poseName: string,
  reverse: boolean,
): Promise<SpriteAnchors | null> {
  const key = `${poseName}:${reverse ? 1 : 0}`;
  let cached = anchorCache.get(key);
  if (!cached) {
    cached = (async () => {
      const [poseData, lineart, eyes] = await Promise.all([
        loadPoseData(),
        loadSheet(LINEART_SHEET),
        loadSheet(EYES_SHEET),
      ]);
      const offset = poseData.poseNameToOffset[poseName];
      if (!offset) return null;
      const outline = cellMask(lineart, offset.x, offset.y);
      if (!outline) return null;
      // The yellow eye block sits at the sheet origin; any block has the same shape.
      const eyeMask = cellMask(eyes, offset.x, offset.y);
      return computeAnchorsFromMasks(fillOutline(outline), eyeMask, {
        pose: poseName,
        reverse,
      });
    })().catch(() => {
      anchorCache.delete(key);
      return null;
    });
    anchorCache.set(key, cached);
  }
  return cached;
}

/** React hook: anchors for the drawn pose, null until decoded. */
export function useSpriteAnchors(
  poseName: string,
  reverse: boolean,
): SpriteAnchors | null {
  const [anchors, setAnchors] = useState<SpriteAnchors | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSpriteAnchors(poseName, reverse).then((result) => {
      if (!cancelled) setAnchors(result);
    });
    return () => {
      cancelled = true;
    };
  }, [poseName, reverse]);
  return anchors;
}
