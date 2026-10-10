import { describe, expect, it } from "vitest";
import {
  ANCHOR_IDS,
  computeAnchorsFromMasks,
  fillOutline,
  maskFromAlpha,
  SPRITE_SIZE,
  type SpriteAnchors,
  type SpriteMask,
  scaleAnchors,
} from "./spriteAnchors";

const W = SPRITE_SIZE;

function blank(): SpriteMask {
  return new Uint8Array(W * W);
}

function set(mask: SpriteMask, x: number, y: number) {
  mask[y * W + x] = 1;
}

function rect(
  mask: SpriteMask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(mask, x, y);
}

function circle(mask: SpriteMask, cx: number, cy: number, r: number) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(mask, x, y);
    }
  }
}

function count(mask: SpriteMask): number {
  return mask.reduce((n, v) => n + v, 0);
}

/** A cat-ish silhouette: body on the right, head on the left, tail sticking up-right. */
function catMasks() {
  const silhouette = blank();
  rect(silhouette, 18, 25, 40, 38); // body
  circle(silhouette, 14, 20, 7); // head
  rect(silhouette, 39, 10, 41, 25); // tail
  rect(silhouette, 20, 39, 22, 45); // front leg (bottom-most)
  const eyes = blank();
  set(eyes, 11, 19);
  set(eyes, 15, 19);
  return { silhouette, eyes };
}

/** computeAnchorsFromMasks on the synthetic cat; fails the test if it returns null. */
function catAnchors(reverse: boolean, withEyes = true): SpriteAnchors {
  const { silhouette, eyes } = catMasks();
  const anchors = computeAnchorsFromMasks(silhouette, withEyes ? eyes : null, {
    pose: "adult_short0",
    reverse,
  });
  if (!anchors) throw new Error("expected anchors for the synthetic cat");
  return anchors;
}

describe("maskFromAlpha", () => {
  it("thresholds the alpha channel", () => {
    const rgba = new Uint8ClampedArray(4 * 4);
    rgba[3] = 255;
    rgba[7] = 4;
    rgba[11] = 9;
    expect(Array.from(maskFromAlpha(rgba, 2, 2))).toEqual([1, 0, 1, 0]);
  });
});

describe("fillOutline", () => {
  it("fills a hollow square outline", () => {
    const outline = blank();
    for (let i = 10; i <= 30; i++) {
      set(outline, i, 10);
      set(outline, i, 30);
      set(outline, 10, i);
      set(outline, 30, i);
    }
    const filled = fillOutline(outline);
    expect(filled[20 * W + 20]).toBe(1);
    expect(filled[5 * W + 5]).toBe(0);
    expect(count(filled)).toBe(21 * 21);
  });

  it("returns the outline when nothing is enclosed", () => {
    const line = blank();
    rect(line, 5, 5, 20, 5);
    expect(fillOutline(line)).toBe(line);
  });
});

describe("computeAnchorsFromMasks", () => {
  it("returns null for an empty silhouette", () => {
    expect(
      computeAnchorsFromMasks(blank(), null, { pose: "p", reverse: false }),
    ).toBeNull();
  });

  it("places anchors on the expected features", () => {
    const { silhouette } = catMasks();
    const anchors = catAnchors(false);
    const p = anchors.points;
    expect(anchors.pose).toBe("adult_short0");
    expect(p.eyes).toEqual({ x: 13, y: 19 });
    // Head is the top of the silhouette above the eyes.
    expect(p.head.y).toBeLessThan(p.eyes.y);
    expect(Math.abs(p.head.x - p.eyes.x)).toBeLessThanOrEqual(8);
    // Tail is the far-from-eyes pixel that is not below the body centre:
    // the raised tail rect (x 39–41, y 10–25), not the body's bottom corner.
    expect(silhouette[p.tail.y * W + p.tail.x]).toBe(1);
    expect(p.tail.x).toBeGreaterThanOrEqual(39);
    expect(p.tail.y).toBeLessThanOrEqual(25);
    // Paw is the bottom-most pixel (the leg).
    expect(p.paw.y).toBe(45);
    expect(p.paw.x).toBeGreaterThanOrEqual(20);
    expect(p.paw.x).toBeLessThanOrEqual(22);
    for (const id of ANCHOR_IDS) {
      expect(p[id].x).toBeGreaterThanOrEqual(0);
      expect(p[id].x).toBeLessThan(W);
      expect(p[id].y).toBeGreaterThanOrEqual(0);
      expect(p[id].y).toBeLessThan(W);
    }
  });

  it("mirrors x when reversed", () => {
    const normal = catAnchors(false);
    const mirrored = catAnchors(true);
    expect(mirrored.reverse).toBe(true);
    for (const id of ANCHOR_IDS) {
      expect(mirrored.points[id].x).toBeCloseTo(W - 1 - normal.points[id].x);
      expect(mirrored.points[id].y).toBe(normal.points[id].y);
    }
  });

  it("falls back to an estimated eye point without an eyes mask", () => {
    const anchors = catAnchors(false, false);
    expect(anchors.points.eyes.y).toBeLessThan(anchors.points.pelt.y);
  });
});

describe("scaleAnchors", () => {
  it("maps sprite units to pixel centres", () => {
    const anchors = catAnchors(false);
    const scaled = scaleAnchors(anchors, 720 / 50, { x: 10, y: 20 });
    expect(scaled.eyes.x).toBeCloseTo(10 + 13.5 * 14.4);
    expect(scaled.eyes.y).toBeCloseTo(20 + 19.5 * 14.4);
  });
});
