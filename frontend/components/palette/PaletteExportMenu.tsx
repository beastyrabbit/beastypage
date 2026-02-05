"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import ArrowBigDownDashIcon from "@/components/ui/arrow-big-down-dash-icon";
import type { ExportFormat } from "@/lib/palette-generator/types";

export type { ExportFormat };

interface PaletteExportMenuProps {
  onExport: (format: ExportFormat) => void;
  label?: string;
}

export function PaletteExportMenu({ onExport, label = "Export" }: PaletteExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (format: ExportFormat) => {
      setOpen(false);
      onExport(format);
    },
    [onExport],
  );

  const formats: { key: ExportFormat; label: string; desc: string }[] = [
    { key: "png", label: "PNG", desc: "Color strip image" },
    { key: "aco", label: "ACO", desc: "Adobe swatch file" },
    { key: "json", label: "JSON", desc: "Structured data" },
    { key: "css", label: "CSS", desc: "CSS custom properties" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
      >
        <ArrowBigDownDashIcon size={14} />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-border/50 bg-background/95 py-1 shadow-xl backdrop-blur">
          {formats.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => handleSelect(f.key)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-foreground/10"
            >
              <span className="font-semibold text-foreground">{f.label}</span>
              <span className="text-muted-foreground/70">{f.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
