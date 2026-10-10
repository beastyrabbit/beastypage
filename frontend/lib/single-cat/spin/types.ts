import type { CatParams } from "@/lib/cat-v3/types";

export interface VariationOption {
  raw: unknown;
  display: string;
}

/** A spin frame at the renderer's native tile size; draw sites scale it up. */
export interface VariationFrame {
  option: VariationOption;
  canvas: HTMLCanvasElement;
}

export interface VariantDescriptor {
  id: string;
  option: VariationOption;
  params: Partial<CatParams>;
  label?: string;
  group?: string;
}

export interface SpinFrameLoader {
  /**
   * Frames in descriptor order. Identical params (stable-key match) reuse
   * frames that are already loaded or in flight, so a prefetched spin never
   * renders twice. Large requests are split across parallel batch calls.
   */
  frames(
    baseParams: Partial<CatParams>,
    descriptors: VariantDescriptor[],
  ): Promise<VariationFrame[]>;
  /** Queue frames without waiting; used to preload a whole spin. */
  prefetch(
    baseParams: Partial<CatParams>,
    descriptors: VariantDescriptor[],
  ): void;
  /** One render, memoized by params; goes through the same batch queue. */
  single(params: Partial<CatParams>): Promise<HTMLCanvasElement>;
  prefetchSingle(params: Partial<CatParams>): void;
  /** Stop issuing queued requests and drop cached frames. */
  dispose(): void;
}
