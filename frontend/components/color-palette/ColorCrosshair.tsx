"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ColorCrosshairProps {
  x: number;
  y: number;
  color: string;
  index: number;
  type: "dominant" | "accent";
  isSelected: boolean;
  isHighlighted: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageElement: HTMLImageElement | null;
  onMove: (index: number, x: number, y: number) => void;
  onSelect: (index: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// Loupe settings
const LOUPE_SIZE = 7; // 7x7 pixel grid
const LOUPE_PIXEL_SIZE = 12; // Each pixel in loupe is 12x12px
const LOUPE_TOTAL_SIZE = LOUPE_SIZE * LOUPE_PIXEL_SIZE;

/**
 * Render an interactive draggable color crosshair with an integrated loupe magnifier.
 *
 * The component displays a small colored crosshair that supports selecting, highlighting,
 * and dragging. While dragging a magnified 7x7 pixel loupe—sampled from the provided
 * image element—appears around the crosshair; movement emits onMove callbacks and optional
 * drag lifecycle callbacks.
 *
 * @param x - Horizontal position in pixels relative to the container element's top-left.
 * @param y - Vertical position in pixels relative to the container element's top-left.
 * @param color - Fill color for the crosshair.
 * @param index - Identifier for this crosshair instance (passed to callbacks).
 * @param type - Visual style of the ring; `"dominant"` uses a purple ring, `"accent"` uses blue.
 * @param isSelected - Whether the crosshair is currently selected.
 * @param isHighlighted - Whether the crosshair is visually highlighted.
 * @param containerRef - Ref to the container element used to compute bounds and pointer-to-container coordinates.
 * @param imageElement - Source HTMLImageElement used to sample pixel colors for the loupe; sampling maps display coordinates to the image's natural resolution.
 * @param onMove - Called during dragging as onMove(index, x, y) with the new coordinates relative to the container.
 * @param onSelect - Called when the crosshair is clicked (no drag) as onSelect(index).
 * @param onDragStart - Optional callback invoked once when a drag motion begins.
 * @param onDragEnd - Optional callback invoked once when the drag ends.
 * @returns The React element rendering the interactive crosshair and its loupe.
 */
export function ColorCrosshair({
  x,
  y,
  color,
  index,
  type,
  isSelected,
  isHighlighted,
  containerRef,
  imageElement,
  onMove,
  onSelect,
  onDragStart,
  onDragEnd,
}: ColorCrosshairProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [loupePixels, setLoupePixels] = useState<string[][]>([]);
  const [showLoupe, setShowLoupe] = useState(false); // For smooth transition
  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasDragged = useRef(false); // Track if mouse actually moved during drag

  // Ring colors based on type
  const ringColor = type === "dominant" ? "#8B5CF6" : "#38BDF8";

  // Calculate size based on state (35% idle, 70% selected, 100% dragging)
  const getSize = () => {
    if (isDragging) return 1; // 100%
    if (isSelected) return 0.7; // 70%
    return 0.35; // 35%
  };

  const scale = getSize();
  const baseSize = 48; // Base size at 100%
  const currentSize = baseSize * scale;

  // Extract pixels around cursor for loupe effect
  const extractLoupePixels = useCallback(
    (imgX: number, imgY: number) => {
      if (!imageElement) return;

      // Create or reuse canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Set canvas to image size
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      ctx.drawImage(imageElement, 0, 0);

      // Calculate scale between display and natural size
      const scaleX = imageElement.naturalWidth / imageElement.width;
      const scaleY = imageElement.naturalHeight / imageElement.height;

      // Get natural coordinates
      const natX = Math.floor(imgX * scaleX);
      const natY = Math.floor(imgY * scaleY);

      const halfSize = Math.floor(LOUPE_SIZE / 2);
      const pixels: string[][] = [];

      for (let dy = -halfSize; dy <= halfSize; dy++) {
        const row: string[] = [];
        for (let dx = -halfSize; dx <= halfSize; dx++) {
          const px = natX + dx;
          const py = natY + dy;

          if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
            const data = ctx.getImageData(px, py, 1, 1).data;
            row.push(`rgb(${data[0]}, ${data[1]}, ${data[2]})`);
          } else {
            row.push("transparent");
          }
        }
        pixels.push(row);
      }

      setLoupePixels(pixels);
    },
    [imageElement]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      hasDragged.current = false; // Reset drag tracking
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - rect.left - x,
        y: e.clientY - rect.top - y,
      };
      // Don't extract loupe yet - wait for actual movement
    },
    [x, y, containerRef]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!containerRef.current) return;

      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      hasDragged.current = false; // Reset drag tracking
      setIsDragging(true);
      dragOffset.current = {
        x: touch.clientX - rect.left - x,
        y: touch.clientY - rect.top - y,
      };
      // Don't extract loupe yet - wait for actual movement
    },
    [x, y, containerRef]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Only select if we didn't drag
      if (!hasDragged.current) {
        onSelect(index);
      }
    },
    [index, onSelect]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      // Mark that actual dragging happened
      if (!hasDragged.current) {
        hasDragged.current = true;
        setShowLoupe(true);
        onDragStart?.();
      }

      const rect = containerRef.current.getBoundingClientRect();
      const newX = e.clientX - rect.left - dragOffset.current.x;
      const newY = e.clientY - rect.top - dragOffset.current.y;
      onMove(index, newX, newY);
      extractLoupePixels(newX, newY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!containerRef.current) return;

      // Mark that actual dragging happened
      if (!hasDragged.current) {
        hasDragged.current = true;
        setShowLoupe(true);
        onDragStart?.();
      }

      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const newX = touch.clientX - rect.left - dragOffset.current.x;
      const newY = touch.clientY - rect.top - dragOffset.current.y;
      onMove(index, newX, newY);
      extractLoupePixels(newX, newY);
    };

    const handleEnd = () => {
      setIsDragging(false);
      setShowLoupe(false);
      setLoupePixels([]);
      if (hasDragged.current) {
        onDragEnd?.();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, containerRef, index, onMove, extractLoupePixels, onDragEnd, onDragStart]);

  const centerIndex = Math.floor(LOUPE_SIZE / 2);

  return (
    <div
      className={`absolute touch-none ${
        isDragging ? "cursor-grabbing z-30" : "cursor-grab z-10"
      } ${isHighlighted || isSelected ? "z-20" : ""}`}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
    >
      {/* Loupe view - always rendered for smooth transition */}
      <div
        className="absolute rounded-full overflow-hidden shadow-2xl transition-all duration-150 ease-out"
        style={{
          width: LOUPE_TOTAL_SIZE,
          height: LOUPE_TOTAL_SIZE,
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${showLoupe ? 1 : 0})`,
          opacity: showLoupe ? 1 : 0,
          boxShadow: `
            0 0 0 3px white,
            0 0 0 5px ${ringColor},
            0 8px 32px rgba(0,0,0,0.5)
          `,
          pointerEvents: showLoupe ? "auto" : "none",
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${LOUPE_SIZE}, ${LOUPE_PIXEL_SIZE}px)`,
            gridTemplateRows: `repeat(${LOUPE_SIZE}, ${LOUPE_PIXEL_SIZE}px)`,
          }}
        >
          {loupePixels.length > 0
            ? loupePixels.map((row, rowIndex) =>
                row.map((pixelColor, colIndex) => {
                  const isCenter = rowIndex === centerIndex && colIndex === centerIndex;
                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      style={{
                        backgroundColor: pixelColor,
                        width: LOUPE_PIXEL_SIZE,
                        height: LOUPE_PIXEL_SIZE,
                        boxSizing: "border-box",
                        border: isCenter ? "2px solid white" : "none",
                        boxShadow: isCenter
                          ? "0 0 0 1px rgba(0,0,0,0.8)"
                          : "none",
                      }}
                    />
                  );
                })
              )
            : null}
        </div>
      </div>

      {/* Regular dot view - scales down when loupe appears */}
      <div
        className="relative transition-all duration-150 ease-out"
        style={{
          width: currentSize,
          height: currentSize,
          transform: showLoupe ? "scale(0)" : "scale(1)",
          opacity: showLoupe ? 0 : 1,
        }}
      >
          {/* Outer glow ring */}
          <div
            className={`absolute inset-0 rounded-full transition-all duration-200 ${
              isHighlighted || isSelected ? "animate-pulse" : ""
            }`}
            style={{
              boxShadow: `
                0 0 0 ${isSelected ? 4 : 2}px ${ringColor}${isHighlighted || isSelected ? "cc" : "80"},
                ${isHighlighted || isSelected ? `0 0 20px ${ringColor}80` : "none"}
              `,
            }}
          />

          {/* White border */}
          <div
            className="absolute inset-0 rounded-full bg-white shadow-lg"
            style={{
              boxShadow: `
                0 2px 8px rgba(0,0,0,0.3),
                0 4px 16px rgba(0,0,0,0.2)
              `,
            }}
          />

          {/* Color fill */}
          <div
            className="absolute rounded-full"
            style={{
              inset: 3 * scale,
              backgroundColor: color,
            }}
          />
      </div>
    </div>
  );
}