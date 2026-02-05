"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CopyIcon from "@/components/ui/copy-icon";
import XIcon from "@/components/ui/x-icon";
import { track } from "@/lib/analytics";
import { PaletteExportMenu } from "./PaletteExportMenu";
import type { GeneratedPalette, DisplayFormat, ExportFormat } from "@/lib/palette-generator/types";
import {
  exportPalettes,
  buildClipboardText,
} from "@/lib/palette-generator/export-utils";

interface CollectionActionBarProps {
  palettes: GeneratedPalette[];
  displayFormat: DisplayFormat;
  onClear: () => void;
  showToast: (message: string) => void;
}

export function CollectionActionBar({
  palettes,
  displayFormat,
  onClear,
  showToast,
}: CollectionActionBarProps) {
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(confirmTimerRef.current);
  }, []);

  const handleCopyAll = useCallback(async () => {
    const text = buildClipboardText(palettes, displayFormat);
    try {
      await navigator.clipboard.writeText(text);
      showToast("All palettes copied");
    } catch (error) {
      console.error("[PaletteGenerator] Clipboard write failed", error);
      toast.error("Clipboard unavailable");
    }
  }, [palettes, displayFormat, showToast]);

  const handleExportAll = useCallback(
    (format: ExportFormat) => {
      try {
        exportPalettes(palettes, format, displayFormat);
        showToast(`Exported ${palettes.length} palette(s) as ${format.toUpperCase()}`);
        track("palette_generator_exported", { format, palette_count: palettes.length });
      } catch (error) {
        console.error(`[PaletteGenerator] Export as ${format} failed`, error);
        toast.error(`${format.toUpperCase()} export failed. Please try again.`);
      }
    },
    [palettes, displayFormat, showToast],
  );

  const handleClear = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    onClear();
    setConfirming(false);
    showToast("Collection cleared");
  }, [confirming, onClear, showToast]);

  if (palettes.length === 0) return null;

  return (
    <div className="glass-card flex flex-wrap items-center gap-3 px-5 py-3">
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
        {palettes.length} palette{palettes.length !== 1 ? "s" : ""}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopyAll}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
        >
          <CopyIcon size={12} />
          Copy All
        </button>

        <PaletteExportMenu onExport={handleExportAll} label="Export All" />

        <button
          type="button"
          onClick={handleClear}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
            confirming
              ? "border-red-500 bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "border-red-500/30 text-red-400 hover:bg-red-500/10",
          )}
        >
          <XIcon size={12} />
          {confirming ? "Confirm clear" : "Clear All"}
        </button>
      </div>
    </div>
  );
}
