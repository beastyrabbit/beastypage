"use client";

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { PipelineStep } from "@/lib/pixelator/types";
import { PipelineStepCard } from "./PipelineStepCard";

interface PipelineBuilderProps {
  steps: PipelineStep[];
  onUpdateStep: (id: string, updates: Partial<PipelineStep>) => void;
  onRemoveStep: (id: string) => void;
  onReorderSteps: (steps: PipelineStep[]) => void;
}

export function PipelineBuilder({
  steps,
  onUpdateStep,
  onRemoveStep,
  onReorderSteps,
}: PipelineBuilderProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "pipeline-droppable" });

  return (
    <div
      ref={setNodeRef}
      className={`glass-card flex min-h-[200px] flex-col gap-3 p-4 transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Pipeline
      </h3>

      {steps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border/50 p-8">
          <p className="text-center text-sm text-muted-foreground">
            Drag operations here to build your pipeline
          </p>
        </div>
      ) : (
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <PipelineStepCard
                key={step.id}
                step={step}
                index={index}
                allSteps={steps}
                onUpdate={onUpdateStep}
                onRemove={onRemoveStep}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
