"use client";

import { useMemo } from "react";
import Image from "next/image";
import { X, Dna, GitBranch, SkipForward, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AncestryTreeCat } from "@/lib/ancestry-tree/types";
import { encodeCatShare } from "@/lib/catShare";

interface CatSidebarProps {
  cat: AncestryTreeCat | null;
  isOpen: boolean;
  onClose: () => void;
  onEditRelations?: () => void;
  isEditingRelations?: boolean;
  onChangePose?: (cat: AncestryTreeCat, newSpriteNumber: number) => void;
}

export function CatSidebar({
  cat,
  isOpen,
  onClose,
  onEditRelations,
  isEditingRelations,
  onChangePose,
}: CatSidebarProps) {
  const previewUrl = useMemo(() => {
    if (!cat) return null;
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
  }, [cat]);

  if (!cat) return null;

  const genderIcon = cat.gender === "F" ? "♀" : "♂";
  const genderColor = cat.gender === "F" ? "text-pink-400" : "text-blue-400";

  const lifeStageLabel = {
    kit: "Kit",
    apprentice: "Apprentice",
    warrior: "Warrior",
    leader: "Leader",
    elder: "Elder",
  }[cat.lifeStage] ?? cat.lifeStage ?? "Unknown";

  return (
    <>
      {/* Sidebar - no backdrop, graph stays fully visible */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-80 max-w-full bg-background/95 backdrop-blur-xl border-l border-white/10 z-50",
          "transform transition-transform duration-300 ease-out",
          "flex flex-col shadow-2xl",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            {cat.name.full}
            <span className={`text-base ${genderColor}`}>{genderIcon}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Cat Sprite */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative overflow-hidden rounded-xl bg-black/30 shadow-xl">
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt={cat.name.full}
                  width={200}
                  height={200}
                  className="pixelated"
                  unoptimized
                />
              ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  No preview
                </div>
              )}
            </div>
            {/* Next Pose Button */}
            {onChangePose && (
              <button
                type="button"
                onClick={() => {
                  const currentPose = cat.params.spriteNumber ?? 0;
                  const nextPose = currentPose >= 20 ? 0 : currentPose + 1;
                  onChangePose(cat, nextPose);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20"
              >
                <SkipForward className="size-3.5" />
                Next Pose ({cat.params.spriteNumber ?? 0}/20)
              </button>
            )}
            {/* Basic Info - one line */}
            <p className="text-sm text-muted-foreground">
              {lifeStageLabel} &bull; Gen {cat.generation}
            </p>
          </div>

          {/* Edit Relations Button - triggers on-graph add relative mode */}
          {onEditRelations && (
            <div className="glass-card p-4">
              <button
                type="button"
                onClick={onEditRelations}
                className={cn(
                  "flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors",
                  isEditingRelations
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                {isEditingRelations ? (
                  <>
                    <Square className="size-4" />
                    Stop Editing
                  </>
                ) : (
                  <>
                    <GitBranch className="size-4" />
                    Edit Relations
                  </>
                )}
              </button>
              {!isEditingRelations && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Add relatives directly on the tree
                </p>
              )}
            </div>
          )}

          {/* Genetics - with alleles */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="flex items-center gap-2 font-semibold text-sm">
              <Dna className="size-4" /> Genetics
            </h3>

            {/* Legend */}
            <div className="flex gap-3 text-[10px] text-muted-foreground border-b border-white/10 pb-2">
              <span><span className="text-emerald-400">●</span> Active</span>
              <span><span className="text-amber-400/60">●</span> Carried</span>
              <span><span className="text-blue-400">D</span> Dominant</span>
              <span><span className="text-purple-400">R</span> Recessive</span>
            </div>

            {/* Pelt */}
            <GeneticTraitDisplay
              label="Pelt"
              allele1={cat.genetics.pelt.allele1}
              allele2={cat.genetics.pelt.allele2}
              expressed={cat.genetics.pelt.expressed}
              getDominance={getPeltDominance}
            />

            {/* Colour */}
            <GeneticTraitDisplay
              label="Colour"
              allele1={cat.genetics.colour.allele1}
              allele2={cat.genetics.colour.allele2}
              expressed={cat.genetics.colour.expressed}
            />

            {/* Eye Colour */}
            <GeneticTraitDisplay
              label="Eyes"
              allele1={cat.genetics.eyeColour.allele1}
              allele2={cat.genetics.eyeColour.allele2}
              expressed={cat.genetics.eyeColour.expressed}
            />

            {/* Skin */}
            <GeneticTraitDisplay
              label="Skin"
              allele1={cat.genetics.skinColour.allele1}
              allele2={cat.genetics.skinColour.allele2}
              expressed={cat.genetics.skinColour.expressed}
            />

            {/* White Patches */}
            {(cat.genetics.whitePatches.allele1 || cat.genetics.whitePatches.allele2) && (
              <GeneticTraitDisplay
                label="White"
                allele1={cat.genetics.whitePatches.allele1 ?? "none"}
                allele2={cat.genetics.whitePatches.allele2 ?? "none"}
                expressed={cat.genetics.whitePatches.expressed ?? "none"}
              />
            )}

            {/* Tortie */}
            <div className="pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tortie Gene</span>
                <span className={cat.genetics.isTortie.expressed ? "text-pink-400" : "text-muted-foreground"}>
                  {cat.genetics.isTortie.expressed ? "Expressed" :
                   (cat.genetics.isTortie.allele1 || cat.genetics.isTortie.allele2) ? "Carried" : "None"}
                </span>
              </div>
              {cat.gender === "M" && (cat.genetics.isTortie.allele1 || cat.genetics.isTortie.allele2) && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Sex-linked: Males rarely express tortie (0.3%)
                </p>
              )}
            </div>

            {/* Tortie Details */}
            {cat.genetics.isTortie.expressed && cat.params.tortie && cat.params.tortie.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs text-muted-foreground">Tortie Layers ({cat.params.tortie.filter(Boolean).length})</div>
                {cat.params.tortie.filter(Boolean).map((layer, idx) => (
                  <div key={idx} className="text-xs bg-white/5 rounded px-2 py-1">
                    <span className="text-pink-300">Layer {idx + 1}:</span>{" "}
                    <span className="text-amber-300">{layer!.pattern}</span> +{" "}
                    <span className="text-emerald-300">{layer!.colour}</span>{" "}
                    <span className="text-muted-foreground">({layer!.mask})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

// Dominant pelts (patterns) vs recessive (solid colors)
const DOMINANT_PELTS = new Set([
  'Tabby', 'Mackerel', 'Classic', 'Ticked', 'Spotted', 'Rosette', 'Sokoke',
  'Marbled', 'Bengal', 'Speckled', 'Agouti',
]);

const RECESSIVE_PELTS = new Set([
  'SingleColour', 'Single', 'Solid',
]);

function getPeltDominance(allele: string): 'D' | 'R' | null {
  if (DOMINANT_PELTS.has(allele)) return 'D';
  if (RECESSIVE_PELTS.has(allele)) return 'R';
  return null;
}

// Component to display a genetic trait with both alleles
function GeneticTraitDisplay({
  label,
  allele1,
  allele2,
  expressed,
  getDominance,
}: {
  label: string;
  allele1: string;
  allele2: string;
  expressed: string;
  getDominance?: (allele: string) => 'D' | 'R' | null;
}) {
  const isHeterozygous = allele1 !== allele2;
  const dom1 = getDominance?.(allele1);
  const dom2 = getDominance?.(allele2);

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-emerald-400 font-medium">{expressed}</span>
      </div>
      {isHeterozygous && (
        <div className="flex gap-2 text-[10px] pl-2">
          <span className={allele1 === expressed ? "text-emerald-400/80" : "text-amber-400/60"}>
            {allele1}
            {dom1 && <span className={dom1 === 'D' ? "text-blue-400 ml-0.5" : "text-purple-400 ml-0.5"}>{dom1}</span>}
          </span>
          <span className="text-muted-foreground">×</span>
          <span className={allele2 === expressed ? "text-emerald-400/80" : "text-amber-400/60"}>
            {allele2}
            {dom2 && <span className={dom2 === 'D' ? "text-blue-400 ml-0.5" : "text-purple-400 ml-0.5"}>{dom2}</span>}
          </span>
        </div>
      )}
    </div>
  );
}
