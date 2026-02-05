"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { ImageUploader } from "@/components/color-palette/ImageUploader";
import { VariantBar } from "@/components/common/VariantBar";
import {
  loadImageFromFile,
  loadImageFromUrl,
  imageToDataUrl,
} from "@/lib/color-extraction/image-processing";
import { processImage } from "@/lib/pixelator/api";
import {
  OPERATIONS,
  type PipelineStep,
  type ProcessMode,
  type OperationType,
} from "@/lib/pixelator/types";
import { useVariants } from "@/utils/variants";
import {
  DEFAULT_PIXELATOR_SETTINGS,
  parsePixelatorPayload,
  pixelatorSettingsEqual,
  type PixelatorSettings,
} from "@/utils/pixelatorVariants";

import { OperationToolbox, ToolboxDragOverlay } from "./OperationToolbox";
import { PipelineBuilder } from "./PipelineBuilder";
import { PreviewCanvas } from "./PreviewCanvas";
import { PixelArtDetector } from "./PixelArtDetector";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface PixelatorState {
  imageDataUrl: string | null;
  resultDataUrl: string | null;
  steps: PipelineStep[];
  processing: boolean;
  error: string | null;
  pixelArtMode: boolean;
  pixelArtGridSize: number | null;
  lastDuration: number | null;
}

const INITIAL_STATE: PixelatorState = {
  imageDataUrl: null,
  resultDataUrl: null,
  steps: [],
  processing: false,
  error: null,
  pixelArtMode: false,
  pixelArtGridSize: null,
  lastDuration: null,
};

// ---------------------------------------------------------------------------
// Clipboard helper
// ---------------------------------------------------------------------------

async function copyText(text: string, successMessage: string) {
  await navigator.clipboard.writeText(text);
  toast.success(successMessage);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PixelatorClient() {
  const [state, setState] = useState<PixelatorState>(INITIAL_STATE);
  const [draggedOp, setDraggedOp] = useState<OperationType | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- Variant system ----
  const variants = useVariants<PixelatorSettings>({
    storageKey: "pixelator-variants",
  });

  const snapshotConfig = useMemo<PixelatorSettings>(
    () => ({
      v: 1,
      pipeline: { steps: state.steps },
      pixelArtMode: state.pixelArtMode,
      pixelArtGridSize: state.pixelArtGridSize,
    }),
    [state.steps, state.pixelArtMode, state.pixelArtGridSize],
  );

  const applyConfig = useCallback((settings: PixelatorSettings) => {
    setState((prev) => ({
      ...prev,
      steps: settings.pipeline.steps,
      pixelArtMode: settings.pixelArtMode,
      pixelArtGridSize: settings.pixelArtGridSize,
      resultDataUrl: null,
    }));
  }, []);

  const isDirty = useMemo(() => {
    if (!variants.activeVariant) return false;
    return !pixelatorSettingsEqual(snapshotConfig, variants.activeVariant.settings);
  }, [snapshotConfig, variants.activeVariant]);

  // ---- Image loading ----
  const handleImageLoad = useCallback(async (source: File | string) => {
    try {
      const img =
        source instanceof File
          ? await loadImageFromFile(source)
          : await loadImageFromUrl(source);

      const dataUrl = imageToDataUrl(img, 4000);

      setState((prev) => ({
        ...prev,
        imageDataUrl: dataUrl,
        resultDataUrl: null,
        error: null,
        lastDuration: null,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load image";
      toast.error(msg);
    }
  }, []);

  // ---- Pipeline management ----
  const addStep = useCallback((algorithm: OperationType) => {
    const def = OPERATIONS.find((o) => o.type === algorithm);
    if (!def) return;

    const params: Record<string, unknown> = {};
    for (const p of def.params) {
      params[p.key] = p.default;
    }

    const step: PipelineStep = {
      id: crypto.randomUUID(),
      algorithm,
      params,
      inputSource: "original",
      blendWith: null,
      enabled: true,
      label: def.label,
    };

    setState((prev) => {
      const steps = [...prev.steps, step];
      if (steps.length > 1) {
        step.inputSource = steps[steps.length - 2]!.id;
      }
      return { ...prev, steps };
    });
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<PipelineStep>) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  }, []);

  const removeStep = useCallback((id: string) => {
    setState((prev) => {
      const filtered = prev.steps.filter((s) => s.id !== id);
      return {
        ...prev,
        steps: filtered.map((s) => ({
          ...s,
          inputSource:
            s.inputSource !== "original" && !filtered.some((f) => f.id === s.inputSource)
              ? "original"
              : s.inputSource,
          blendWith:
            s.blendWith && !filtered.some((f) => f.id === s.blendWith?.stepId)
              ? null
              : s.blendWith,
        })),
      };
    });
  }, []);

  const reorderSteps = useCallback((steps: PipelineStep[]) => {
    setState((prev) => ({ ...prev, steps }));
  }, []);

  // ---- Processing ----
  const handleProcess = useCallback(
    async (mode: ProcessMode) => {
      if (!state.imageDataUrl || state.steps.length === 0) return;

      const enabledSteps = state.steps.filter((s) => s.enabled);
      if (enabledSteps.length === 0) {
        toast.error("No enabled steps in pipeline");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, processing: true, error: null }));

      try {
        const res = await processImage(
          state.imageDataUrl,
          { steps: enabledSteps },
          mode,
        );

        if (controller.signal.aborted) return;

        setState((prev) => ({
          ...prev,
          resultDataUrl: res.image,
          processing: false,
          lastDuration: res.meta.duration_ms,
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Processing failed";
        setState((prev) => ({ ...prev, processing: false, error: msg }));
        toast.error(msg);
      }
    },
    [state.imageDataUrl, state.steps],
  );

  // ---- Pixel art detection ----
  const handleGridDetected = useCallback((gridSize: number | null) => {
    setState((prev) => ({
      ...prev,
      pixelArtGridSize: gridSize,
      pixelArtMode: gridSize !== null,
    }));
  }, []);

  // ---- Export ----
  const handleExport = useCallback(() => {
    const dataUrl = state.resultDataUrl ?? state.imageDataUrl;
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.download = "pixelator-result.png";
    link.href = dataUrl;
    link.click();
  }, [state.resultDataUrl, state.imageDataUrl]);

  // ---- DnD handlers ----
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const type = event.active.data.current?.operationType as OperationType | undefined;
    if (type) setDraggedOp(type);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedOp(null);
      const { active, over } = event;

      if (!over) return;

      const opType = active.data.current?.operationType as OperationType | undefined;
      if (opType && over.id === "pipeline-droppable") {
        addStep(opType);
      }
    },
    [addStep],
  );

  // ---- Render ----
  return (
    <>
      <VariantBar
        variants={variants}
        snapshotConfig={snapshotConfig}
        applyConfig={applyConfig}
        isDirty={isDirty}
        showToast={(msg) => toast(msg)}
        copyText={copyText}
        apiPath="/api/pixelator-settings"
        parsePayload={parsePixelatorPayload}
      />

      {!state.imageDataUrl ? (
        <ImageUploader
          onImageLoad={handleImageLoad}
          isLoading={false}
          error={state.error}
        />
      ) : (
        <DndContext
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-6">
            {/* Preview area */}
            <PreviewCanvas
              originalUrl={state.imageDataUrl}
              resultUrl={state.resultDataUrl}
              processing={state.processing}
              lastDuration={state.lastDuration}
              onChangeImage={() =>
                setState((prev) => ({
                  ...prev,
                  imageDataUrl: null,
                  resultDataUrl: null,
                  lastDuration: null,
                }))
              }
            />

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleProcess("preview")}
                disabled={state.processing || state.steps.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-primary/30 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {state.processing ? "Processing..." : "Process Preview"}
              </button>
              <button
                onClick={() => handleProcess("full")}
                disabled={state.processing || state.steps.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-amber-600/30 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                Process Full Image
              </button>
              {state.resultDataUrl && (
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/30"
                >
                  Export PNG
                </button>
              )}
            </div>

            {/* Pixel art detector */}
            <PixelArtDetector
              imageDataUrl={state.imageDataUrl}
              onGridDetected={handleGridDetected}
              pixelArtMode={state.pixelArtMode}
              gridSize={state.pixelArtGridSize}
              onToggle={(enabled) =>
                setState((prev) => ({ ...prev, pixelArtMode: enabled }))
              }
              onGridSizeChange={(size) =>
                setState((prev) => ({ ...prev, pixelArtGridSize: size }))
              }
            />

            {/* Pipeline builder */}
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <OperationToolbox />
              <PipelineBuilder
                steps={state.steps}
                onUpdateStep={updateStep}
                onRemoveStep={removeStep}
                onReorderSteps={reorderSteps}
              />
            </div>
          </div>

          <DragOverlay>
            {draggedOp ? <ToolboxDragOverlay operationType={draggedOp} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </>
  );
}
