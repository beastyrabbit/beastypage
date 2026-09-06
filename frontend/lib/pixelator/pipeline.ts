import type { PipelineStep } from "./types";

/** Invalid inputs use the original; invalid blend links are cleared. */
export function repairPipeline(steps: PipelineStep[]): PipelineStep[] {
  const available = new Set(["original"]);
  return steps.map((step) => {
    const repaired = {
      ...step,
      inputSource: available.has(step.inputSource)
        ? step.inputSource
        : "original",
      blendWith:
        step.blendWith && available.has(step.blendWith.stepId)
          ? step.blendWith
          : null,
    };
    if (step.enabled) available.add(step.id);
    return repaired;
  });
}
