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
