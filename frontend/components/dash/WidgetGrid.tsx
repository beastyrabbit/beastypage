"use client";

import { Plus } from "lucide-react";
import type { ToolWidgetMeta } from "@/lib/dash/types";
import { WidgetCard } from "./WidgetCard";

interface WidgetGridProps {
  widgets: ToolWidgetMeta[];
  editing: boolean;
  onAddClick: () => void;
  onRemove: (id: string) => void;
}

export function WidgetGrid({ widgets, editing, onAddClick, onRemove }: WidgetGridProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {widgets.map((tool, i) => (
        <WidgetCard
          key={tool.id}
          tool={tool}
          editing={editing}
          onRemove={() => onRemove(tool.id)}
          index={i}
        />
      ))}

      {editing && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] text-muted-foreground transition-all duration-300 hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:text-emerald-300 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards"
          style={{ animationDelay: `${widgets.length * 50}ms` }}
        >
          <Plus className="size-6" />
          <span className="text-xs font-medium">Add Tool</span>
        </button>
      )}
    </section>
  );
}
