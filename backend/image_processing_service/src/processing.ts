import type { ProcessRequest } from "./models.ts";
import { config } from "./config.ts";
import { executePipeline } from "./pipeline/executor.ts";
import { detectGrid } from "./detection/grid-detector.ts";
import { parseDataUrl, bufferToDataUrl, validateDimensions, downscaleForPreview, ProcessingError } from "./utils/image.ts";

export function validateWork(pixels: number, steps: ProcessRequest["pipeline"]["steps"]) {
  const cost = steps.filter(s => s.enabled).reduce((sum, step) => sum +
    (step.algorithm.startsWith("dither-") || step.algorithm === "quantize" ? 4 : 1) + (step.blendWith ? 1 : 0), 0);
  if (pixels * Math.max(1, cost) > config.maxPixelWork) throw new ProcessingError("Pipeline exceeds the pixel-work budget. Use preview mode or fewer steps.");
}

export async function processJob(kind: "process" | "detect", req: ProcessRequest | { image: string }) {
  const start = performance.now();
  let { buffer } = parseDataUrl(req.image);
  let { width, height } = await validateDimensions(buffer);
  if (kind === "detect") return detectGrid(buffer);
  const input = req as ProcessRequest;
  if (input.mode === "preview") ({ buffer, width, height } = await downscaleForPreview(buffer, config.previewMaxDimension));
  validateWork(width * height, input.pipeline.steps);
  const result = await executePipeline(buffer, input.pipeline.steps, input.outputFormat, input.outputQuality);
  return { image: bufferToDataUrl(result.result, input.outputFormat), meta: {
    duration_ms: Math.round(performance.now() - start), width: result.width, height: result.height, steps_processed: result.stepsProcessed,
  } };
}
