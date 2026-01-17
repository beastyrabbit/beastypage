"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import ELK from "elkjs/lib/elk.bundled.js";

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
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  type: "couple" | "parent-child";
  highlighted: boolean;
}

interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

const elk = new ELK();

async function layoutTreeWithElk(
  tree: SerializedAncestryTree,
  highlightedIds: Set<string>
): Promise<LayoutResult> {
  if (tree.cats.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const catMap = new Map<string, AncestryTreeCat>();
  for (const cat of tree.cats) {
    catMap.set(cat.id, cat);
  }

  // Build ELK graph
  const elkNodes: Array<{
    id: string;
    width: number;
    height: number;
  }> = [];

  const elkEdges: Array<{
    id: string;
    sources: string[];
    targets: string[];
  }> = [];

  // Track edge metadata for later
  const edgeMetadata = new Map<string, { type: "couple" | "parent-child" }>();

  // Add all cat nodes
  for (const cat of tree.cats) {
    elkNodes.push({
      id: cat.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  // Add couple edges (horizontal connections)
  const processedCouples = new Set<string>();
  let edgeCounter = 0;

  for (const cat of tree.cats) {
    if (cat.partnerId) {
      const coupleKey = [cat.id, cat.partnerId].sort().join("-");
      if (!processedCouples.has(coupleKey)) {
        processedCouples.add(coupleKey);
        const edgeId = `couple-${edgeCounter++}`;
        elkEdges.push({
          id: edgeId,
          sources: [cat.id],
          targets: [cat.partnerId],
        });
        edgeMetadata.set(edgeId, { type: "couple" });
      }
    }
  }

  // Add parent-child edges
  for (const cat of tree.cats) {
    // Connect from mother to child
    if (cat.motherId) {
      const edgeId = `parent-${edgeCounter++}`;
      elkEdges.push({
        id: edgeId,
        sources: [cat.motherId],
        targets: [cat.id],
      });
      edgeMetadata.set(edgeId, { type: "parent-child" });
    }
    // Connect from father to child (only if different from mother)
    if (cat.fatherId && cat.fatherId !== cat.motherId) {
      const edgeId = `parent-${edgeCounter++}`;
      elkEdges.push({
        id: edgeId,
        sources: [cat.fatherId],
        targets: [cat.id],
      });
      edgeMetadata.set(edgeId, { type: "parent-child" });
    }
  }

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "15",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
      "elk.layered.compaction.connectedComponents": "true",
      "elk.separateConnectedComponents": "false",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(elkGraph);

  // Extract positioned nodes
  const nodes: PositionedNode[] = [];
  for (const elkNode of layoutedGraph.children ?? []) {
    const cat = catMap.get(elkNode.id);
    if (cat && elkNode.x !== undefined && elkNode.y !== undefined) {
      nodes.push({
        id: elkNode.id,
        x: elkNode.x,
        y: elkNode.y,
        cat,
      });
    }
  }

  // Extract edges with positions
  const edges: PositionedEdge[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    nodePositions.set(node.id, { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 });
  }

  for (const elkEdge of layoutedGraph.edges ?? []) {
    const metadata = edgeMetadata.get(elkEdge.id);
    if (!metadata) continue;

    const sourceId = elkEdge.sources[0];
    const targetId = elkEdge.targets[0];
    const sourcePos = nodePositions.get(sourceId);
    const targetPos = nodePositions.get(targetId);

    if (sourcePos && targetPos) {
      const highlighted = highlightedIds.has(sourceId) && highlightedIds.has(targetId);
      edges.push({
        id: elkEdge.id,
        sourceX: sourcePos.x,
        sourceY: sourcePos.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        type: metadata.type,
        highlighted,
      });
    }
  }

  // Calculate dimensions from node positions
  let maxX = 0;
  let maxY = 0;
  for (const node of nodes) {
    maxX = Math.max(maxX, node.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.y + NODE_HEIGHT);
  }

  return {
    nodes,
    edges,
    width: maxX + 40,
    height: maxY + 40,
  };
}

export function TreeVisualization({ tree, onCatClick }: TreeVisualizationProps) {
  const [hoveredCatId, setHoveredCatId] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);
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

  // Layout the tree with ELK (async)
  useEffect(() => {
    if (tree.cats.length === 0) {
      setLayout({ nodes: [], edges: [], width: 0, height: 0 });
      return;
    }

    setIsLayouting(true);
    layoutTreeWithElk(tree, highlightedIds)
      .then((result) => {
        setLayout(result);
        setIsLayouting(false);
      })
      .catch((err) => {
        console.error("ELK layout error:", err);
        setIsLayouting(false);
      });
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

  if (isLayouting || !layout) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Laying out tree...</p>
      </div>
    );
  }

  const { nodes, edges, width, height } = layout;

  // Build SVG path for edges
  const buildEdgePath = (edge: PositionedEdge) => {
    if (edge.type === "couple") {
      // Horizontal line for couples
      return `M ${edge.sourceX} ${edge.sourceY} L ${edge.targetX} ${edge.targetY}`;
    } else {
      // Curved path for parent-child
      const midY = (edge.sourceY + edge.targetY) / 2;
      return `M ${edge.sourceX} ${edge.sourceY}
              C ${edge.sourceX} ${midY}, ${edge.targetX} ${midY}, ${edge.targetX} ${edge.targetY}`;
    }
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
                    d={buildEdgePath(edge)}
                    fill="none"
                    stroke={color}
                    strokeWidth={edge.highlighted ? 3 : 2}
                  />
                  {isCouple && (
                    <text
                      x={(edge.sourceX + edge.targetX) / 2}
                      y={(edge.sourceY + edge.targetY) / 2 - 8}
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
