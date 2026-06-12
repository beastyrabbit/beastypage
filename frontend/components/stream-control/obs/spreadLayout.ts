/**
 * Spread layout geometry — in "spread" mode every overlay element gets its
 * own separated region with a 50px gutter on all sides, so streamers can
 * crop each piece individually in OBS and build a custom interface. The
 * canvas intentionally exceeds 1920×1080: set the browser source to the
 * spread canvas size and crop from there.
 */

export const SPREAD_GAP = 50;

export const SPREAD_CANVAS = { width: 2120, height: 1180 } as const;

export type SpreadRegionId =
  | "catCanvas"
  | "paramBoard"
  | "qr"
  | "wheelBanner"
  | "wheel"
  | "layerBar";

export type SpreadRegion = {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Guide colour on the test card. */
  colour: string;
};

export const SPREAD_REGIONS: Record<SpreadRegionId, SpreadRegion> = {
  catCanvas: {
    label: "Cat Canvas",
    left: 50,
    top: 50,
    width: 750,
    height: 780,
    colour: "34, 197, 94",
  },
  paramBoard: {
    label: "Param Board",
    left: 850,
    top: 50,
    width: 510,
    height: 840,
    colour: "245, 158, 11",
  },
  qr: {
    label: "Share QR",
    left: 1410,
    top: 50,
    width: 220,
    height: 220,
    colour: "59, 130, 246",
  },
  wheelBanner: {
    label: "Wheel Banner",
    left: 1410,
    top: 320,
    width: 520,
    height: 100,
    colour: "236, 72, 153",
  },
  wheel: {
    label: "Wheel",
    left: 1410,
    top: 470,
    width: 660,
    height: 660,
    colour: "168, 85, 247",
  },
  layerBar: {
    label: "Layer Details",
    left: 50,
    top: 940,
    width: 1240,
    height: 180,
    colour: "20, 184, 166",
  },
};
