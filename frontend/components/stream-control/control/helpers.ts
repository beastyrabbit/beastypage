/**
 * Module-level constants and pure helpers for the stream control page,
 * extracted verbatim from StreamControlClient.tsx.
 */

import { encodePortableSettings } from "@/lib/portable-settings";
import type { SingleCatSettings } from "@/utils/singleCatVariants";

export const LOBBY_MODE_DEFAULTS = {
  "fruit-ninja": { cats: 5, move: 1.5, swap: 1 },
  matrix: { cats: 8, move: 1, swap: 1 },
  dvd: { cats: 3, move: 0.5, swap: 1 },
  parade: { cats: 6, move: 1, swap: 1 },
  orbit: { cats: 6, move: 1, swap: 1 },
  bubbles: { cats: 8, move: 1, swap: 1 },
} as const;
export const FULL_EXPORT_SIZE = 700;
export type LobbyMode = keyof typeof LOBBY_MODE_DEFAULTS;
export type CanvasExportSource = HTMLCanvasElement | OffscreenCanvas;

export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isLobbyMode(value: unknown): value is LobbyMode {
  return typeof value === "string" && value in LOBBY_MODE_DEFAULTS;
}

export function isPaletteDisplayMode(value: unknown): value is "cycle" | "all" {
  return value === "cycle" || value === "all";
}

export function canvasToPngBlob(canvas: CanvasExportSource): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
  }

  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

/** Format a multiplier value like 1 -> "1x", 0.25 -> "0.25x", 2.50 -> "2.5x" */
export function formatMultiplier(v: number): string {
  return `${v.toFixed(2).replace(/\.?0+$/, "")}x`;
}

export function encodePortableCodeFromSettings(
  settings: SingleCatSettings,
): string {
  return encodePortableSettings({
    accessoryRange: settings.accessoryRange,
    scarRange: settings.scarRange,
    tortieRange: settings.tortieRange,
    exactLayerCounts: settings.exactLayerCounts,
    afterlifeMode: settings.afterlifeMode,
    includeBaseColours: settings.includeBaseColours,
    includeNewSprites: settings.includeNewSprites,
    extendedModes: settings.extendedModes,
  });
}
