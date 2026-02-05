"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolWidgetMeta } from "@/lib/dash/types";

interface WidgetCardProps {
  tool: ToolWidgetMeta;
  editing: boolean;
  onRemove: () => void;
  index: number;
}

export function WidgetCard({ tool, editing, onRemove, index }: WidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tool.id, disabled: !editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${index * 50}ms`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass-card relative flex h-full flex-col gap-3 p-5 transition-all duration-500 overflow-hidden group hover:-translate-y-1 hover:shadow-2xl hover:border-emerald-400/30 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards",
        isDragging && "opacity-50 z-50 shadow-2xl scale-105",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

      {editing && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/5 p-1 text-muted-foreground cursor-grab active:cursor-grabbing transition-all hover:bg-white/10 hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="rounded-full border border-red-500/40 bg-red-500/10 p-1 text-red-400 transition-all hover:bg-red-500/20"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <div className="text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        {tool.icon}
      </div>

      <div className="relative z-10">
        <h3 className="text-lg font-bold text-foreground group-hover:text-gradient-dash transition-colors">
          {tool.title}
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors">
          {tool.description}
        </p>
      </div>

      {!editing && (
        <>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-400 transition-transform group-hover:translate-x-2 pt-2">
            Open <ArrowRight className="size-3" />
          </span>
          <Link href={tool.href} className="absolute inset-0 z-20" aria-label={`Open ${tool.title}`} />
        </>
      )}
    </div>
  );
}
