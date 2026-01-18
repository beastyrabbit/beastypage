"use client";

import { useMemo } from "react";
import Image from "next/image";
import { X, Heart, Users, Dna, UserPlus, ChevronRight, Dices, Baby, GitBranch, SkipForward, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AncestryTreeCat, SerializedAncestryTree } from "@/lib/ancestry-tree/types";
import { encodeCatShare } from "@/lib/catShare";
import { findCatById, getSiblings } from "@/lib/ancestry-tree/familyChartAdapter";

interface CatSidebarProps {
  cat: AncestryTreeCat | null;
  tree: SerializedAncestryTree;
  isOpen: boolean;
  onClose: () => void;
  onSelectCat?: (cat: AncestryTreeCat) => void;
  onAssignRandomPartner?: (cat: AncestryTreeCat) => void;
  onAddChildWithPartner?: (cat: AncestryTreeCat, partnerId: string) => void;
  onEditRelations?: () => void;
  isEditingRelations?: boolean;
  onChangePose?: (cat: AncestryTreeCat, newSpriteNumber: number) => void;
}

export function CatSidebar({
  cat,
  tree,
  isOpen,
  onClose,
  onSelectCat,
  onAssignRandomPartner,
  onAddChildWithPartner,
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

  // Defensive: handle cases where partnerIds/childrenIds might be undefined from stale state
  const partners = (cat.partnerIds ?? []).map((id) => findCatById(tree, id)).filter(Boolean) as AncestryTreeCat[];
  const mother = cat.motherId ? findCatById(tree, cat.motherId) : null;
  const father = cat.fatherId ? findCatById(tree, cat.fatherId) : null;
  const siblings = getSiblings(tree, cat.id);
  const children = (cat.childrenIds ?? []).map((id) => findCatById(tree, id)).filter(Boolean) as AncestryTreeCat[];

  const genderIcon = cat.gender === "F" ? "♀" : "♂";
  const genderColor = cat.gender === "F" ? "text-pink-400" : "text-blue-400";

  const lifeStageLabel = {
    kit: "Kit",
    apprentice: "Apprentice",
    warrior: "Warrior",
    leader: "Leader",
    elder: "Elder",
  }[cat.lifeStage];

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
              <Image
                src={previewUrl ?? ""}
                alt={cat.name.full}
                width={200}
                height={200}
                className="pixelated"
                unoptimized
              />
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

          {/* Genetics */}
          <div className="glass-card p-4">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-sm">
              <Dna className="size-4" /> Genetics
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Pelt</dt>
              <dd>{cat.genetics.pelt.expressed}</dd>
              <dt className="text-muted-foreground">Colour</dt>
              <dd>{cat.genetics.colour.expressed}</dd>
              <dt className="text-muted-foreground">Eye Colour</dt>
              <dd>{cat.genetics.eyeColour.expressed}</dd>
              <dt className="text-muted-foreground">Skin</dt>
              <dd>{cat.genetics.skinColour.expressed}</dd>
              {cat.genetics.whitePatches.expressed && (
                <>
                  <dt className="text-muted-foreground">White Patches</dt>
                  <dd>{cat.genetics.whitePatches.expressed}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Tortie</dt>
              <dd>{cat.genetics.isTortie.expressed ? "Yes" : "No"}</dd>
            </dl>
          </div>

          {/* Parents */}
          {(mother || father) && (
            <div className="glass-card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-sm">
                <Users className="size-4" /> Parents
              </h3>
              <div className="flex flex-wrap gap-2">
                {mother && (
                  <CatButton cat={mother} onClick={() => onSelectCat?.(mother)} />
                )}
                {father && (
                  <CatButton cat={father} onClick={() => onSelectCat?.(father)} />
                )}
              </div>
            </div>
          )}

          {/* Partners with their children */}
          {partners.length > 0 && (
            <div className="glass-card p-4 space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-sm">
                <Heart className="size-4" /> {partners.length === 1 ? "Partner & Children" : `Partners & Children (${partners.length})`}
              </h3>
              {partners.map((partner) => {
                // Get children that belong to this specific partner pair
                const partnerChildren = children.filter((child) => {
                  const otherParentId = cat.gender === "F" ? child.fatherId : child.motherId;
                  return otherParentId === partner.id;
                });
                const genderColor = partner.gender === "F" ? "text-pink-400" : "text-blue-400";
                const genderSymbol = partner.gender === "F" ? "♀" : "♂";

                return (
                  <div key={partner.id} className="rounded-lg bg-white/5 p-3 space-y-2">
                    {/* Partner header */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => onSelectCat?.(partner)}
                        className="flex items-center gap-2 text-sm font-medium hover:text-amber-400 transition-colors"
                      >
                        <span className={genderColor}>{genderSymbol}</span>
                        {partner.name.full}
                        <ChevronRight className="size-3 opacity-50" />
                      </button>
                      {onAddChildWithPartner && (
                        <button
                          type="button"
                          onClick={() => {
                            console.log("[CatSidebar] Add Child clicked for partner:", partner.name.full, "id:", partner.id);
                            onAddChildWithPartner(cat, partner.id);
                          }}
                          className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                        >
                          <Baby className="size-3" />
                          Add Child
                        </button>
                      )}
                    </div>
                    {/* Children with this partner */}
                    {partnerChildren.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-4 border-l border-white/10">
                        {partnerChildren.map((child) => (
                          <CatButton key={child.id} cat={child} onClick={() => onSelectCat?.(child)} />
                        ))}
                      </div>
                    )}
                    {partnerChildren.length === 0 && (
                      <p className="text-xs text-muted-foreground pl-4 border-l border-white/10">
                        No children yet
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Partner - always available */}
          {onAssignRandomPartner && (
            <div className="glass-card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-sm">
                <UserPlus className="size-4" /> {partners.length === 0 ? "No Partner" : "Add Another Partner"}
              </h3>
              {partners.length === 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  This cat doesn&apos;t have a partner yet.
                </p>
              )}
              <button
                type="button"
                onClick={() => onAssignRandomPartner(cat)}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pink-700"
              >
                <Dices className="size-4" />
                {partners.length === 0 ? "Assign Random Partner" : "Add Random Partner"}
              </button>
            </div>
          )}

          {/* Siblings */}
          {siblings.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="mb-2 font-semibold text-sm">Siblings ({siblings.length})</h3>
              <div className="flex flex-wrap gap-2">
                {siblings.map((sibling) => (
                  <CatButton key={sibling.id} cat={sibling} onClick={() => onSelectCat?.(sibling)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Reusable cat button component
function CatButton({ cat, onClick }: { cat: AncestryTreeCat; onClick: () => void }) {
  const genderColor = cat.gender === "F" ? "text-pink-400" : "text-blue-400";
  const genderSymbol = cat.gender === "F" ? "♀" : "♂";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs transition-colors hover:bg-white/10 group"
    >
      <span className={genderColor}>{genderSymbol}</span>
      <span>{cat.name.full}</span>
      <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
