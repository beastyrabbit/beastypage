"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize, Move } from "lucide-react";
import type { AncestryTreeCat, SerializedAncestryTree } from "@/lib/ancestry-tree/types";
import { getCatsByGeneration, findCatById } from "@/lib/ancestry-tree/familyChartAdapter";
import { CatNode } from "./CatNode";

interface TreeVisualizationProps {
  tree: SerializedAncestryTree;
  onCatClick: (cat: AncestryTreeCat) => void;
  highlightedCatId?: string | null;
}

interface Position {
  x: number;
  y: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export function TreeVisualization({ tree, onCatClick, highlightedCatId }: TreeVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });

  const generations = useMemo(() => getCatsByGeneration(tree), [tree]);
  const maxGeneration = useMemo(() => {
    const keys = Array.from(generations.keys());
    return keys.length === 0 ? -1 : Math.max(...keys);
  }, [generations]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(Math.max(prev.scale + delta, 0.25), 2),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setTransform((prev) => ({ ...prev, scale: Math.min(prev.scale + 0.25, 2) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setTransform((prev) => ({ ...prev, scale: Math.max(prev.scale - 0.25, 0.25) }));
  }, []);

  const handleReset = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  const renderGeneration = useCallback(
    (generation: number) => {
      const cats = generations.get(generation) ?? [];
      if (cats.length === 0) return null;

      // Group cats by family (same parents)
      const families = new Map<string, AncestryTreeCat[]>();
      for (const cat of cats) {
        const familyKey = cat.motherId && cat.fatherId
          ? `${cat.motherId}-${cat.fatherId}`
          : cat.partnerId
            ? `partner-${cat.id}`
            : `orphan-${cat.id}`;

        if (!families.has(familyKey)) {
          families.set(familyKey, []);
        }
        families.get(familyKey)!.push(cat);
      }

      return (
        <div
          key={generation}
          className="flex flex-col gap-2"
        >
          <div className="text-center text-xs font-medium text-muted-foreground mb-2">
            Generation {generation}
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {Array.from(families.entries()).map(([familyKey, familyCats]) => {
              // Check if this is a couple
              const hasCouple = familyCats.some((c) => c.partnerId && familyCats.some((p) => p.id === c.partnerId));

              if (hasCouple) {
                // Find the couple
                const catWithPartner = familyCats.find((c) => c.partnerId);
                if (catWithPartner) {
                  const partner = findCatById(tree, catWithPartner.partnerId!);
                  const female = catWithPartner.gender === "F" ? catWithPartner : partner;
                  const male = catWithPartner.gender === "M" ? catWithPartner : partner;

                  // Get their children
                  const children = familyCats.filter((c) =>
                    c.motherId === female?.id || c.fatherId === male?.id
                  );

                  return (
                    <div key={familyKey} className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-2">
                        {female && (
                          <CatNode
                            cat={female}
                            onClick={onCatClick}
                            highlighted={highlightedCatId === female.id}
                          />
                        )}
                        <span className="text-pink-500 text-xl">♥</span>
                        {male && (
                          <CatNode
                            cat={male}
                            onClick={onCatClick}
                            highlighted={highlightedCatId === male.id}
                          />
                        )}
                      </div>
                      {children.length > 0 && (
                        <div className="relative">
                          <div className="absolute left-1/2 -top-3 h-3 w-px bg-white/30" />
                          <div className="flex items-start justify-center gap-1 border-t border-white/30 pt-3">
                            {children.map((child) => (
                              <CatNode
                                key={child.id}
                                cat={child}
                                onClick={onCatClick}
                                size="sm"
                                highlighted={highlightedCatId === child.id}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              }

              // Individual cats
              return (
                <div key={familyKey} className="flex gap-2">
                  {familyCats.map((cat) => (
                    <CatNode
                      key={cat.id}
                      cat={cat}
                      onClick={onCatClick}
                      highlighted={highlightedCatId === cat.id}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      );
    },
    [generations, tree, onCatClick, highlightedCatId]
  );

  if (tree.cats.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Generate a tree to see the visualization</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="min-h-full min-w-full p-8"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "center center",
          }}
        >
          <div className="flex flex-col gap-12">
            {Array.from({ length: maxGeneration + 1 }, (_, i) => renderGeneration(i))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 glass-card p-2">
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          title="Zoom In"
        >
          <ZoomIn className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          title="Zoom Out"
        >
          <ZoomOut className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          title="Reset View"
        >
          <Maximize className="size-5" />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 glass-card px-3 py-2 text-xs text-muted-foreground">
        <Move className="inline size-3 mr-1" />
        Drag to pan &bull; Scroll to zoom
      </div>
    </div>
  );
}
