"use client";

import { useRef, useState, useEffect, useCallback } from "react";

import type { ExtractedColor, RGB } from "@/lib/color-extraction/types";

import { ColorCrosshair } from "./ColorCrosshair";
import { SpotlightOverlay } from "./SpotlightOverlay";

interface ImageCanvasProps {
  imageDataUrl: string;
  imageDimensions: { width: number; height: number };
  colors: ExtractedColor[];
  hoveredColor: RGB | null;
  onCrosshairMove: (index: number, x: number, y: number) => void;
}

export function ImageCanvas({
  imageDataUrl,
  imageDimensions,
  colors,
  hoveredColor,
  onCrosshairMove,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // Load image element for spotlight overlay
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLoadedImage(img);
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const handleCrosshairMove = useCallback(
    (index: number, x: number, y: number) => {
      onCrosshairMove(index, x, y);
    },
    [onCrosshairMove]
  );

  return (
    <div className="glass-card overflow-hidden p-4">
      <div
        ref={containerRef}
        className="relative mx-auto overflow-hidden rounded-2xl"
        style={{
          width: imageDimensions.width,
          height: imageDimensions.height,
          maxWidth: "100%",
        }}
      >
        {/* Base image */}
        <img
          src={imageDataUrl}
          alt="Uploaded image for color extraction"
          className="block h-full w-full object-contain"
          draggable={false}
        />

        {/* Spotlight overlay when hovering a color */}
        {hoveredColor && loadedImage && (
          <SpotlightOverlay
            image={loadedImage}
            targetColor={hoveredColor}
            width={imageDimensions.width}
            height={imageDimensions.height}
          />
        )}

        {/* Crosshairs for each extracted color */}
        {colors.map((color, index) => (
          <ColorCrosshair
            key={index}
            x={color.position.x}
            y={color.position.y}
            color={color.hex}
            index={index}
            containerRef={containerRef}
            onMove={handleCrosshairMove}
          />
        ))}
      </div>
    </div>
  );
}
