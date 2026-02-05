import type { PipelineStep } from "@/lib/pixelator/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PixelatorSettings {
  v: 1;
  pipeline: { steps: PipelineStep[] };
  pixelArtMode: boolean;
  pixelArtGridSize: number | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_PIXELATOR_SETTINGS: PixelatorSettings = {
  v: 1,
  pipeline: { steps: [] },
  pixelArtMode: false,
  pixelArtGridSize: null,
};

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

export function parsePixelatorPayload(payload: unknown): PixelatorSettings {
  if (!payload || typeof payload !== "object") {
    return { ...DEFAULT_PIXELATOR_SETTINGS };
  }
  const data = payload as Record<string, unknown>;

  const pixelArtMode = typeof data.pixelArtMode === "boolean" ? data.pixelArtMode : false;

  const pixelArtGridSize =
    typeof data.pixelArtGridSize === "number" && Number.isFinite(data.pixelArtGridSize)
      ? Math.max(1, Math.min(128, Math.round(data.pixelArtGridSize)))
      : null;

  let steps: PipelineStep[] = [];
  const pipeline = data.pipeline as Record<string, unknown> | undefined;
  if (pipeline && Array.isArray(pipeline.steps)) {
    steps = pipeline.steps.filter(
      (item): item is PipelineStep =>
        item != null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).algorithm === "string",
    );
  }

  return { v: 1, pipeline: { steps }, pixelArtMode, pixelArtGridSize };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function pixelatorSettingsEqual(
  a: PixelatorSettings,
  b: PixelatorSettings,
): boolean {
  if (a.pixelArtMode !== b.pixelArtMode) return false;
  if (a.pixelArtGridSize !== b.pixelArtGridSize) return false;
  if (a.pipeline.steps.length !== b.pipeline.steps.length) return false;

  for (let i = 0; i < a.pipeline.steps.length; i++) {
    const sa = a.pipeline.steps[i]!;
    const sb = b.pipeline.steps[i]!;
    if (sa.id !== sb.id || sa.algorithm !== sb.algorithm || sa.enabled !== sb.enabled) return false;
    if (sa.inputSource !== sb.inputSource) return false;
    if (JSON.stringify(sa.params) !== JSON.stringify(sb.params)) return false;
    if (JSON.stringify(sa.blendWith) !== JSON.stringify(sb.blendWith)) return false;
  }

  return true;
}
