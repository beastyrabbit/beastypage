"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CatParams } from "@/lib/cat-v3/types";
import { encodeCatShare } from "@/lib/catShare";

type HistoryCat = {
  id: string;
  slug: string;
  catName: string | null;
  creatorName: string | null;
  previewUrl: string | null;
  catData: Record<string, unknown>;
};

interface FoundingCoupleSelectorProps {
  onSelect: (params: {
    mother: { params: CatParams; historyProfileId?: string; name?: { prefix: string; suffix: string; full: string } };
    father: { params: CatParams; historyProfileId?: string; name?: { prefix: string; suffix: string; full: string } };
  }) => void;
  onClose: () => void;
}

function getPreviewUrl(catData: Record<string, unknown>): string {
  const params = (catData?.params ?? catData?.finalParams ?? catData) as Record<string, unknown>;
  const tortieSlots = params?.tortie as Array<Record<string, unknown> | null> | undefined;
  const encoded = encodeCatShare({
    params,
    accessorySlots: (params?.accessories as string[]) ?? [],
    scarSlots: (params?.scars as string[]) ?? [],
    tortieSlots: tortieSlots ?? [],
    counts: {
      accessories: ((params?.accessories as string[])?.length ?? 0),
      scars: ((params?.scars as string[])?.length ?? 0),
      tortie: (tortieSlots?.length ?? 0),
    },
  });
  return `/api/preview/_?cat=${encodeURIComponent(encoded)}`;
}

function parseCatName(catName: string | null | undefined): { prefix: string; suffix: string; full: string } | undefined {
  if (!catName) return undefined;
  const trimmed = catName.trim();
  if (!trimmed || trimmed.toLowerCase() === "unnamed cat") return undefined;

  // Try to parse warrior cat name format (e.g., "Sunfur", "Moonkit", "Starpaw")
  const specialSuffixes = ["kit", "paw", "star"];
  for (const suffix of specialSuffixes) {
    if (trimmed.toLowerCase().endsWith(suffix)) {
      const prefix = trimmed.slice(0, -suffix.length);
      if (prefix.length >= 2) {
        return { prefix, suffix, full: trimmed };
      }
    }
  }

  // Generic suffix detection
  if (trimmed.length >= 4) {
    const prefix = trimmed.slice(0, Math.ceil(trimmed.length / 2));
    const suffix = trimmed.slice(Math.ceil(trimmed.length / 2)).toLowerCase();
    return { prefix, suffix, full: trimmed };
  }

  return { prefix: trimmed, suffix: "", full: trimmed };
}

export function FoundingCoupleSelector({ onSelect, onClose }: FoundingCoupleSelectorProps) {
  const [selectedMother, setSelectedMother] = useState<HistoryCat | null>(null);
  const [selectedFather, setSelectedFather] = useState<HistoryCat | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const profilesQuery = useQuery(api.mapper.listHistory, { limit: 100 });
  const profiles = profilesQuery ?? [];

  const historyCats: HistoryCat[] = profiles
    .filter((p) => p.cat_data)
    .map((p) => ({
      id: p.id,
      slug: p.slug ?? p.shareToken ?? p.id,
      catName: p.catName || null,
      creatorName: p.creatorName || null,
      previewUrl: getPreviewUrl(p.cat_data as Record<string, unknown>),
      catData: p.cat_data as Record<string, unknown>,
    }));

  const filteredCats = searchTerm.trim()
    ? historyCats.filter(
        (c) =>
          c.catName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.creatorName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : historyCats;

  const handleConfirm = () => {
    if (!selectedMother || !selectedFather) return;

    const motherData = selectedMother.catData;
    const fatherData = selectedFather.catData;

    const motherParams = (motherData?.params ?? motherData?.finalParams ?? motherData) as CatParams;
    const fatherParams = (fatherData?.params ?? fatherData?.finalParams ?? fatherData) as CatParams;

    onSelect({
      mother: {
        params: motherParams,
        historyProfileId: selectedMother.id,
        name: parseCatName(selectedMother.catName),
      },
      father: {
        params: fatherParams,
        historyProfileId: selectedFather.id,
        name: parseCatName(selectedFather.catName),
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card relative max-h-[90vh] w-full max-w-3xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-xl font-bold">Select Founding Couple</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex gap-4 border-b border-white/10 p-4">
          <div className="flex flex-1 flex-col items-center gap-2 rounded-lg bg-pink-500/10 p-3">
            <span className="text-sm font-medium text-pink-400">Mother</span>
            {selectedMother ? (
              <div className="flex items-center gap-2">
                <Image
                  src={selectedMother.previewUrl!}
                  alt={selectedMother.catName ?? "Mother"}
                  width={48}
                  height={48}
                  className="pixelated rounded"
                  unoptimized
                />
                <span className="text-sm">{selectedMother.catName ?? "Unnamed"}</span>
                <button
                  type="button"
                  onClick={() => setSelectedMother(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Click a cat below</span>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center gap-2 rounded-lg bg-blue-500/10 p-3">
            <span className="text-sm font-medium text-blue-400">Father</span>
            {selectedFather ? (
              <div className="flex items-center gap-2">
                <Image
                  src={selectedFather.previewUrl!}
                  alt={selectedFather.catName ?? "Father"}
                  width={48}
                  height={48}
                  className="pixelated rounded"
                  unoptimized
                />
                <span className="text-sm">{selectedFather.catName ?? "Unnamed"}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFather(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Click a cat below</span>
            )}
          </div>
        </div>

        <div className="p-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name..."
            className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredCats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {profilesQuery === undefined ? "Loading..." : "No cats found in history"}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
              {filteredCats.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (!selectedMother) {
                      setSelectedMother(cat);
                    } else if (!selectedFather && cat.id !== selectedMother.id) {
                      setSelectedFather(cat);
                    } else if (cat.id === selectedMother.id) {
                      setSelectedMother(null);
                    } else if (cat.id === selectedFather?.id) {
                      setSelectedFather(null);
                    }
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all hover:bg-white/10 ${
                    selectedMother?.id === cat.id
                      ? "ring-2 ring-pink-500 bg-pink-500/10"
                      : selectedFather?.id === cat.id
                        ? "ring-2 ring-blue-500 bg-blue-500/10"
                        : ""
                  }`}
                >
                  <Image
                    src={cat.previewUrl!}
                    alt={cat.catName ?? "Cat"}
                    width={48}
                    height={48}
                    className="pixelated rounded"
                    unoptimized
                  />
                  <span className="text-xs truncate max-w-full">
                    {cat.catName ?? "Unnamed"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedMother || !selectedFather}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            Create Tree
          </button>
        </div>
      </div>
    </div>
  );
}
