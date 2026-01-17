"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import dagre from "dagre";

import type { AncestryTreeCat, SerializedAncestryTree } from "@/lib/ancestry-tree/types";
import { getAncestors, findCatById } from "@/lib/ancestry-tree/familyChartAdapter";
import { FamilyTreeNode } from "./FamilyTreeNode";

interface TreeVisualizationProps {
  tree: SerializedAncestryTree;
  onCatClick: (cat: AncestryTreeCat) => void;
  highlightedCatId?: string | null;
}

// Node dimensions
const NODE_WIDTH = 90;
const NODE_HEIGHT = 110;

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  cat: AncestryTreeCat;
}

interface PositionedEdge {
  id: string;
  points: Array<{ x: number; y: number }>;
  type: "couple" | "parent-child";
  highlighted: boolean;
}

interface DagreNodeLabel {
  width: number;
  height: number;
  cat: AncestryTreeCat;
  x: number;
  y: number;
}

function layoutTree(
  tree: SerializedAncestryTree,
  highlightedIds: Set<string>
): { nodes: PositionedNode[]; edges: PositionedEdge[]; width: number; height: number } {
  const g = new dagre.graphlib.Graph();

  // Set graph properties for compact layout
  g.setGraph({
    rankdir: "TB", // Top to bottom
    nodesep: 15,   // Horizontal spacing between nodes
    ranksep: 80,   // Vertical spacing between ranks
    marginx: 20,
    marginy: 20,
    ranker: "tight-tree", // More compact ranking
  });

  g.setDefaultEdgeLabel(() => ({}));

  const catMap = new Map<string, AncestryTreeCat>();
  for (const cat of tree.cats) {
    catMap.set(cat.id, cat);
  }

  // Add all cat nodes
  for (const cat of tree.cats) {
    g.setNode(cat.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      cat,
    });
  }

  // Track edges for later
  const edgeList: Array<{ from: string; to: string; type: "couple" | "parent-child" }> = [];

  // Add couple edges (horizontal connections)
  const processedCouples = new Set<string>();
  for (const cat of tree.cats) {
    if (cat.partnerId) {
      const coupleKey = [cat.id, cat.partnerId].sort().join("-");
      if (!processedCouples.has(coupleKey)) {
        processedCouples.add(coupleKey);
        // For couples, we want them on the same rank
        // Use a constraint edge with weight
        g.setEdge(cat.id, cat.partnerId, {
          weight: 10,  // High weight to keep together
          minlen: 1,
        });
        edgeList.push({ from: cat.id, to: cat.partnerId, type: "couple" });
      }
    }
  }

  // Add parent-child edges
  for (const cat of tree.cats) {
    if (cat.motherId) {
      g.setEdge(cat.motherId, cat.id, { minlen: 1 });
      edgeList.push({ from: cat.motherId, to: cat.id, type: "parent-child" });
    }
    if (cat.fatherId && cat.fatherId !== cat.motherId) {
      g.setEdge(cat.fatherId, cat.id, { minlen: 1 });
      edgeList.push({ from: cat.fatherId, to: cat.id, type: "parent-child" });
    }
  }

  // Run dagre layout
  dagre.layout(g);

  // Extract positioned nodes
  const nodes: PositionedNode[] = [];
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId) as DagreNodeLabel | undefined;
    if (node?.cat) {
      nodes.push({
        id: nodeId,
        x: node.x - NODE_WIDTH / 2,  // dagre gives center, we want top-left
        y: node.y - NODE_HEIGHT / 2,
        cat: node.cat,
      });
    }
  }

  // Extract edges with their routed points
  const edges: PositionedEdge[] = [];
  let edgeCounter = 0;

  for (const { from, to, type } of edgeList) {
    const edge = g.edge(from, to);
    if (edge) {
      const fromNode = g.node(from) as DagreNodeLabel | undefined;
      const toNode = g.node(to) as DagreNodeLabel | undefined;

      // Build points array
      let points: Array<{ x: number; y: number }> = [];

      if (edge.points && edge.points.length > 0) {
        points = edge.points;
      } else if (fromNode && toNode) {
        // Fallback: direct line
        points = [
          { x: fromNode.x, y: fromNode.y },
          { x: toNode.x, y: toNode.y },
        ];
      }

      const highlighted = highlightedIds.has(from) && highlightedIds.has(to);

      edges.push({
        id: `edge-${edgeCounter++}`,
        points,
        type,
        highlighted,
      });
    }
  }

  // Get graph dimensions
  const graphInfo = g.graph();
  const width = (graphInfo.width ?? 800) + 40;
  const height = (graphInfo.height ?? 600) + 40;

  return { nodes, edges, width, height };
}

export function TreeVisualization({ tree, onCatClick }: TreeVisualizationProps) {
  const [hoveredCatId, setHoveredCatId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Calculate highlighted ancestors
  const highlightedIds = useMemo(() => {
    if (!hoveredCatId) return new Set<string>();

    const ids = new Set<string>([hoveredCatId]);

    // Add ancestors
    const ancestors = getAncestors(tree, hoveredCatId);
    ancestors.forEach((a) => {
      ids.add(a.id);
      if (a.partnerId) ids.add(a.partnerId);
    });

    // Add hovered cat's partner and parents
    const hoveredCat = findCatById(tree, hoveredCatId);
    if (hoveredCat?.partnerId) ids.add(hoveredCat.partnerId);
    if (hoveredCat?.motherId) ids.add(hoveredCat.motherId);
    if (hoveredCat?.fatherId) ids.add(hoveredCat.fatherId);

    return ids;
  }, [hoveredCatId, tree]);

  // Layout the tree
  const { nodes, edges, width, height } = useMemo(() => {
    if (tree.cats.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };
    return layoutTree(tree, highlightedIds);
  }, [tree, highlightedIds]);

  const handleHover = useCallback((catId: string | null) => {
    setHoveredCatId(catId);
  }, []);

  // Pan and zoom handlers
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.2), 3));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s * 0.8, 0.2));
  }, []);

  if (tree.cats.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Generate a tree to see the visualization</p>
      </div>
    );
  }

  // Helper to build SVG path from points
  const buildPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return "";
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(" ");
  };

  return (
    <div className="h-full w-full relative overflow-hidden bg-black/20">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <button
          onClick={handleZoomIn}
          className="glass-card w-10 h-10 flex items-center justify-center text-lg hover:bg-white/20 transition-colors"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="glass-card w-10 h-10 flex items-center justify-center text-lg hover:bg-white/20 transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="glass-card w-10 h-10 flex items-center justify-center text-sm hover:bg-white/20 transition-colors"
          title="Reset view"
        >
          ⟳
        </button>
      </div>

      {/* Tree container */}
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "top left",
            transition: isDragging ? "none" : "transform 0.1s ease-out",
            width: width || "100%",
            height: height || "100%",
          }}
          className="relative"
        >
          {/* SVG for edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: width || "100%", height: height || "100%" }}
          >
            {edges.map((edge) => {
              const isCouple = edge.type === "couple";
              const color = edge.highlighted
                ? "#f59e0b"
                : isCouple ? "#ec4899" : "#64748b";

              return (
                <g key={edge.id}>
                  <path
                    d={buildPath(edge.points)}
                    fill="none"
                    stroke={color}
                    strokeWidth={edge.highlighted ? 3 : 2}
                  />
                  {isCouple && edge.points.length >= 2 && (
                    <text
                      x={(edge.points[0].x + edge.points[edge.points.length - 1].x) / 2}
                      y={(edge.points[0].y + edge.points[edge.points.length - 1].y) / 2 - 8}
                      textAnchor="middle"
                      fill={color}
                      fontSize={12}
                    >
                      ♥
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Cat nodes */}
          {nodes.map((node) => {
            const isHighlighted = highlightedIds.has(node.id);
            const isDimmed = hoveredCatId !== null && !highlightedIds.has(node.id);

            return (
              <FamilyTreeNode
                key={node.id}
                cat={node.cat}
                x={node.x}
                y={node.y}
                isHighlighted={isHighlighted}
                isDimmed={isDimmed}
                onHover={handleHover}
                onClick={onCatClick}
              />
            );
          })}
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute bottom-4 left-4 glass-card px-3 py-2 text-xs text-muted-foreground z-10">
        {hoveredCatId ? (
          <span className="text-amber-400">Showing ancestry chain</span>
        ) : (
          <span>Hover a cat to highlight ancestry</span>
        )}
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-4 right-4 glass-card px-3 py-2 text-xs text-muted-foreground z-10">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
