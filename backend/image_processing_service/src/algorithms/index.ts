import type { OperationType } from "../models.ts";
import { blockAverage } from "./block-average.ts";
import { nearestNeighbor } from "./nearest-neighbor.ts";
import { ditherBayer } from "./dither-bayer.ts";
import { ditherFloydSteinberg } from "./dither-floyd-steinberg.ts";
import { ditherAtkinson } from "./dither-atkinson.ts";
import { quantize } from "./quantize.ts";
import { jitter } from "./jitter.ts";
import { edgeDetect } from "./edge-detect.ts";

export type AlgorithmFn = (buffer: Buffer, params: Record<string, unknown>) => Promise<Buffer>;

const registry: Record<OperationType, AlgorithmFn> = {
  "block-average": blockAverage,
  "nearest-neighbor": nearestNeighbor,
  "dither-bayer": ditherBayer,
  "dither-floyd-steinberg": ditherFloydSteinberg,
  "dither-atkinson": ditherAtkinson,
  quantize: quantize,
  jitter: jitter,
  "edge-detect": edgeDetect,
};

export function getAlgorithm(name: OperationType): AlgorithmFn {
  const fn = registry[name];
  if (!fn) throw new Error(`Unknown algorithm: ${name}`);
  return fn;
}
