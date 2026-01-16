"use client";

import { useRef, useState, useEffect, useCallback } from "react";

import type { ExtractedColor, RGB } from "@/lib/color-extraction/types";

import { ColorCrosshair } from "./ColorCrosshair";
import { SpotlightOverlay } from "./SpotlightOverlay";

interface ImageCanvasProps {
  imageDataUrl: string;
  imageDimensions: { width: number; height: number };
  colors: ExtractedColor[];
  familyColors?: ExtractedColor[];
  hoveredColor: RGB | null;
  selectedDotIndex: number | null;
  selectedDotType: "dominant" | "accent" | null;
  highlightedDotIndex: number | null;
  highlightedDotType: "dominant" | "accent" | null;
  onCrosshairMove: (index: number, x: number, y: number, type: "dominant" | "accent") => void;
  onDotSelect: (index: number, type: "dominant" | "accent") => void;
}

export function ImageCanvas({
  imageDataUrl,
  imageDimensions,
  colors,
  familyColors = [],
  hoveredColor,
  selectedDotIndex,
  selectedDotType,
  highlightedDotIndex,
  highlightedDotType,
  onCrosshairMove,
  onDotSelect,
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load image element for spotlight overlay and loupe
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setLoadedImage(img);
    };
    img.src = imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  const handleTopCrosshairMove = useCallback(
    (index: number, x: number, y: number) => {
      onCrosshairMove(index, x, y, "dominant");
    },
    [onCrosshairMove]
  );

  const handleFamilyCrosshairMove = useCallback(
    (index: number, x: number, y: number) => {
      onCrosshairMove(index, x, y, "accent");
    },
    [onCrosshairMove]
  );

  const handleTopDotSelect = useCallback(
    (index: number) => {
      onDotSelect(index, "dominant");
    },
    [onDotSelect]
  );

  const handleFamilyDotSelect = useCallback(
    (index: number) => {
      onDotSelect(index, "accent");
    },
    [onDotSelect]
  );

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

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

        {/* Spotlight overlay when hovering a color (but not when dragging) */}
        {hoveredColor && loadedImage && !isDragging && (
          <SpotlightOverlay
            image={loadedImage}
            targetColor={hoveredColor}
            width={imageDimensions.width}
            height={imageDimensions.height}
          />
        )}

        {/* Crosshairs for dominant colors */}
        {colors.map((color, index) => (
          <ColorCrosshair
            key={`dominant-${index}`}
            x={color.position.x}
            y={color.position.y}
            color={color.hex}
            index={index}
            type="dominant"
            isSelected={selectedDotType === "dominant" && selectedDotIndex === index}
            isHighlighted={highlightedDotType === "dominant" && highlightedDotIndex === index}
            containerRef={containerRef}
            imageElement={loadedImage}
            onMove={handleTopCrosshairMove}
            onSelect={handleTopDotSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* Crosshairs for accent/family colors */}
        {familyColors.map((color, index) => (
          <ColorCrosshair
            key={`accent-${index}`}
            x={color.position.x}
            y={color.position.y}
            color={color.hex}
            index={index}
            type="accent"
            isSelected={selectedDotType === "accent" && selectedDotIndex === index}
            isHighlighted={highlightedDotType === "accent" && highlightedDotIndex === index}
            containerRef={containerRef}
            imageElement={loadedImage}
            onMove={(idx, x, y) => handleFamilyCrosshairMove(idx, x, y)}
            onSelect={handleFamilyDotSelect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
