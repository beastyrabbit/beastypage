"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { TOOL_REGISTRY } from "@/lib/dash/registry.generated";
import type { ToolCategory, ToolWidgetMeta } from "@/lib/dash/types";

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  "warrior-cats": "Warrior Cats",
  gacha: "Gacha",
  artist: "Artist",
  games: "Games",
};

const CATEGORY_ORDER: ToolCategory[] = ["gacha", "warrior-cats", "artist", "games"];

interface AddWidgetModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  placedIds: Set<string>;
}

export function AddWidgetModal({ open, onClose, onSelect, placedIds }: AddWidgetModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const grouped = useMemo(() => {
    const map = new Map<ToolCategory, ToolWidgetMeta[]>();
    for (const tool of TOOL_REGISTRY) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return map;
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="relative mx-4 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl border border-border/40 bg-background/95 p-6 shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition"
        >
          <X className="size-4" />
        </button>

        <h2 className="mb-5 text-sm font-semibold text-foreground">Add a Tool</h2>

        {CATEGORY_ORDER.map((cat) => {
          const tools = grouped.get(cat);
          if (!tools?.length) return null;
          return (
            <section key={cat} className="mb-5">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {CATEGORY_LABELS[cat]}
              </h3>
              <div className="grid grid-cols-1 gap-1.5">
                {tools.map((tool) => {
                  const placed = placedIds.has(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      disabled={placed}
                      onClick={() => {
                        onSelect(tool.id);
                        onClose();
                      }}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        placed
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-foreground/10"
                      }`}
                    >
                      <span className="text-xl">{tool.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">{tool.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{tool.description}</div>
                      </div>
                      {placed && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Added
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
