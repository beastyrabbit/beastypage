"use client";

import { useDraggable } from "@dnd-kit/core";
import { OPERATIONS, type OperationType } from "@/lib/pixelator/types";

const CATEGORY_LABELS: Record<string, string> = {
  pixelate: "Pixelate",
  dither: "Dither",
  color: "Color",
  effect: "Effect",
};

const CATEGORY_ORDER = ["pixelate", "dither", "color", "effect"];

// ---------------------------------------------------------------------------
// Draggable tile
// ---------------------------------------------------------------------------

function OperationTile({ type, label }: { type: OperationType; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbox-${type}`,
    data: { operationType: type },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-border bg-card/60 px-3 py-2 text-sm font-medium text-foreground transition-all hover:border-primary/40 hover:bg-card active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag overlay (shown while dragging)
// ---------------------------------------------------------------------------

export function ToolboxDragOverlay({ operationType }: { operationType: OperationType }) {
  const def = OPERATIONS.find((o) => o.type === operationType);
  if (!def) return null;

  return (
    <div className="rounded-lg border border-primary/50 bg-card px-3 py-2 text-sm font-medium text-foreground shadow-lg shadow-primary/20">
      {def.label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbox panel
// ---------------------------------------------------------------------------

export function OperationToolbox() {
  const grouped = new Map<string, typeof OPERATIONS>();
  for (const op of OPERATIONS) {
    const list = grouped.get(op.category) ?? [];
    list.push(op);
    grouped.set(op.category, list);
  }

  return (
    <div className="glass-card flex flex-col gap-4 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Operations
      </h3>

      {CATEGORY_ORDER.map((cat) => {
        const ops = grouped.get(cat);
        if (!ops?.length) return null;
        return (
          <div key={cat} className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {CATEGORY_LABELS[cat] ?? cat}
            </span>
            {ops.map((op) => (
              <OperationTile key={op.type} type={op.type} label={op.label} />
            ))}
          </div>
        );
      })}

      <p className="mt-auto text-xs text-muted-foreground">
        Drag an operation to the pipeline to add it.
      </p>
    </div>
  );
}
