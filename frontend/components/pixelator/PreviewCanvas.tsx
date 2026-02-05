"use client";

import { useState } from "react";

interface PreviewCanvasProps {
  originalUrl: string;
  resultUrl: string | null;
  processing: boolean;
  lastDuration: number | null;
  onChangeImage: () => void;
}

export function PreviewCanvas({
  originalUrl,
  resultUrl,
  processing,
  lastDuration,
  onChangeImage,
}: PreviewCanvasProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  const displayUrl = showOriginal ? originalUrl : (resultUrl ?? originalUrl);

  return (
    <div className="glass-card overflow-hidden">
      {/* Image display */}
      <div className="relative flex items-center justify-center bg-black/20 p-2">
        {processing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm font-medium text-white">Processing...</span>
            </div>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          alt={showOriginal ? "Original image" : "Processed result"}
          className="max-h-[500px] w-auto object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2">
        {resultUrl && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
          >
            {showOriginal ? "Show Result" : "Show Original"}
          </button>
        )}

        <button
          onClick={onChangeImage}
          className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
        >
          Change Image
        </button>

        {lastDuration !== null && (
          <span className="ml-auto text-xs text-muted-foreground">
            Processed in {lastDuration}ms
          </span>
        )}
      </div>
    </div>
  );
}
