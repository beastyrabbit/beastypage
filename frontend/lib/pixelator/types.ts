// ---------------------------------------------------------------------------
// Operation types — mirrors backend models
// ---------------------------------------------------------------------------

export type OperationType =
  | "block-average"
  | "nearest-neighbor"
  | "dither-bayer"
  | "dither-floyd-steinberg"
  | "dither-atkinson"
  | "quantize"
  | "jitter"
  | "edge-detect";

export type BlendMode =
  | "normal"
  | "multiply"
  | "add"
  | "screen"
  | "overlay"
  | "soft-light";

export type OutputFormat = "png" | "jpeg" | "webp";
export type ProcessMode = "preview" | "full";

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface BlendWith {
  stepId: string;
  mode: BlendMode;
  opacity: number;
}

export interface PipelineStep {
  id: string;
  algorithm: OperationType;
  params: Record<string, unknown>;
  inputSource: string; // "original" or previous step ID
  blendWith?: BlendWith | null;
  enabled: boolean;
  label: string;
}

export interface Pipeline {
  steps: PipelineStep[];
}

// ---------------------------------------------------------------------------
// API request/response
// ---------------------------------------------------------------------------

export interface ProcessRequest {
  image: string;
  pipeline: Pipeline;
  mode: ProcessMode;
  outputFormat: OutputFormat;
  outputQuality: number;
}

export interface ProcessResponse {
  image: string;
  meta: {
    duration_ms: number;
    width: number;
    height: number;
    steps_processed: number;
  };
}

export interface DetectGridResponse {
  detected: boolean;
  gridSize: number | null;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Operation metadata (for the toolbox UI)
// ---------------------------------------------------------------------------

export interface OperationParam {
  key: string;
  label: string;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
}

export interface OperationDefinition {
  type: OperationType;
  label: string;
  description: string;
  category: "pixelate" | "dither" | "color" | "effect";
  params: OperationParam[];
}

export const OPERATIONS: OperationDefinition[] = [
  {
    type: "block-average",
    label: "Block Average",
    description: "Classic pixel look by averaging color blocks",
    category: "pixelate",
    params: [
      { key: "blockSize", label: "Block Size", type: "number", min: 2, max: 128, step: 1, default: 16 },
    ],
  },
  {
    type: "nearest-neighbor",
    label: "Nearest Neighbor",
    description: "Crisp pixel edges using nearest-neighbor sampling",
    category: "pixelate",
    params: [
      { key: "blockSize", label: "Block Size", type: "number", min: 2, max: 128, step: 1, default: 16 },
    ],
  },
  {
    type: "dither-bayer",
    label: "Bayer Dither",
    description: "Ordered dithering with Bayer matrix pattern",
    category: "dither",
    params: [
      { key: "matrixSize", label: "Matrix Size", type: "number", min: 2, max: 8, step: 2, default: 4 },
      { key: "levels", label: "Color Levels", type: "number", min: 2, max: 32, step: 1, default: 8 },
    ],
  },
  {
    type: "dither-floyd-steinberg",
    label: "Floyd-Steinberg",
    description: "Error diffusion dithering for smooth gradients",
    category: "dither",
    params: [
      { key: "levels", label: "Color Levels", type: "number", min: 2, max: 32, step: 1, default: 4 },
    ],
  },
  {
    type: "dither-atkinson",
    label: "Atkinson Dither",
    description: "Retro Mac-style dithering with lighter distribution",
    category: "dither",
    params: [
      { key: "levels", label: "Color Levels", type: "number", min: 2, max: 32, step: 1, default: 4 },
    ],
  },
  {
    type: "quantize",
    label: "Quantize",
    description: "Reduce color palette to a set number of colors",
    category: "color",
    params: [
      { key: "colors", label: "Colors", type: "number", min: 2, max: 256, step: 1, default: 16 },
      { key: "dither", label: "Dither", type: "boolean", default: true },
    ],
  },
  {
    type: "jitter",
    label: "Jitter",
    description: "Organic hand-drawn feel via sub-pixel displacement",
    category: "effect",
    params: [
      { key: "amount", label: "Amount", type: "number", min: 0.5, max: 20, step: 0.5, default: 3 },
      { key: "seed", label: "Seed", type: "number", min: 0, max: 9999, step: 1, default: 42 },
    ],
  },
  {
    type: "edge-detect",
    label: "Edge Detect",
    description: "Sobel edge detection for outlines and contours",
    category: "effect",
    params: [
      { key: "threshold", label: "Threshold", type: "number", min: 0, max: 255, step: 5, default: 30 },
      { key: "invert", label: "Invert", type: "boolean", default: false },
    ],
  },
];

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "add", label: "Add" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft Light" },
];
