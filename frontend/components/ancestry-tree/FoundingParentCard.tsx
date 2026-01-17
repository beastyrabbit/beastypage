"use client";

import { useMemo } from "react";
import Image from "next/image";
import { RefreshCw, Loader2 } from "lucide-react";
import type { CatParams } from "@/lib/cat-v3/types";
import type { CatName } from "@/lib/ancestry-tree/types";
import { encodeCatShare } from "@/lib/catShare";

interface FoundingParentCardProps {
  gender: "F" | "M";
  params: CatParams | null;
  name: CatName | null;
  onReroll: () => void;
  isLoading?: boolean;
  label?: string;
}

export function FoundingParentCard({
  gender,
  params,
  name,
  onReroll,
  isLoading = false,
  label,
}: FoundingParentCardProps) {
  const previewUrl = useMemo(() => {
    if (!params) return null;
    const encoded = encodeCatShare({
      params: params as unknown as Record<string, unknown>,
      accessorySlots: params.accessories ?? [],
      scarSlots: params.scars ?? [],
      tortieSlots: params.tortie ?? [],
      counts: {
        accessories: params.accessories?.length ?? 0,
        scars: params.scars?.length ?? 0,
        tortie: params.tortie?.length ?? 0,
      },
    });
    return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
  }, [params]);

  const genderIcon = gender === "F" ? "♀" : "♂";
  const genderColor = gender === "F" ? "text-pink-400" : "text-blue-400";
  const bgColor = gender === "F" ? "bg-pink-500/10" : "bg-blue-500/10";
  const borderColor = gender === "F" ? "border-pink-500/30" : "border-blue-500/30";

  return (
    <div className={`flex flex-col items-center gap-4 rounded-2xl p-5 ${bgColor} border ${borderColor}`}>
      <span className={`text-base font-medium ${genderColor}`}>
        {label ?? (gender === "F" ? "Mother" : "Father")} {genderIcon}
      </span>

      <div className="relative w-48 h-48 rounded-xl bg-black/30 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-10 animate-spin text-muted-foreground" />
          </div>
        ) : params && previewUrl ? (
          <Image
            src={previewUrl}
            alt={name?.full ?? (gender === "F" ? "Mother" : "Father")}
            width={192}
            height={192}
            className="pixelated"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm text-center px-2">
            Click &quot;Random Couple&quot; to get started
          </div>
        )}
      </div>

      {params && name && (
        <span className="text-base font-medium">{name.full}</span>
      )}

      <button
        type="button"
        onClick={onReroll}
        disabled={isLoading}
        className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
      >
        <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
        Reroll
      </button>
    </div>
  );
}
