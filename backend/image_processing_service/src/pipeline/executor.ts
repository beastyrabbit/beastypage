import sharp from "sharp";
import type { PipelineStep, OutputFormat } from "../models.ts";
import { getAlgorithm } from "../algorithms/index.ts";
import { blendImages } from "./blender.ts";
import { ProcessingError } from "../utils/image.ts";

interface ExecutionResult {
  result: Buffer;
  stepsProcessed: number;
  width: number;
  height: number;
}

/**
 * Execute a pipeline of processing steps in order.
 * Each step can reference "original" or a previous step ID as its input source.
 * Optional blending with another step's output.
 */
export async function executePipeline(
  imageBuffer: Buffer,
  steps: PipelineStep[],
  outputFormat: OutputFormat,
  outputQuality: number,
): Promise<ExecutionResult> {
  // Normalize to PNG for consistent internal processing
  const original = await sharp(imageBuffer).ensureAlpha().png().toBuffer();
  const results = new Map<string, Buffer>();
  results.set("original", original);

  let lastResult = original;
  let stepsProcessed = 0;

  for (const step of steps) {
    if (!step.enabled) continue;

    // Resolve input source
    const inputKey = step.inputSource || "original";
    const input = results.get(inputKey);
    if (!input) {
      throw new ProcessingError(
        `Step "${step.id}" references unknown input "${inputKey}"`,
      );
    }

    // Execute algorithm
    const algorithmFn = getAlgorithm(step.algorithm);
    let output = await algorithmFn(input, step.params);

    // Apply blending if configured
    if (step.blendWith) {
      const blendSource = results.get(step.blendWith.stepId);
      if (!blendSource) {
        throw new ProcessingError(
          `Step "${step.id}" blend references unknown step "${step.blendWith.stepId}"`,
        );
      }

      // Ensure both images are the same dimensions
      const outMeta = await sharp(output).metadata();
      const blendMeta = await sharp(blendSource).metadata();

      let resizedBlendSource = blendSource;
      if (outMeta.width !== blendMeta.width || outMeta.height !== blendMeta.height) {
        resizedBlendSource = await sharp(blendSource)
          .resize(outMeta.width, outMeta.height, { fit: "fill" })
          .png()
          .toBuffer();
      }

      output = await blendImages(
        resizedBlendSource,
        output,
        step.blendWith.mode,
        step.blendWith.opacity,
      );
    }

    results.set(step.id, output);
    lastResult = output;
    stepsProcessed++;
  }

  // Convert to requested output format
  let finalSharp = sharp(lastResult);
  switch (outputFormat) {
    case "jpeg":
      finalSharp = finalSharp.jpeg({ quality: outputQuality });
      break;
    case "webp":
      finalSharp = finalSharp.webp({ quality: outputQuality });
      break;
    default:
      finalSharp = finalSharp.png();
  }

  const finalBuffer = await finalSharp.toBuffer();
  const meta = await sharp(finalBuffer).metadata();

  return {
    result: finalBuffer,
    stepsProcessed,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}
