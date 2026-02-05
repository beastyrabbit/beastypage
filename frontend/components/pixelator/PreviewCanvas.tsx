"use client";

import { useCallback, useId, useRef, useState } from "react";

interface ImageDimensions {
  w: number;
  h: number;
  naturalW: number;
}

interface PreviewCanvasProps {
  originalUrl: string;
  resultUrl: string | null;
  processing: boolean;
  lastDuration: number | null;
  onChangeImage: () => void;
  showGrid: boolean;
  gridSize: number | null;
}

export function PreviewCanvas({
  originalUrl,
  resultUrl,
  processing,
  lastDuration,
  onChangeImage,
  showGrid,
  gridSize,
}: PreviewCanvasProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgDims, setImgDims] = useState<ImageDimensions | null>(null);

  const displayUrl = showOriginal ? originalUrl : (resultUrl ?? originalUrl);

  const handleImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (el) {
      setImgDims({
        w: el.clientWidth,
        h: el.clientHeight,
        naturalW: el.naturalWidth,
      });
    }
  }, []);

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
          ref={imgRef}
          src={displayUrl}
          alt={showOriginal ? "Original image" : "Processed result"}
          className="max-h-[500px] w-auto object-contain"
          style={{ imageRendering: "pixelated" }}
          onLoad={handleImgLoad}
        />
        <GridOverlay showGrid={showGrid} gridSize={gridSize} imgDims={imgDims} />
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

// ---------------------------------------------------------------------------
// Grid overlay — SVG pattern that visualizes detected pixel-art grid lines
// ---------------------------------------------------------------------------

interface GridOverlayProps {
  showGrid: boolean;
  gridSize: number | null;
  imgDims: ImageDimensions | null;
}

function GridOverlay({ showGrid, gridSize, imgDims }: GridOverlayProps): React.ReactNode {
  const patternId = useId();

  if (!showGrid || !gridSize || !imgDims) return null;

  // gridSize is in original-image pixels — scale to displayed size
  const scaledGrid = gridSize * (imgDims.w / imgDims.naturalW);
  if (scaledGrid <= 1) return null;

  return (
    <svg
      className="pointer-events-none absolute"
      style={{
        width: imgDims.w,
        height: imgDims.h,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
      viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
    >
      <defs>
        <pattern
          id={patternId}
          width={scaledGrid}
          height={scaledGrid}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${scaledGrid} 0 L 0 0 0 ${scaledGrid}`}
            fill="none"
            stroke="rgba(255,0,255,0.5)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
