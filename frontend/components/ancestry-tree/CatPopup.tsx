"use client";

import { useMemo } from "react";
import Image from "next/image";
import { X, Heart, Users, Dna } from "lucide-react";
import type { AncestryTreeCat, SerializedAncestryTree } from "@/lib/ancestry-tree/types";
import { encodeCatShare } from "@/lib/catShare";
import { findCatById, getSiblings } from "@/lib/ancestry-tree/familyChartAdapter";

interface CatPopupProps {
  cat: AncestryTreeCat;
  tree: SerializedAncestryTree;
  onClose: () => void;
  onSelectCat?: (cat: AncestryTreeCat) => void;
  onReplacePartner?: (cat: AncestryTreeCat) => void;
}

export function CatPopup({ cat, tree, onClose, onSelectCat, onReplacePartner }: CatPopupProps) {
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

  const partner = cat.partnerId ? findCatById(tree, cat.partnerId) : null;
  const mother = cat.motherId ? findCatById(tree, cat.motherId) : null;
  const father = cat.fatherId ? findCatById(tree, cat.fatherId) : null;
  const siblings = getSiblings(tree, cat.id);
  const children = cat.childrenIds.map((id) => findCatById(tree, id)).filter(Boolean) as AncestryTreeCat[];

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <div className="flex flex-col items-center gap-4">
          <div className="relative overflow-hidden rounded-xl bg-black/30 shadow-xl">
            <Image
              src={previewUrl}
              alt={cat.name.full}
              width={192}
              height={192}
              className="pixelated"
              unoptimized
            />
          </div>

          <div className="text-center">
            <h2 className="flex items-center justify-center gap-2 text-2xl font-bold">
              {cat.name.full}
              <span className={`text-lg ${genderColor}`}>{genderIcon}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {lifeStageLabel} &bull; Generation {cat.generation}
            </p>
          </div>

          <div className="grid w-full gap-4 text-sm">
            <div className="glass-card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
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

            {(mother || father) && (
              <div className="glass-card p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Users className="size-4" /> Parents
                </h3>
                <div className="flex gap-3">
                  {mother && (
                    <button
                      type="button"
                      onClick={() => onSelectCat?.(mother)}
                      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs transition-colors hover:bg-white/10"
                    >
                      <span className="text-pink-400">♀</span>
                      {mother.name.full}
                    </button>
                  )}
                  {father && (
                    <button
                      type="button"
                      onClick={() => onSelectCat?.(father)}
                      className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs transition-colors hover:bg-white/10"
                    >
                      <span className="text-blue-400">♂</span>
                      {father.name.full}
                    </button>
                  )}
                </div>
              </div>
            )}

            {partner && (
              <div className="glass-card p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Heart className="size-4" /> Partner
                </h3>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onSelectCat?.(partner)}
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs transition-colors hover:bg-white/10"
                  >
                    <span className={partner.gender === "F" ? "text-pink-400" : "text-blue-400"}>
                      {partner.gender === "F" ? "♀" : "♂"}
                    </span>
                    {partner.name.full}
                  </button>
                  {onReplacePartner && (
                    <button
                      type="button"
                      onClick={() => onReplacePartner(cat)}
                      className="rounded-lg bg-amber-600/20 px-3 py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-600/30"
                    >
                      Replace Partner
                    </button>
                  )}
                </div>
              </div>
            )}

            {siblings.length > 0 && (
              <div className="glass-card p-4">
                <h3 className="mb-2 font-semibold">Siblings ({siblings.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((sibling) => (
                    <button
                      key={sibling.id}
                      type="button"
                      onClick={() => onSelectCat?.(sibling)}
                      className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs transition-colors hover:bg-white/10"
                    >
                      <span className={sibling.gender === "F" ? "text-pink-400" : "text-blue-400"}>
                        {sibling.gender === "F" ? "♀" : "♂"}
                      </span>
                      {sibling.name.full}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {children.length > 0 && (
              <div className="glass-card p-4">
                <h3 className="mb-2 font-semibold">Children ({children.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => onSelectCat?.(child)}
                      className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs transition-colors hover:bg-white/10"
                    >
                      <span className={child.gender === "F" ? "text-pink-400" : "text-blue-400"}>
                        {child.gender === "F" ? "♀" : "♂"}
                      </span>
                      {child.name.full}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
