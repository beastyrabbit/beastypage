"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import type { AncestryTreeCat } from "@/lib/ancestry-tree/types";
import { encodeCatShare } from "@/lib/catShare";

interface FamilyTreeNodeProps {
  cat: AncestryTreeCat;
  x: number;
  y: number;
  isHighlighted: boolean;
  isDimmed: boolean;
  onHover: (catId: string | null) => void;
  onClick: (cat: AncestryTreeCat) => void;
}

function FamilyTreeNodeComponent({
  cat,
  x,
  y,
  isHighlighted,
  isDimmed,
  onHover,
  onClick,
}: FamilyTreeNodeProps) {
  const previewUrl = useMemo(() => {
    const encoded = encodeCatShare({
      params: cat.params as unknown as Record<string, unknown>,
      accessorySlots: cat.params.accessories ?? [],
      scarSlots: cat.params.scars ?? [],
      tortieSlots: cat.params.tortie ?? [],
      counts: {
        accessories: cat.params.accessories?.length ?? 0,
        scars: cat.params.scars?.length ?? 0,
        tortie: cat.params.tortie?.length ?? 0,
      },
    });
    return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
  }, [cat.params]);

  const genderColor = cat.gender === "F" ? "border-pink-500/50" : "border-blue-500/50";
  const genderBg = cat.gender === "F" ? "bg-pink-500/10" : "bg-blue-500/10";

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        width: 90,
        height: 110,
      }}
    >
      <div
        className={`
          relative flex flex-col items-center p-2 rounded-xl transition-all duration-200
          ${genderBg} border-2 ${genderColor}
          ${isHighlighted ? "ring-2 ring-amber-400 z-10" : ""}
          ${isDimmed ? "opacity-40" : ""}
          cursor-pointer
        `}
        onClick={() => onClick(cat)}
        onMouseEnter={() => onHover(cat.id)}
        onMouseLeave={() => onHover(null)}
      >
        <div className="relative w-16 h-16 rounded-lg bg-black/30 overflow-hidden">
          <Image
            src={previewUrl}
            alt={cat.name.full}
            width={64}
            height={64}
            className="pixelated"
            unoptimized
          />
        </div>

        <span className="mt-1 text-xs font-medium text-center max-w-20 truncate">
          {cat.name.full}
        </span>

        <span className={`text-xs ${cat.gender === "F" ? "text-pink-400" : "text-blue-400"}`}>
          {cat.gender === "F" ? "♀" : "♂"}
        </span>
      </div>
    </div>
  );
}

export const FamilyTreeNode = memo(FamilyTreeNodeComponent);
