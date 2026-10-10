import type { SpritePoint } from "../spriteAnchors";

/**
 * Fixed caption slots for the field-guide plate, in plate-local px. Captions
 * never move freely (so they can never overlap each other); traits are
 * assigned to slots so their leader lines stay short and don't cross.
 */
export interface PlateCaptionSlot {
  left: number;
  top: number;
  /** Where the leader line leaves the caption. */
  attach: SpritePoint;
  /** Bottom slots hang their text below the line attach point. */
  below: boolean;
}

function slot(left: number, top: number, below: boolean): PlateCaptionSlot {
  return {
    left,
    top,
    below,
    attach: below
      ? { x: left + 56, y: top - 8 }
      : { x: left + 56, y: top + 54 },
  };
}

/** Two above the cat, one top-left, two below — as in the approved mockup. */
export const PLATE_CAPTION_SLOTS: readonly PlateCaptionSlot[] = [
  slot(36, 150, false),
  // 22 chars at 22px ≈ 245px: 205 + 245 leaves a gap before the next slot,
  // and 480 + 245 stays clear of the legend at 732.
  slot(205, 82, false),
  slot(480, 82, false),
  slot(150, 838, true),
  slot(440, 838, true),
];

export interface CaptionCandidate {
  id: string;
  /** Feature point in plate-local px; null while anchors are unavailable. */
  target: SpritePoint | null;
}

/** Penalty (px²) for moving an already-placed caption to another slot. */
const MOVE_PENALTY = 260 ** 2;
const CROSS_PENALTY = 900 ** 2;

function cross(o: SpritePoint, a: SpritePoint, b: SpritePoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsCross(
  p1: SpritePoint,
  p2: SpritePoint,
  q1: SpritePoint,
  q2: SpritePoint,
): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Brute-force the best candidate → slot assignment (≤ 5 × 5, so at most
 * 120 permutations): short lines, no crossings, and captions stay put
 * between reveals when that costs little.
 */
export function assignCaptionSlots(
  candidates: readonly CaptionCandidate[],
  previous: ReadonlyMap<string, number>,
  available: readonly number[] = PLATE_CAPTION_SLOTS.map((_, i) => i),
  slots: readonly PlateCaptionSlot[] = PLATE_CAPTION_SLOTS,
): Map<string, number> {
  const list = candidates.slice(0, available.length);
  let best: number[] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  const used = new Array<boolean>(slots.length).fill(false);
  const chosen: number[] = [];

  const lineCost = (ci: number, si: number) => {
    const target = list[ci].target;
    let cost = 0;
    if (target) {
      const a = slots[si].attach;
      cost += (a.x - target.x) ** 2 + (a.y - target.y) ** 2;
    }
    const prev = previous.get(list[ci].id);
    if (prev !== undefined && prev !== si) cost += MOVE_PENALTY;
    return cost;
  };

  const walk = (ci: number, cost: number) => {
    if (cost >= bestCost) return;
    if (ci === list.length) {
      bestCost = cost;
      best = chosen.slice();
      return;
    }
    for (const si of available) {
      if (used[si]) continue;
      let extra = lineCost(ci, si);
      const t = list[ci].target;
      if (t) {
        for (let pj = 0; pj < ci; pj++) {
          const pt = list[pj].target;
          if (
            pt &&
            segmentsCross(slots[si].attach, t, slots[chosen[pj]].attach, pt)
          ) {
            extra += CROSS_PENALTY;
          }
        }
      }
      used[si] = true;
      chosen.push(si);
      walk(ci + 1, cost + extra);
      chosen.pop();
      used[si] = false;
    }
  };
  walk(0, 0);

  const out = new Map<string, number>();
  best.forEach((si, ci) => {
    out.set(list[ci].id, si);
  });
  return out;
}

/** Rough caption footprint (two lines, ≤ 22 chars) used for collision checks. */
const CAPTION_BOX = { width: 300, height: 56 } as const;

/**
 * Caption slots the drawn sprite pokes into (e.g. a raised tail under the
 * top-left caption), found by sampling the canvas alpha inside each slot's
 * box. `catOrigin` is the canvas's plate-local top-left; the canvas is drawn
 * 1:1 (720 CSS px for a 720 px backing store). Returns [] if unreadable.
 */
export function occupiedCaptionSlots(
  canvas: HTMLCanvasElement,
  catOrigin: SpritePoint,
  slots: readonly PlateCaptionSlot[] = PLATE_CAPTION_SLOTS,
): number[] {
  if (!canvas.width || !canvas.height) return [];
  // Downscale into our own small read-optimised canvas (one readback, and
  // the engine's canvas stays GPU-friendly). Smoothing spreads any opaque
  // sprite pixel into the sampled cell.
  const grid = 100;
  const scratch = document.createElement("canvas");
  scratch.width = grid;
  scratch.height = grid;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(canvas, 0, 0, grid, grid);
    data = ctx.getImageData(0, 0, grid, grid).data;
  } catch {
    // A tainted canvas can't be read — fall back to using every slot.
    return [];
  }
  const sx = grid / canvas.width;
  const sy = grid / canvas.height;
  const out: number[] = [];
  slots.forEach((s, i) => {
    const x0 = Math.max(0, Math.floor((s.left - 12 - catOrigin.x) * sx));
    const y0 = Math.max(0, Math.floor((s.top - 8 - catOrigin.y) * sy));
    const x1 = Math.min(
      grid,
      Math.ceil((s.left + CAPTION_BOX.width - catOrigin.x) * sx),
    );
    const y1 = Math.min(
      grid,
      Math.ceil((s.top + CAPTION_BOX.height - catOrigin.y) * sy),
    );
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (data[(y * grid + x) * 4 + 3] > 8) {
          out.push(i);
          return;
        }
      }
    }
  });
  return out;
}
