/**
 * Sprite feature anchors — where the eyes, ears, chest, tail etc. sit on a
 * 50×50 ClanGen sprite cell. Computed at runtime from the public sprite
 * sheets (lineart silhouette + eyes cell) so every pose works without
 * hand-authored data. The geometry here is pure and unit-testable; image
 * decoding lives in useSpriteAnchors.ts.
 */

export const SPRITE_SIZE = 50;

export type AnchorId =
  | "eyes"
  | "head"
  | "ear"
  | "chest"
  | "pelt"
  | "back"
  | "tail"
  | "paw";

export const ANCHOR_IDS: readonly AnchorId[] = [
  "eyes",
  "head",
  "ear",
  "chest",
  "pelt",
  "back",
  "tail",
  "paw",
];

/** A point in sprite units (0..50, origin top-left). */
export interface SpritePoint {
  x: number;
  y: number;
}

export interface SpriteBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpriteAnchors {
  pose: string;
  reverse: boolean;
  points: Record<AnchorId, SpritePoint>;
  /** Bounding box of the silhouette in sprite units (inclusive pixel indices). */
  bounds?: SpriteBounds;
}

/** 1 = opaque pixel, 0 = transparent, row-major, length w*h. */
export type SpriteMask = Uint8Array;

/** Build a mask from RGBA pixel data using the alpha channel. */
export function maskFromAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  width = SPRITE_SIZE,
  height = SPRITE_SIZE,
  threshold = 8,
): SpriteMask {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = rgba[i * 4 + 3] > threshold ? 1 : 0;
  }
  return mask;
}

/**
 * The lineart sheet is an outline, not a fill. Flood-fill the background
 * from the border and invert so the mask becomes a solid silhouette.
 * Falls back to the outline itself if nothing is enclosed.
 */
export function fillOutline(
  outline: SpriteMask,
  width = SPRITE_SIZE,
  height = SPRITE_SIZE,
): SpriteMask {
  const outside = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (outside[i] || outline[i]) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % width;
    const y = (i - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const filled = new Uint8Array(width * height);
  let enclosed = 0;
  for (let i = 0; i < filled.length; i++) {
    filled[i] = outside[i] ? 0 : 1;
    if (filled[i] && !outline[i]) enclosed++;
  }
  return enclosed > 0 ? filled : outline;
}

function centroid(
  mask: SpriteMask,
  width: number,
  height: number,
): SpritePoint | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

/**
 * Derive the anchor set from a solid silhouette mask and (optionally) an
 * eyes mask. Returns null when the silhouette is empty.
 */
export function computeAnchorsFromMasks(
  silhouette: SpriteMask,
  eyes: SpriteMask | null,
  opts: { pose: string; reverse: boolean },
  width = SPRITE_SIZE,
  height = SPRITE_SIZE,
): SpriteAnchors | null {
  const pelt = centroid(silhouette, width, height);
  if (!pelt) return null;
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && silhouette[y * width + x];

  const eyesPoint = (eyes && centroid(eyes, width, height)) ?? {
    x: pelt.x,
    y: pelt.y - height * 0.3,
  };

  // Head: topmost silhouette pixel within ±8 of the eye column.
  let head: SpritePoint | null = null;
  const ex = Math.round(eyesPoint.x);
  for (let y = 0; y < height && !head; y++) {
    for (let dx = 0; dx <= 8 && !head; dx++) {
      if (at(ex + dx, y)) head = { x: ex + dx, y };
      else if (at(ex - dx, y)) head = { x: ex - dx, y };
    }
  }
  head ??= { x: eyesPoint.x, y: Math.max(0, eyesPoint.y - 6) };

  // Ear: the head point nudged toward the nearer silhouette edge.
  const ear = { x: head.x + (head.x >= pelt.x ? 3 : -3), y: head.y + 1 };

  // Back: topmost silhouette pixel at the centroid column.
  let back: SpritePoint | null = null;
  const cx = Math.round(pelt.x);
  for (let y = 0; y < height && !back; y++) {
    if (at(cx, y)) back = { x: cx, y };
  }
  back ??= { x: pelt.x, y: Math.max(0, pelt.y - 8) };

  // Chest: between eyes and centroid, pushed down.
  const chest = {
    x: (eyesPoint.x + pelt.x) / 2,
    y: (eyesPoint.y + pelt.y) / 2 + 6,
  };

  // Tail: silhouette pixel farthest from the eyes, with pixels below the
  // body centre penalised so hind paws don't win over a raised tail.
  let tail: SpritePoint = pelt;
  let best = -Infinity;
  // Paw: bottom-most pixel, ties broken by closeness to the centroid column.
  let paw: SpritePoint = pelt;
  let pawScore = -Infinity;
  const bounds: SpriteBounds = {
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!silhouette[y * width + x]) continue;
      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (y < bounds.minY) bounds.minY = y;
      if (y > bounds.maxY) bounds.maxY = y;
      const d = (x - eyesPoint.x) ** 2 + (y - eyesPoint.y) ** 2;
      const below = Math.max(0, y - pelt.y);
      const tailScore = d - 6 * below * below;
      if (tailScore > best) {
        best = tailScore;
        tail = { x, y };
      }
      const score = y * 100 - Math.abs(x - pelt.x);
      if (score > pawScore) {
        pawScore = score;
        paw = { x, y };
      }
    }
  }

  const points: Record<AnchorId, SpritePoint> = {
    eyes: eyesPoint,
    head,
    ear,
    chest,
    pelt,
    back,
    tail,
    paw,
  };
  if (opts.reverse) {
    for (const id of ANCHOR_IDS) {
      points[id] = { x: width - 1 - points[id].x, y: points[id].y };
    }
    const { minX, maxX } = bounds;
    bounds.minX = width - 1 - maxX;
    bounds.maxX = width - 1 - minX;
  }
  return { pose: opts.pose, reverse: opts.reverse, points, bounds };
}

/**
 * Convert sprite-unit anchors to CSS pixels: `pxPerUnit` is the drawn cat
 * size divided by SPRITE_SIZE (720 / 50 = 14.4), `offset` is the cat's
 * top-left on the stage.
 */
export function scaleAnchors(
  anchors: SpriteAnchors,
  pxPerUnit: number,
  offset: SpritePoint = { x: 0, y: 0 },
): Record<AnchorId, SpritePoint> {
  const out = {} as Record<AnchorId, SpritePoint>;
  for (const id of ANCHOR_IDS) {
    const p = anchors.points[id];
    out[id] = {
      x: offset.x + (p.x + 0.5) * pxPerUnit,
      y: offset.y + (p.y + 0.5) * pxPerUnit,
    };
  }
  return out;
}
