"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronDown, ChevronRight, X } from "lucide-react";
import {
  OPERATIONS,
  BLEND_MODES,
  type PipelineStep,
  type BlendMode,
} from "@/lib/pixelator/types";

interface PipelineStepCardProps {
  step: PipelineStep;
  index: number;
  allSteps: PipelineStep[];
  onUpdate: (id: string, updates: Partial<PipelineStep>) => void;
  onRemove: (id: string) => void;
}

export function PipelineStepCard({
  step,
  index,
  allSteps,
  onUpdate,
  onRemove,
}: PipelineStepCardProps) {
  const [expanded, setExpanded] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const def = OPERATIONS.find((o) => o.type === step.algorithm);
  const previousSteps = allSteps.slice(0, index);

  // Input source options
  const inputOptions = [
    { value: "original", label: "Original" },
    ...previousSteps.map((s, i) => ({
      value: s.id,
      label: `Step ${i + 1}: ${s.label}`,
    })),
  ];

  // Blend source options (same as input but excludes current step)
  const blendSourceOptions = [
    { value: "original", label: "Original" },
    ...previousSteps.map((s, i) => ({
      value: s.id,
      label: `Step ${i + 1}: ${s.label}`,
    })),
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card overflow-hidden transition-all ${
        isDragging ? "opacity-50 shadow-2xl" : ""
      } ${!step.enabled ? "opacity-60" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <span className="text-xs font-bold text-muted-foreground">
          {index + 1}
        </span>

        <span className="flex-1 text-sm font-semibold text-foreground">
          {step.label}
        </span>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={step.enabled}
            onChange={(e) => onUpdate(step.id, { enabled: e.target.checked })}
            className="accent-primary"
          />
          On
        </label>

        <button
          onClick={() => onRemove(step.id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove step"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border/50 px-3 pb-3 pt-3">
          {/* Input source */}
          <div className="flex items-center gap-2">
            <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
              Input
            </label>
            <select
              value={step.inputSource}
              onChange={(e) => onUpdate(step.id, { inputSource: e.target.value })}
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {inputOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Algorithm params */}
          {def?.params.map((param) => (
            <div key={param.key} className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                {param.label}
              </label>
              {param.type === "number" ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={Number(step.params[param.key] ?? param.default)}
                    onChange={(e) =>
                      onUpdate(step.id, {
                        params: {
                          ...step.params,
                          [param.key]: Number(e.target.value),
                        },
                      })
                    }
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {Number(step.params[param.key] ?? param.default)}
                  </span>
                </div>
              ) : (
                <input
                  type="checkbox"
                  checked={Boolean(step.params[param.key] ?? param.default)}
                  onChange={(e) =>
                    onUpdate(step.id, {
                      params: {
                        ...step.params,
                        [param.key]: e.target.checked,
                      },
                    })
                  }
                  className="accent-primary"
                />
              )}
            </div>
          ))}

          {/* Blend settings */}
          <div className="flex flex-col gap-2 border-t border-border/30 pt-2">
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                Blend
              </label>
              <select
                value={step.blendWith ? "enabled" : "none"}
                onChange={(e) => {
                  if (e.target.value === "none") {
                    onUpdate(step.id, { blendWith: null });
                  } else {
                    onUpdate(step.id, {
                      blendWith: {
                        stepId: previousSteps[0]?.id ?? "original",
                        mode: "normal",
                        opacity: 0.5,
                      },
                    });
                  }
                }}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="none">None</option>
                <option value="enabled">Blend with...</option>
              </select>
            </div>

            {step.blendWith && (
              <>
                <div className="flex items-center gap-2">
                  <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                    Source
                  </label>
                  <select
                    value={step.blendWith.stepId}
                    onChange={(e) =>
                      onUpdate(step.id, {
                        blendWith: { ...step.blendWith!, stepId: e.target.value },
                      })
                    }
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                  >
                    {blendSourceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                    Mode
                  </label>
                  <select
                    value={step.blendWith.mode}
                    onChange={(e) =>
                      onUpdate(step.id, {
                        blendWith: {
                          ...step.blendWith!,
                          mode: e.target.value as BlendMode,
                        },
                      })
                    }
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                  >
                    {BLEND_MODES.map((bm) => (
                      <option key={bm.value} value={bm.value}>
                        {bm.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                    Opacity
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={step.blendWith.opacity}
                    onChange={(e) =>
                      onUpdate(step.id, {
                        blendWith: {
                          ...step.blendWith!,
                          opacity: Number(e.target.value),
                        },
                      })
                    }
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(step.blendWith.opacity * 100)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
