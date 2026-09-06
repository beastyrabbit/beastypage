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
  const enabled = steps.filter(step => step.enabled);
  const remaining = new Map<string, number>();
  const seen = new Set(["original"]);
  for (const step of enabled) {
    if (!step.id || seen.has(step.id)) throw new ProcessingError("Step IDs must be unique and cannot be original");
    for (const key of [step.inputSource || "original", ...(step.blendWith ? [step.blendWith.stepId] : [])]) {
      if (!seen.has(key)) throw new ProcessingError(`Step ${step.id} must reference an earlier enabled step`);
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    seen.add(step.id);
  }

  let lastResult: Buffer = original;
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

      if (!outMeta.width || !outMeta.height || !blendMeta.width || !blendMeta.height) {
        throw new ProcessingError(
          `Step "${step.id}" blend: unable to read dimensions from output or blend source`,
        );
      }

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
    for (const key of [inputKey, ...(step.blendWith ? [step.blendWith.stepId] : [])]) {
      const left = (remaining.get(key) ?? 1) - 1;
      remaining.set(key, left);
      if (left === 0) results.delete(key);
    }
    if (!remaining.has(step.id)) results.delete(step.id);
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

  const { data: finalBuffer, info: finalInfo } = await finalSharp.toBuffer({ resolveWithObject: true });

  return {
    result: finalBuffer,
    stepsProcessed,
    width: finalInfo.width,
    height: finalInfo.height,
  };
}
