"use client";

import { memo, useMemo, forwardRef } from "react";
import Image from "next/image";
import type { AncestryTreeCat } from "@/lib/ancestry-tree/types";
import { getCatPreviewUrl } from "@/lib/ancestry-tree/utils";

interface CatNodeProps {
  cat: AncestryTreeCat;
  onClick?: (cat: AncestryTreeCat) => void;
  onHover?: (catId: string | null) => void;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
}

const SIZE_MAP = {
  sm: 48,
  md: 64,
  lg: 96,
};

export const CatNode = memo(
  forwardRef<HTMLButtonElement, CatNodeProps>(function CatNode(
    {
      cat,
      onClick,
      onHover,
      size = "md",
      showName = true,
      highlighted = false,
      dimmed = false,
    },
    ref
  ) {
    const pixelSize = SIZE_MAP[size];

    const previewUrl = useMemo(() => getCatPreviewUrl(cat), [cat]);

    const genderIcon = cat.gender === "F" ? "♀" : "♂";
    const genderColor = cat.gender === "F" ? "text-pink-400" : "text-blue-400";

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onClick?.(cat)}
        onMouseEnter={() => onHover?.(cat.id)}
        onMouseLeave={() => onHover?.(null)}
        className={`group flex flex-col items-center gap-1 rounded-lg p-2 transition-all duration-200 hover:bg-white/10 ${
          highlighted ? "ring-2 ring-amber-500 bg-amber-500/10 scale-105 z-10" : ""
        } ${dimmed ? "opacity-40" : ""}`}
      >
        <div
          className="relative overflow-hidden rounded-lg bg-black/20 shadow-lg transition-transform group-hover:scale-105"
          style={{ width: pixelSize, height: pixelSize }}
        >
          <Image
            src={previewUrl}
            alt={cat.name.full}
            width={pixelSize}
            height={pixelSize}
            className="pixelated"
            unoptimized
          />
          <span
            className={`absolute bottom-0 right-0 px-1 text-xs font-bold ${genderColor} drop-shadow-md`}
          >
            {genderIcon}
          </span>
        </div>
        {showName && (
          <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground max-w-[80px] truncate">
            {cat.name.full}
          </span>
        )}
      </button>
    );
  })
);
