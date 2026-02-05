import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const OperationType = z
  .enum([
    "block-average",
    "nearest-neighbor",
    "dither-bayer",
    "dither-floyd-steinberg",
    "dither-atkinson",
    "quantize",
    "jitter",
    "edge-detect",
  ])
  .describe("Pixel-art processing algorithm");
export type OperationType = z.infer<typeof OperationType>;

export const BlendMode = z
  .enum([
    "normal",
    "multiply",
    "add",
    "screen",
    "overlay",
    "soft-light",
  ])
  .describe("Layer blending mode");
export type BlendMode = z.infer<typeof BlendMode>;

export const OutputFormat = z.enum(["png", "jpeg", "webp"]).describe("Output image format");
export type OutputFormat = z.infer<typeof OutputFormat>;

export const ProcessMode = z.enum(["preview", "full"]).describe("Processing mode — preview downscales before processing");
export type ProcessMode = z.infer<typeof ProcessMode>;

// ---------------------------------------------------------------------------
// Pipeline step
// ---------------------------------------------------------------------------

export const BlendWith = z.object({
  stepId: z.string(),
  mode: BlendMode,
  opacity: z.number().min(0).max(1),
});

export const PipelineStep = z.object({
  id: z.string(),
  algorithm: OperationType,
  params: z.record(z.string(), z.unknown()),
  inputSource: z.string(),
  blendWith: BlendWith.nullable().optional(),
  enabled: z.boolean().optional().default(true),
  label: z.string().optional().default(""),
});
export type PipelineStep = z.infer<typeof PipelineStep>;

export const Pipeline = z.object({
  steps: z.array(PipelineStep).min(1).max(20),
});

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export const ProcessRequest = z
  .object({
    image: z.string().startsWith("data:image/").describe("Base64 data-URL of the source image"),
    pipeline: Pipeline,
    mode: ProcessMode,
    outputFormat: OutputFormat.optional().default("png"),
    outputQuality: z.number().int().min(1).max(100).optional().default(90).describe("JPEG/WebP quality (1-100)"),
  })
  .describe("Image processing request");
export type ProcessRequest = z.infer<typeof ProcessRequest>;

export const ProcessResponse = z.object({
  image: z.string(),
  meta: z.object({
    duration_ms: z.number(),
    width: z.number(),
    height: z.number(),
    steps_processed: z.number(),
  }),
});

export const DetectGridRequest = z
  .object({
    image: z.string().startsWith("data:image/").describe("Base64 data-URL of the image to analyze"),
  })
  .describe("Grid detection request");
export type DetectGridRequest = z.infer<typeof DetectGridRequest>;

export const DetectGridResponse = z.object({
  detected: z.boolean(),
  gridSize: z.number().nullable(),
  confidence: z.number(),
});

export const HealthResponse = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  version: z.string(),
  memory: z.object({ used: z.number() }),
});
