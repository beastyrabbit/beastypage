import type { SpritePoint } from "../spriteAnchors";

/**
 * Per-trait offsets (sprite units) so traits that share a feature anchor
 * (eyes, chest, paw…) become distinct stars. x is mirrored with the sprite.
 */
const STAR_JITTER: Record<string, SpritePoint> = {
  colour: { x: -2.5, y: 2 },
  pelt: { x: 0, y: 1.5 },
  eyeColour: { x: -1, y: 0 },
  eyeColour2: { x: 2.5, y: -2.5 },
  tint: { x: 0, y: 0 },
  skinColour: { x: 1.5, y: -0.5 },
  whitePatches: { x: 0, y: 0 },
  points: { x: 0, y: -1.5 },
  whitePatchesTint: { x: 3, y: 3 },
  vitiligo: { x: -2, y: -1 },
  sprite: { x: -6, y: -2 },
};

/** Apparent magnitude: headline traits are brighter (bigger) stars. */
const STAR_RADIUS: Record<string, number> = {
  colour: 8,
  pelt: 7,
  eyeColour: 8,
  eyeColour2: 5,
  tint: 6,
  skinColour: 5,
  whitePatches: 7,
  points: 6,
  whitePatchesTint: 5,
  vitiligo: 6,
  sprite: 6,
};

export function starJitter(paramId: string): SpritePoint {
  return STAR_JITTER[paramId] ?? { x: 0, y: 0 };
}

export function starRadius(paramId: string): number {
  return STAR_RADIUS[paramId] ?? 6;
}

/**
 * Nudge stars apart until every pair is at least `minDist` px apart, so
 * traits on neighbouring anchors (chest vs. pelt centre, head vs. ear) stay
 * readable in every pose. Deterministic; a few relaxation passes suffice.
 */
export function separateStars(
  points: readonly SpritePoint[],
  minDist = 38,
  iterations = 16,
): SpritePoint[] {
  const out = points.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < 0.01) {
          // Coincident: split along a fixed, index-dependent direction.
          const a = (j * 2.399) % (2 * Math.PI);
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        const push = (minDist - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        out[i].x -= ux * push;
        out[i].y -= uy * push;
        out[j].x += ux * push;
        out[j].y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** Celestial grid (stage px) from the approved mockup; stays left of the camera zone. */
export const STARCHART_GRID_PATHS: readonly string[] = [
  "M40,520 Q640,300 1240,520",
  "M40,700 Q640,480 1240,700",
  "M40,880 Q640,660 1240,880",
  "M40,340 Q640,120 1240,340",
  "M240,60 Q300,500 240,1040",
  "M640,60 Q640,500 640,1040",
  "M1040,60 Q980,500 1040,1040",
];

/** Faint field stars: [cx, cy, r]. */
export const STARCHART_BG_STARS: readonly (readonly [
  number,
  number,
  number,
])[] = [
  [120, 140, 2],
  [330, 90, 1.5],
  [700, 150, 2],
  [1100, 120, 1.5],
  [160, 760, 1.5],
  [90, 980, 2],
  [520, 960, 1.5],
  [1180, 860, 2],
  [880, 900, 1.5],
  [420, 230, 1.5],
  [1210, 420, 1.5],
  [210, 330, 1.2],
  [560, 110, 1.3],
  [960, 200, 1.6],
  [1150, 640, 1.2],
  [300, 560, 1.1],
  [760, 780, 1.4],
  [1020, 980, 1.3],
  [640, 870, 1.1],
  [120, 600, 1.3],
  [1230, 760, 1.2],
  [820, 60, 1.2],
  [460, 1000, 1.4],
  [980, 560, 1.1],
  [1120, 300, 1.3],
  [240, 900, 1.2],
  [700, 480, 1.0],
  [360, 760, 1.1],
  [1180, 180, 1.0],
];

/**
 * Faint meteors that cross the sky now and then while the chart is up:
 * [startX, startY, dx, dy, periodSeconds, delaySeconds]. Each fires for the
 * first ~9% of its period and stays left of the camera zone.
 */
export const STARCHART_AMBIENT_METEORS: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  number,
])[] = [
  [1180, 90, -300, 190, 13, 2],
  [820, 70, -260, 160, 19, 9],
  [1230, 430, -240, 150, 23, 15],
];

/** The finale volley: [x1, y1, x2, y2, delayMs], bright gold, fired once at completion. */
export const STARCHART_FINALE_METEORS: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
])[] = [
  [1200, 70, 620, 340, 0],
  [900, 60, 360, 260, 320],
  [1230, 300, 760, 580, 680],
  [560, 70, 150, 320, 1050],
  [1210, 620, 860, 860, 1400],
];

// ── A real patch of sky ────────────────────────────────────────────────────
// The cat constellations: Leo, Leo Minor and the brighter end of Lynx, with
// J2000 coordinates (degrees, rounded) and visual magnitudes from the usual
// bright-star tables. Projected equirectangular around RA 158°, Dec +20° so
// Leo sits behind the cat, Leo Minor above it and the tail of Lynx up-right.

export interface RealStar {
  /** Bayer/Flamsteed designation (α, β, 46…). */
  id: string;
  name?: string;
  con: "Leo" | "LMi" | "Lyn";
  ra: number;
  dec: number;
  mag: number;
}

export const STARCHART_REAL_STARS: readonly RealStar[] = [
  { id: "α", name: "Regulus", con: "Leo", ra: 152.09, dec: 11.97, mag: 1.36 },
  { id: "β", name: "Denebola", con: "Leo", ra: 177.26, dec: 14.57, mag: 2.14 },
  { id: "γ", name: "Algieba", con: "Leo", ra: 154.99, dec: 19.84, mag: 2.08 },
  { id: "δ", name: "Zosma", con: "Leo", ra: 168.53, dec: 20.52, mag: 2.56 },
  { id: "ε", name: "Algenubi", con: "Leo", ra: 146.46, dec: 23.77, mag: 2.98 },
  { id: "ζ", name: "Adhafera", con: "Leo", ra: 154.17, dec: 23.42, mag: 3.44 },
  { id: "η", con: "Leo", ra: 151.83, dec: 16.76, mag: 3.52 },
  { id: "θ", name: "Chertan", con: "Leo", ra: 168.56, dec: 15.43, mag: 3.34 },
  { id: "ι", con: "Leo", ra: 170.98, dec: 10.53, mag: 3.94 },
  { id: "κ", con: "Leo", ra: 141.16, dec: 26.18, mag: 4.46 },
  { id: "λ", name: "Alterf", con: "Leo", ra: 142.93, dec: 22.97, mag: 4.31 },
  { id: "μ", name: "Rasalas", con: "Leo", ra: 148.19, dec: 26.01, mag: 3.88 },
  { id: "ο", name: "Subra", con: "Leo", ra: 145.29, dec: 9.89, mag: 3.52 },
  { id: "ρ", con: "Leo", ra: 158.2, dec: 9.31, mag: 3.85 },
  { id: "σ", con: "Leo", ra: 170.28, dec: 6.03, mag: 4.05 },
  {
    id: "46",
    name: "Praecipua",
    con: "LMi",
    ra: 163.33,
    dec: 34.21,
    mag: 3.83,
  },
  { id: "β", con: "LMi", ra: 156.97, dec: 36.71, mag: 4.21 },
  { id: "21", con: "LMi", ra: 151.86, dec: 35.24, mag: 4.48 },
  { id: "10", con: "LMi", ra: 143.56, dec: 36.4, mag: 4.55 },
  { id: "α", con: "Lyn", ra: 140.26, dec: 34.39, mag: 3.14 },
  { id: "38", con: "Lyn", ra: 139.71, dec: 36.8, mag: 3.82 },
];

/** Stick figures as [con, from, to] by designation. */
export const STARCHART_REAL_LINES: readonly (readonly [
  RealStar["con"],
  string,
  string,
])[] = [
  // The Sickle
  ["Leo", "ε", "μ"],
  ["Leo", "μ", "ζ"],
  ["Leo", "ζ", "γ"],
  ["Leo", "γ", "η"],
  ["Leo", "η", "α"],
  // The body
  ["Leo", "γ", "δ"],
  ["Leo", "δ", "β"],
  ["Leo", "β", "θ"],
  ["Leo", "θ", "α"],
  ["Leo", "δ", "θ"],
  ["LMi", "10", "21"],
  ["LMi", "21", "β"],
  ["LMi", "β", "46"],
  ["LMi", "21", "46"],
  ["Lyn", "38", "α"],
];

export const STARCHART_CONSTELLATION_NAMES: Record<RealStar["con"], string> = {
  Leo: "Leo",
  LMi: "Leo Minor",
  Lyn: "Lynx",
};

/** Centred so the figures sit behind the cat, clear of the catalogue (x ≥ 768). */
const PROJ = { ra0: 158, dec0: 20, cx: 430, cy: 560, pxPerDeg: 14 } as const;

/** Equirectangular projection to stage px; east (increasing RA) is to the left, as on a sky chart. */
export function projectSky(ra: number, dec: number): SpritePoint {
  const cosDec = Math.cos((PROJ.dec0 * Math.PI) / 180);
  return {
    x: PROJ.cx - (ra - PROJ.ra0) * PROJ.pxPerDeg * cosDec,
    y: PROJ.cy - (dec - PROJ.dec0) * PROJ.pxPerDeg,
  };
}

/** Star radius from visual magnitude (brighter = bigger). */
export function magnitudeRadius(mag: number): number {
  return Math.max(1, 4.6 - mag * 0.85);
}
