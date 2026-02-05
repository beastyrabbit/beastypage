"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
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
  processMode: ProcessMode;
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
  processMode: "preview",
};

const AUTO_PROCESS_DELAY = 600;

// ---------------------------------------------------------------------------
// Clipboard helper
// ---------------------------------------------------------------------------

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Failed to copy to clipboard");
  }
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
    async (mode: ProcessMode, image: string, steps: PipelineStep[]) => {
      const enabledSteps = steps.filter((s) => s.enabled);
      if (!image || enabledSteps.length === 0) return;

      // Fix inputSource refs that point to disabled/missing steps
      const enabledIds = new Set(enabledSteps.map((s) => s.id));
      const sanitizedSteps = enabledSteps.map((s, i) => {
        if (s.inputSource !== "original" && !enabledIds.has(s.inputSource)) {
          // Fall back to previous enabled step or "original"
          const prev = i > 0 ? enabledSteps[i - 1]! : null;
          return { ...s, inputSource: prev?.id ?? "original" };
        }
        return s;
      });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, processing: true, error: null }));

      try {
        const res = await processImage(image, { steps: sanitizedSteps }, mode);

        if (controller.signal.aborted) return;

        setState((prev) => ({
          ...prev,
          resultDataUrl: res.image,
          processing: false,
          lastDuration: res.meta.duration_ms,
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Processing failed:", err);
        const msg = err instanceof Error ? err.message : "Processing failed";
        setState((prev) => ({ ...prev, processing: false, error: msg }));
        toast.error(msg);
      }
    },
    [],
  );

  // ---- Auto-process on pipeline changes ----
  const stepsFingerprint = useMemo(
    () => JSON.stringify(state.steps),
    [state.steps],
  );

  useEffect(() => {
    if (!state.imageDataUrl || state.steps.length === 0) return;
    const enabledSteps = state.steps.filter((s) => s.enabled);
    if (enabledSteps.length === 0) return;

    const timer = setTimeout(() => {
      handleProcess(state.processMode, state.imageDataUrl!, state.steps);
    }, AUTO_PROCESS_DELAY);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsFingerprint, state.imageDataUrl, state.processMode, handleProcess]);

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

      // Dropping from toolbox — add step regardless of which pipeline element caught the drop
      const opType = active.data.current?.operationType as OperationType | undefined;
      if (opType) {
        addStep(opType);
        return;
      }

      // Reordering within pipeline
      if (active.id !== over.id) {
        setState((prev) => {
          const oldIndex = prev.steps.findIndex((s) => s.id === active.id);
          const newIndex = prev.steps.findIndex((s) => s.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return prev;
          return { ...prev, steps: arrayMove(prev.steps, oldIndex, newIndex) };
        });
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
              showGrid={state.pixelArtMode}
              gridSize={state.pixelArtGridSize}
            />

            {/* Mode toggle + actions */}
            <div className="flex flex-wrap items-center gap-3">
              <ModeToggle
                current={state.processMode}
                onChange={(mode) =>
                  setState((prev) => ({ ...prev, processMode: mode }))
                }
              />

              {state.processing && (
                <span className="text-sm text-muted-foreground animate-pulse">
                  Processing...
                </span>
              )}

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

// ---------------------------------------------------------------------------
// Mode toggle — switches between "preview" and "full" processing
// ---------------------------------------------------------------------------

interface ModeToggleProps {
  current: ProcessMode;
  onChange: (mode: ProcessMode) => void;
}

const MODE_OPTIONS: Array<{
  mode: ProcessMode;
  label: string;
  activeClass: string;
}> = [
  { mode: "preview", label: "Preview", activeClass: "bg-primary text-primary-foreground shadow-sm" },
  { mode: "full", label: "Full Image", activeClass: "bg-amber-600 text-white shadow-sm" },
];

function ModeToggle({ current, onChange }: ModeToggleProps): React.ReactNode {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {MODE_OPTIONS.map(({ mode, label, activeClass }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-all ${
            current === mode ? activeClass : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
