"use client";

import { useEffect, useRef } from "react";

import type { RGB } from "@/lib/color-extraction/types";
import { createSpotlightMask } from "@/lib/color-extraction/kmeans";

interface SpotlightOverlayProps {
  image: HTMLImageElement;
  targetColor: RGB;
  threshold?: number;
  width: number;
  height: number;
}

/**
 * Renders a canvas overlay that displays a spotlight mask isolating pixels close to a target color.
 *
 * @param image - Source HTMLImageElement used to compute the spotlight mask.
 * @param targetColor - RGB color to target for the spotlight.
 * @param threshold - Sensitivity threshold for mask generation; larger values broaden the match (default 30).
 * @param width - Rendered width of the canvas overlay.
 * @param height - Rendered height of the canvas overlay.
 * @returns The canvas element showing the computed spotlight mask.
 */
export function SpotlightOverlay({
  image,
  targetColor,
  threshold = 30,
  width,
  height,
}: SpotlightOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create spotlight mask
    const maskData = createSpotlightMask(image, targetColor, threshold);

    // Clear and draw mask
    canvas.width = maskData.width;
    canvas.height = maskData.height;
    ctx.putImageData(maskData, 0, 0);
  }, [image, targetColor, threshold]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 transition-opacity duration-200"
      style={{
        width,
        height,
      }}
    />
  );
}