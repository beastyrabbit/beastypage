import type { SpriteMapperApi } from "./types";

export function formatName(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "number") return `#${value}`;
  return String(value)
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "None";
}

export function cloneParams<T extends Record<string, unknown>>(params: T): T {
  return structuredClone(params) as T;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): string {
  try {
    if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
      return canvas.toDataURL("image/png");
    }
  } catch (error) {
    console.warn("Failed to convert canvas to data URL", error);
  }
  return "";
}

const BASE_COLOUR_SWATCHES: Record<string, string> = {
  WHITE: "#f8fafc",
  PALEGREY: "#e2e8f0",
  SILVER: "#cbd5f5",
  GREY: "#94a3b8",
  DARKGREY: "#475569",
  GHOST: "#e2e8ff",
  BLACK: "#111827",
  CREAM: "#fef3c7",
  PALEGINGER: "#fcd34d",
  GOLDEN: "#f59e0b",
  GINGER: "#f97316",
  DARKGINGER: "#ea580c",
  SIENNA: "#c2410c",
  LIGHTBROWN: "#d6a665",
  LILAC: "#c4b5fd",
  BROWN: "#7c4d1f",
  "GOLDEN-BROWN": "#b45309",
  DARKBROWN: "#3f2d1c",
  CHOCOLATE: "#2f1b11",
};

export function getColourSwatch(name: string, mapper: SpriteMapperApi | null): string {
  const fallback = "#94a3b8";
  if (!name) return fallback;
  const direct = BASE_COLOUR_SWATCHES[name.toUpperCase()];
  if (direct) return direct;
  const experimental = mapper?.getExperimentalColourDefinition?.(name);
  if (experimental?.multiply && experimental.multiply.length >= 3) {
    const [r, g, b] = experimental.multiply;
    return `rgb(${r}, ${g}, ${b})`;
  }
  return fallback;
}
