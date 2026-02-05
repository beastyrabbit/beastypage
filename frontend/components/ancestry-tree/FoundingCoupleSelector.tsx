"use client";

import { useState, useMemo } from "react";
import XIcon from "@/components/ui/x-icon";
import MagnifierIcon from "@/components/ui/magnifier-icon";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CatParams } from "@/lib/cat-v3/types";
import { encodeCatShare } from "@/lib/catShare";

interface HistoryCat {
  id: string;
  catName: string | null;
  creatorName: string | null;
  previewUrl: string;
  catData: Record<string, unknown>;
}

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

  // Generic suffix detection - preserve original casing
  if (trimmed.length >= 4) {
    const prefix = trimmed.slice(0, Math.ceil(trimmed.length / 2));
    const suffix = trimmed.slice(Math.ceil(trimmed.length / 2));
    return { prefix, suffix, full: trimmed };
  }

  return { prefix: trimmed, suffix: "", full: trimmed };
}

export function FoundingCoupleSelector({ onSelect, onClose }: FoundingCoupleSelectorProps) {
  const [selectedMother, setSelectedMother] = useState<HistoryCat | null>(null);
  const [selectedFather, setSelectedFather] = useState<HistoryCat | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Query only single cat profiles (not batches or trees)
  const profilesQuery = useQuery(api.mapper.listHistory, { limit: 200 });

  // Filter to only single cat profiles
  const allCats = useMemo(() => {
    const cats: HistoryCat[] = [];

    if (profilesQuery) {
      for (const profile of profilesQuery) {
        // Skip profiles without cat data
        if (!profile.cat_data) continue;
        // Skip profiles that are part of an adoption batch
        if (profile.adoptionBatchId) continue;

        cats.push({
          id: profile.id,
          catName: profile.catName || null,
          creatorName: profile.creatorName || null,
          previewUrl: getPreviewUrl(profile.cat_data as Record<string, unknown>),
          catData: profile.cat_data as Record<string, unknown>,
        });
      }
    }

    // Deduplicate by unique cat ID
    const seen = new Set<string>();
    return cats.filter((cat) => {
      if (seen.has(cat.id)) return false;
      seen.add(cat.id);
      return true;
    });
  }, [profilesQuery]);

  const filteredCats = useMemo(() => {
    if (!searchTerm.trim()) return allCats;
    const term = searchTerm.toLowerCase();
    return allCats.filter(
      (c) =>
        c.catName?.toLowerCase().includes(term) ||
        c.creatorName?.toLowerCase().includes(term)
    );
  }, [allCats, searchTerm]);

  const handleCatClick = (cat: HistoryCat) => {
    if (!selectedMother) {
      setSelectedMother(cat);
    } else if (!selectedFather && cat.id !== selectedMother.id) {
      setSelectedFather(cat);
    } else if (cat.id === selectedMother.id) {
      setSelectedMother(null);
    } else if (cat.id === selectedFather?.id) {
      setSelectedFather(null);
    }
  };

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

  const isLoading = profilesQuery === undefined;

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
            <XIcon size={20} />
          </button>
        </div>

        {/* Selected cats display */}
        <div className="flex gap-4 border-b border-white/10 p-4">
          <div className="flex flex-1 flex-col items-center gap-2 rounded-lg bg-pink-500/10 p-3">
            <span className="text-sm font-medium text-pink-400">Mother ♀</span>
            {selectedMother ? (
              <div className="flex items-center gap-2">
                <Image
                  src={selectedMother.previewUrl}
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
                  <XIcon size={16} />
                </button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Click a cat below</span>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center gap-2 rounded-lg bg-blue-500/10 p-3">
            <span className="text-sm font-medium text-blue-400">Father ♂</span>
            {selectedFather ? (
              <div className="flex items-center gap-2">
                <Image
                  src={selectedFather.previewUrl}
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
                  <XIcon size={16} />
                </button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Click a cat below</span>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <MagnifierIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-lg border border-white/20 bg-white/5 pl-10 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Showing {filteredCats.length} cats from history
          </p>
        </div>

        {/* Cat grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : filteredCats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No cats found in history
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
              {filteredCats.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCatClick(cat)}
                  className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all hover:bg-white/10 ${
                    selectedMother?.id === cat.id
                      ? "ring-2 ring-pink-500 bg-pink-500/10"
                      : selectedFather?.id === cat.id
                        ? "ring-2 ring-blue-500 bg-blue-500/10"
                        : ""
                  }`}
                >
                  <Image
                    src={cat.previewUrl}
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

        {/* Actions */}
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
