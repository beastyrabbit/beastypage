"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import type { ToolWidgetMeta } from "@/lib/dash/types";

interface WidgetCardProps {
  tool: ToolWidgetMeta;
  editing: boolean;
  onRemove: () => void;
  index: number;
}

export function WidgetCard({ tool, editing, onRemove, index }: WidgetCardProps) {
  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:animate-shine" />

      {editing && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-3 top-3 z-10 rounded-full border border-red-500/40 bg-red-500/10 p-1 text-red-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/20"
        >
          <X className="size-3" />
        </button>
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
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-400 transition-transform group-hover:translate-x-2 pt-2">
          Open <ArrowRight className="size-3" />
        </span>
      )}
    </>
  );

  const baseClasses =
    "glass-card relative flex h-full flex-col gap-3 p-5 transition-all duration-500 overflow-hidden group hover:-translate-y-1 hover:shadow-2xl hover:border-emerald-400/30 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards";

  if (editing) {
    return (
      <div
        className={baseClasses}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={tool.href}
      className={baseClasses}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {content}
    </Link>
  );
}
