"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hexToRgb, getContrastColor } from "@/lib/color-extraction/color-utils";
import { formatColor } from "@/lib/palette-generator/format-color";
import { exportPalettes } from "@/lib/palette-generator/export-utils";
import { PaletteExportMenu } from "./PaletteExportMenu";
import CopyIcon from "@/components/ui/copy-icon";
import XIcon from "@/components/ui/x-icon";
import { track } from "@/lib/analytics";
import type { GeneratedPalette, DisplayFormat, ExportFormat } from "@/lib/palette-generator/types";

interface PaletteCardProps {
  palette: GeneratedPalette;
  displayFormat: DisplayFormat;
  onRemove: (id: string) => void;
  onUpdateColor: (paletteId: string, colorIndex: number, newHex: string) => void;
  showToast: (message: string) => void;
}

const MODE_COLORS: Record<string, string> = {
  monochrome: "from-slate-400 to-slate-500",
  "monochrome-dark": "from-slate-600 to-slate-800",
  "monochrome-light": "from-slate-200 to-slate-400",
  analogic: "from-amber-400 to-orange-500",
  complement: "from-sky-400 to-indigo-500",
  "analogic-complement": "from-violet-400 to-fuchsia-500",
  triad: "from-emerald-400 to-teal-500",
  quad: "from-rose-400 to-pink-500",
};

function PipetteIcon({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9" />
      <path d="m15 6 6 6" />
      <path d="m11.5 12.5 4 4" />
    </svg>
  );
}

export function PaletteCard({ palette, displayFormat, onRemove, onUpdateColor, showToast }: PaletteCardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Position the picker portal relative to the trigger button
  useLayoutEffect(() => {
    if (pickerIndex === null) {
      setPickerPos(null);
      return;
    }
    const trigger = triggerRefs.current[pickerIndex];
    if (!trigger) return;

    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect();
      // Keep in sync with the picker wrapper's p-3 class and globals.css overrides
      const pickerWidth = 180 + 24; // react-colorful (180px) + p-3 padding (12px * 2)
      const pickerHeight = 222; // empirically measured: picker + padding + hue bar + internal spacing

      // Center horizontally on the trigger, clamp to viewport
      let left = rect.left + rect.width / 2 - pickerWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - pickerWidth - 8));

      // Prefer above the swatch; if not enough room, go below
      const spaceAbove = rect.top;
      let top: number;
      if (spaceAbove >= pickerHeight + 12) {
        top = rect.top - pickerHeight - 8;
      } else {
        top = rect.bottom + 8;
      }

      setPickerPos({ top, left });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [pickerIndex]);

  // Clean up copy timeout on unmount
  useEffect(() => {
    return () => clearTimeout(copyTimeoutRef.current);
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (pickerIndex === null) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        const trigger = triggerRefs.current[pickerIndex];
        if (trigger && trigger.contains(e.target as Node)) return;
        setPickerIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerIndex]);

  const copyColor = useCallback(
    async (hex: string, index: number) => {
      const { clipboard } = formatColor(hex, displayFormat);
      try {
        await navigator.clipboard.writeText(clipboard);
        showToast(`Copied ${clipboard}`);
        setCopiedIndex(index);
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopiedIndex(null), 1200);
      } catch (error) {
        console.error("[PaletteGenerator] Clipboard write failed", error);
        toast.error("Clipboard unavailable");
      }
    },
    [displayFormat, showToast],
  );

  const copyPalette = useCallback(async () => {
    const text = palette.colors.map((hex) => formatColor(hex, displayFormat).clipboard).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Palette copied");
    } catch (error) {
      console.error("[PaletteGenerator] Clipboard write failed", error);
      toast.error("Clipboard unavailable");
    }
  }, [palette, displayFormat, showToast]);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      try {
        exportPalettes([palette], format, displayFormat, `palette-${palette.seed}`);
        showToast(`Exported as ${format.toUpperCase()}`);
        track("palette_generator_exported", { format, palette_count: 1 });
      } catch (error) {
        console.error(`[PaletteGenerator] Export as ${format} failed`, error);
        toast.error(`${format.toUpperCase()} export failed. Please try again.`);
      }
    },
    [palette, displayFormat, showToast],
  );

  const handlePickerOpen = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setPickerIndex((prev) => (prev === index ? null : index));
  }, []);

  const handleColorChange = useCallback(
    (newHex: string) => {
      if (pickerIndex === null) return;
      if (!/^#[0-9a-fA-F]{6}$/.test(newHex)) return;
      onUpdateColor(palette.id, pickerIndex, newHex);
    },
    [palette.id, pickerIndex, onUpdateColor],
  );

  const modeGradient = MODE_COLORS[palette.mode] ?? "from-gray-400 to-gray-500";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -40, scale: 0.96 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="group relative"
    >
      {/* Card body */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05] hover:shadow-xl hover:shadow-black/30">
        {/* Color swatches — tall, with gaps */}
        <div className="flex gap-[2px] p-[6px]">
          {palette.colors.map((hex, i) => {
            const rgb = hexToRgb(hex);
            const textColor = getContrastColor(rgb);
            const { display } = formatColor(hex, displayFormat);
            const isCopied = copiedIndex === i;
            const isActive = hoveredIndex === i || pickerIndex === i;

            return (
              <div
                key={`swatch-${i}`}
                className={cn(
                  "relative flex flex-1 transition-all duration-200",
                  i === 0 && "rounded-l-xl",
                  i === palette.colors.length - 1 && "rounded-r-xl",
                  isActive ? "flex-[1.6] shadow-lg" : "shadow-sm",
                )}
                style={{ height: isActive ? "7rem" : "6rem" }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Main clickable area — copies color */}
                <button
                  type="button"
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-center overflow-hidden",
                    i === 0 && "rounded-l-xl",
                    i === palette.colors.length - 1 && "rounded-r-xl",
                  )}
                  style={{ backgroundColor: hex }}
                  onClick={() => copyColor(hex, i)}
                  title={`Click to copy ${hex.toUpperCase()}`}
                >
                  {/* Hover overlay with color value */}
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 transition-opacity duration-150",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {isCopied ? (
                      <span
                        className="text-[11px] font-bold tracking-wider"
                        style={{ color: textColor }}
                      >
                        COPIED
                      </span>
                    ) : (
                      <>
                        <span
                          className="text-[11px] font-bold tracking-wide"
                          style={{ color: textColor }}
                        >
                          {hex.toUpperCase()}
                        </span>
                        <span
                          className="max-w-full truncate px-1 font-mono text-[9px] tracking-wide"
                          style={{ color: textColor, opacity: 0.7 }}
                        >
                          {display}
                        </span>
                      </>
                    )}
                  </div>
                </button>

                {/* Color picker trigger — bottom-right corner */}
                <button
                  ref={(el) => { triggerRefs.current[i] = el; }}
                  type="button"
                  onClick={(e) => handlePickerOpen(e, i)}
                  className={cn(
                    "absolute bottom-1 right-1 z-10 flex items-center justify-center rounded-md p-1 transition-all duration-150",
                    pickerIndex === i && "opacity-100 scale-110",
                    pickerIndex !== i && isActive && "opacity-80 hover:opacity-100 hover:scale-110",
                    !isActive && "opacity-0 pointer-events-none",
                  )}
                  style={{ backgroundColor: `${textColor}20` }}
                  title="Change color"
                >
                  <PipetteIcon color={textColor} />
                </button>

                {/* Color picker popover — rendered via portal to avoid clipping */}
                {pickerIndex === i && pickerPos && createPortal(
                  <div
                    ref={pickerRef}
                    className="fixed z-[9999]"
                    style={{ top: pickerPos.top, left: pickerPos.left }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="rounded-xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-xl">
                      <HexColorPicker color={hex} onChange={handleColorChange} />
                    </div>
                  </div>,
                  document.body,
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1.5">
          {/* Mode badge */}
          <span
            className={cn(
              "inline-flex items-center rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm",
              modeGradient,
            )}
          >
            {palette.mode.replace("-", " ")}
          </span>

          {/* Seed */}
          <span className="font-mono text-[10px] tracking-wide text-muted-foreground/40">
            #{palette.seed.toUpperCase()}
          </span>

          {/* Response time */}
          <span className="text-[10px] text-muted-foreground/30">
            {palette.source === "fallback" ? "fallback" : `${palette.ms}ms`}
          </span>

          {/* Actions — pushed right */}
          <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              onClick={copyPalette}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            >
              <CopyIcon size={11} />
              Copy
            </button>
            <PaletteExportMenu onExport={handleExport} />
            <button
              type="button"
              onClick={() => onRemove(palette.id)}
              className="inline-flex items-center rounded-lg px-1.5 py-1 text-muted-foreground/50 transition hover:bg-red-500/10 hover:text-red-400"
              title="Remove palette"
            >
              <XIcon size={12} />
            </button>
          </div>
        </div>
      </div>

    </motion.div>
  );
}
