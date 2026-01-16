"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ColorCrosshairProps {
  x: number;
  y: number;
  color: string;
  index: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMove: (index: number, x: number, y: number) => void;
}

export function ColorCrosshair({
  x,
  y,
  color,
  index,
  containerRef,
  onMove,
}: ColorCrosshairProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - rect.left - x,
        y: e.clientY - rect.top - y,
      };
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
      setIsDragging(true);
      dragOffset.current = {
        x: touch.clientX - rect.left - x,
        y: touch.clientY - rect.top - y,
      };
    },
    [x, y, containerRef]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newX = e.clientX - rect.left - dragOffset.current.x;
      const newY = e.clientY - rect.top - dragOffset.current.y;
      onMove(index, newX, newY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!containerRef.current) return;
      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const newX = touch.clientX - rect.left - dragOffset.current.x;
      const newY = touch.clientY - rect.top - dragOffset.current.y;
      onMove(index, newX, newY);
    };

    const handleEnd = () => {
      setIsDragging(false);
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
  }, [isDragging, containerRef, index, onMove]);

  return (
    <svg
      className={`absolute -translate-x-1/2 -translate-y-1/2 touch-none ${
        isDragging ? "cursor-grabbing z-20" : "cursor-grab z-10"
      }`}
      style={{ left: x, top: y }}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Outer glow */}
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="white"
        opacity={isDragging ? "1" : "0.9"}
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
      />
      {/* Color center */}
      <circle
        cx="16"
        cy="16"
        r="10"
        fill={color}
        stroke="white"
        strokeWidth="2"
      />
      {/* Index label */}
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fontSize="10"
        fontWeight="bold"
        fill={getContrastText(color)}
      >
        {index + 1}
      </text>
    </svg>
  );
}

function getContrastText(hex: string): string {
  // Parse hex color
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}
