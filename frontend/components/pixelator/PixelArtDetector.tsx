"use client";

import { useState, useCallback } from "react";
import { detectGrid } from "@/lib/pixelator/api";

interface PixelArtDetectorProps {
  imageDataUrl: string;
  onGridDetected: (gridSize: number | null) => void;
  pixelArtMode: boolean;
  gridSize: number | null;
  onToggle: (enabled: boolean) => void;
  onGridSizeChange: (size: number | null) => void;
}

export function PixelArtDetector({
  imageDataUrl,
  onGridDetected,
  pixelArtMode,
  gridSize,
  onToggle,
  onGridSizeChange,
}: PixelArtDetectorProps) {
  const [detecting, setDetecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    try {
      const result = await detectGrid(imageDataUrl);
      setConfidence(result.confidence);
      onGridDetected(result.gridSize);
    } catch {
      setConfidence(null);
      onGridDetected(null);
    } finally {
      setDetecting(false);
    }
  }, [imageDataUrl, onGridDetected]);

  return (
    <div className="glass-card p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Pixel Art Detection
        </span>
        <span className="text-xs text-muted-foreground">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
            >
              {detecting ? "Detecting..." : "Detect Grid"}
            </button>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={pixelArtMode}
                onChange={(e) => onToggle(e.target.checked)}
                className="accent-primary"
              />
              Pixel Art Mode
            </label>

            {confidence !== null && (
              <span className="text-xs text-muted-foreground">
                Confidence: {Math.round(confidence * 100)}%
              </span>
            )}
          </div>

          {pixelArtMode && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground">
                Grid Size
              </label>
              <input
                type="number"
                min={1}
                max={128}
                value={gridSize ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  onGridSizeChange(Number.isFinite(v) && v > 0 ? v : null);
                }}
                className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                placeholder="Auto"
              />
              <span className="text-xs text-muted-foreground">px</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
