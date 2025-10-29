"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import { cloneParams, ensureSpriteDataLoaded } from "@/lib/streamer/steps";
import type { StreamerParams, StreamStep } from "@/lib/streamer/steps";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { decodeImageFromDataUrl } from "@/lib/cat-v3/api";

type StepOption = ReturnType<StreamStep["getOptions"]>[number];

type OptionPreviewProps = {
  generator: CatGeneratorApi | null;
  ready: boolean;
  baseParams: StreamerParams;
  step: StreamStep | null;
  option: StepOption;
  allOptions?: StepOption[];
  chunkSize?: number;
  size?: number;
};
const OPTION_PREVIEW_CACHE = new Map<string, string | null>();
const CHUNK_PROMISE_CACHE = new Map<string, Promise<Map<string, string | null>>>();

function buildOptionCacheKey(stepId: string | undefined, optionKey: string, baseSignature: string, size: number) {
  return `${stepId ?? "unknown"}|${optionKey}|${size}|${baseSignature}`;
}

function buildChunkCacheKey(
  stepId: string | undefined,
  baseSignature: string,
  size: number,
  chunkOptionKeys: string[],
  chunkSize: number
) {
  return `${stepId ?? "unknown"}|chunk|${size}|${chunkSize}|${baseSignature}|${chunkOptionKeys.join(",")}`;
}

function stripInternalFields(params: StreamerParams): Record<string, unknown> {
  const clone = cloneParams(params) as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (key.startsWith("_")) {
      delete clone[key];
    }
  }
  return clone;
}

async function renderChunkPreviews(
  generator: CatGeneratorApi,
  baseParams: StreamerParams,
  step: StreamStep,
  options: StepOption[],
  size: number
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  if (options.length === 0) {
    return result;
  }

  const sanitizedBase = stripInternalFields(baseParams);
  const descriptors = options.map((opt) => {
    const variantParams = cloneParams(baseParams);
    const state: { params: StreamerParams; history: unknown[]; [key: string]: unknown } = {
      params: variantParams,
      history: [] as unknown[],
    };
    step.apply(opt, state);
    return {
      key: opt.key,
      params: stripInternalFields(state.params as StreamerParams),
    };
  });

  try {
    if (typeof generator.generateVariantSheet === "function") {
      const sheet = await generator.generateVariantSheet(
        sanitizedBase,
        descriptors.map((descriptor) => ({
          id: descriptor.key,
          params: descriptor.params,
        })),
        {
          includeSources: false,
          includeBase: false,
          frameMode: "composed",
          priority: "auto",
        }
      );

      if (sheet.frames.length > 0) {
        const sheetCanvas = await decodeImageFromDataUrl(sheet.sheetDataUrl);
        const frameMap = new Map(sheet.frames.map((frame) => [frame.id, frame]));

        for (const descriptor of descriptors) {
          const frame = frameMap.get(descriptor.key);
          if (!frame) {
            result.set(descriptor.key, null);
            continue;
          }
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            result.set(descriptor.key, null);
            continue;
          }
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(sheetCanvas, frame.x, frame.y, frame.width, frame.height, 0, 0, size, size);
          result.set(descriptor.key, canvas.toDataURL("image/png"));
        }

        return result;
      }
    }
  } catch (error) {
    console.warn("Variant sheet preview failed, falling back to per-option renders", error);
  }

  // Fallback: render each option individually.
  for (const descriptor of descriptors) {
    try {
      const preview = await generator.generateCat({
        ...descriptor.params,
        spriteNumber: sanitizedBase.spriteNumber ?? baseParams.spriteNumber,
      });
      result.set(descriptor.key, preview.imageDataUrl ?? null);
    } catch (error) {
      console.error("Failed fallback preview render", error);
      result.set(descriptor.key, null);
    }
  }

  return result;
}

export function OptionPreview({
  generator,
  ready,
  baseParams,
  step,
  option,
  allOptions,
  chunkSize = 12,
  size = 96,
}: OptionPreviewProps) {
  const [src, setSrc] = useState<string | null>(() => null);
  const [loading, setLoading] = useState<boolean>(true);
  const requestRef = useRef(0);

  const baseSignature = useMemo(() => {
    try {
      return JSON.stringify(baseParams);
    } catch (error) {
      console.warn("Unable to serialize base params for preview cache", error);
      return "invalid-base-params";
    }
  }, [baseParams]);

  const optionsSource = useMemo(() => {
    if (Array.isArray(allOptions) && allOptions.length > 0) {
      return allOptions;
    }
    return [option];
  }, [allOptions, option]);

  const chunkDescriptor = useMemo(() => {
    const index = optionsSource.findIndex((item) => item.key === option.key);
    const effectiveChunkSize = Math.max(1, chunkSize);
    const chunkStart = index >= 0 ? Math.floor(index / effectiveChunkSize) * effectiveChunkSize : 0;
    const slice = optionsSource.slice(chunkStart, chunkStart + effectiveChunkSize);
    const includesOption = slice.some((item) => item.key === option.key);
    if (!includesOption) {
      slice.push(option);
    }
    const keys = slice.map((item) => item.key);
    return {
      options: slice,
      keys,
      chunkSize: effectiveChunkSize,
      chunkStart,
    };
  }, [optionsSource, option, chunkSize]);

  const optionCacheKey = useMemo(() => {
    if (!step) return null;
    return buildOptionCacheKey(step.id, option.key, baseSignature, size);
  }, [step, option.key, baseSignature, size]);

  const chunkCacheKey = useMemo(() => {
    if (!step) return null;
    return buildChunkCacheKey(step.id, baseSignature, size, chunkDescriptor.keys, chunkDescriptor.chunkSize);
  }, [step, baseSignature, size, chunkDescriptor]);

  useEffect(() => {
    (async () => {
      try {
        await ensureSpriteDataLoaded();
      } catch {
        // ignore, generator call will surface issues
      }
    })();
  }, []);

  useEffect(() => {
    if (!step || !generator || !ready || !optionCacheKey || !chunkCacheKey) {
      const timer = window.setTimeout(() => {
        setSrc(null);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (OPTION_PREVIEW_CACHE.has(optionCacheKey)) {
      const timer = window.setTimeout(() => {
        setSrc(OPTION_PREVIEW_CACHE.get(optionCacheKey) ?? null);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const startTimer = window.setTimeout(() => setLoading(true), 0);
    const requestId = ++requestRef.current;

    let chunkPromise = CHUNK_PROMISE_CACHE.get(chunkCacheKey);
    if (!chunkPromise) {
      chunkPromise = renderChunkPreviews(generator, baseParams, step, chunkDescriptor.options, size)
        .then((map) => {
          for (const [key, value] of map) {
            const optionKeyForCache = buildOptionCacheKey(step.id, key, baseSignature, size);
            OPTION_PREVIEW_CACHE.set(optionKeyForCache, value ?? null);
          }
          return map;
        })
        .finally(() => {
          CHUNK_PROMISE_CACHE.delete(chunkCacheKey);
        });
      CHUNK_PROMISE_CACHE.set(chunkCacheKey, chunkPromise);
    }

    chunkPromise
      .then((map) => {
        if (requestRef.current !== requestId) return;
        if (!OPTION_PREVIEW_CACHE.has(optionCacheKey)) {
          OPTION_PREVIEW_CACHE.set(optionCacheKey, map.get(option.key) ?? null);
        }
        setSrc(map.get(option.key) ?? OPTION_PREVIEW_CACHE.get(optionCacheKey) ?? null);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load chunked option previews", error);
        OPTION_PREVIEW_CACHE.set(optionCacheKey, null);
        if (requestRef.current === requestId) {
          setSrc(null);
          setLoading(false);
        }
      });

    return () => {
      window.clearTimeout(startTimer);
      requestRef.current += 1;
    };
  }, [
    generator,
    ready,
    baseParams,
    baseSignature,
    step,
    option,
    optionCacheKey,
    chunkCacheKey,
    chunkDescriptor,
    size,
  ]);

  const dimension = size;
  const wrapperStyle = { width: `${dimension}px`, height: `${dimension}px` } as const;

  if (loading) {
    return (
      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-background/60"
        style={wrapperStyle}
      >
        <div className="h-8 w-8 animate-pulse rounded-full bg-border/60" />
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-background/60 text-[10px] text-muted-foreground"
        style={wrapperStyle}
      >
        No preview
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border/50 bg-background/80"
      style={wrapperStyle}
    >
      <Image
        src={src}
        alt={`${option.label} preview`}
        fill
        sizes={`${dimension}px`}
        className="object-contain"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
    </div>
  );
}

export default OptionPreview;
