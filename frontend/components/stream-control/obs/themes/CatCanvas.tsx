"use client";

import type { CSSProperties, RefObject } from "react";
import { DISPLAY_SIZE } from "../spinSupport";

interface CatCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Rendered CSS size in px; the backing store is always DISPLAY_SIZE. */
  cssSize?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one place a spin scene mounts the engine's canvas. ObsOverlayClient
 * draws into `canvasRef` imperatively (720×720, nearest-neighbour), so
 * every theme must render exactly one of these.
 */
export function CatCanvas({
  canvasRef,
  cssSize = DISPLAY_SIZE,
  className,
  style,
}: Readonly<CatCanvasProps>) {
  return (
    <canvas
      ref={canvasRef}
      width={DISPLAY_SIZE}
      height={DISPLAY_SIZE}
      className={className}
      style={{
        width: `${cssSize}px`,
        height: `${cssSize}px`,
        imageRendering: "pixelated",
        display: "block",
        ...style,
      }}
    />
  );
}
