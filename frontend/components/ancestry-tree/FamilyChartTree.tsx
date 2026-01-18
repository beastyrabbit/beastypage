"use client";

import { useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import * as f3 from "family-chart";
import type { TreeDatum } from "family-chart";
import "family-chart/styles/family-chart.css";
import "./family-chart-custom.css";

import type { AncestryTreeCat, SerializedAncestryTree } from "@/lib/ancestry-tree/types";
import { convertToFamilyChartFormat } from "@/lib/ancestry-tree/familyChartAdapter";

export type TreeOrientation = "vertical" | "horizontal";

export type RelativeType = "son" | "daughter" | "spouse";

export interface FamilyChartTreeRef {
  startAddRelative: () => void;
  stopAddRelative: () => void;
  showFullGraph: () => void;
  getCurrentMainId: () => string | null;
}

interface FamilyChartTreeProps {
  tree: SerializedAncestryTree;
  orientation: TreeOrientation;
  onSelectCat: (cat: AncestryTreeCat) => void;
  onAddRelative?: (type: RelativeType, parentCat: AncestryTreeCat, otherParentId?: string) => void;
  onMainIdChange?: (mainId: string | null) => void;
  onEditModeChanged?: (isEditing: boolean) => void;
}

// Extract our custom data from family-chart's TreeDatum
interface CustomData {
  'first name': string;
  'last name': string;
  gender: 'M' | 'F';
  avatar?: string;
  catData: AncestryTreeCat;
}

export const FamilyChartTree = forwardRef<FamilyChartTreeRef, FamilyChartTreeProps>(
  function FamilyChartTree(
    { tree, orientation, onSelectCat, onAddRelative, onMainIdChange, onEditModeChanged },
    ref
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof f3.createChart> | null>(null);
  const editTreeRef = useRef<ReturnType<ReturnType<typeof f3.createChart>["editTree"]> | null>(null);
  const cardRef = useRef<ReturnType<ReturnType<typeof f3.createChart>["setCardHtml"]> | null>(null);
  const prevDataLengthRef = useRef<number>(0);
  const currentMainIdRef = useRef<string | null>(null);

  // Convert tree data to family-chart format
  const chartData = useMemo(() => {
    return convertToFamilyChartFormat(tree);
  }, [tree]);

  // Stable refs for callbacks - synced via useEffect to comply with React rules
  const onSelectCatRef = useRef(onSelectCat);
  const onAddRelativeRef = useRef(onAddRelative);
  const onMainIdChangeRef = useRef(onMainIdChange);
  const onEditModeChangedRef = useRef(onEditModeChanged);

  useEffect(() => {
    onSelectCatRef.current = onSelectCat;
    onAddRelativeRef.current = onAddRelative;
    onMainIdChangeRef.current = onMainIdChange;
    onEditModeChangedRef.current = onEditModeChanged;
  }, [onSelectCat, onAddRelative, onMainIdChange, onEditModeChanged]);

  // Find root cat ID
  const rootId = useMemo(() => {
    // The founding mother is typically the "root" for full graph view
    return tree.foundingMotherId;
  }, [tree.foundingMotherId]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startAddRelative: () => {
      // Use the editTree API to show add-relative options on the graph
      if (editTreeRef.current && chartRef.current) {
        try {
          // Ensure the main ID is synced with the current chart data
          // This re-establishes the main datum after data updates
          if (currentMainIdRef.current) {
            chartRef.current.updateMainId(currentMainIdRef.current);
          }

          // Get the currently selected cat's datum
          const mainDatum = chartRef.current.getMainDatum();
          if (mainDatum) {
            editTreeRef.current.addRelative(mainDatum);
          }
        } catch (error) {
          // If the datum can't be found (stale reference after tree update),
          // try to recover by updating the tree first
          console.warn("[FamilyChartTree] addRelative failed, attempting recovery:", error);
          try {
            chartRef.current.updateTree({ tree_position: "inherit" });
            const mainDatum = chartRef.current.getMainDatum();
            if (mainDatum && editTreeRef.current) {
              editTreeRef.current.addRelative(mainDatum);
            }
          } catch (retryError) {
            console.error("[FamilyChartTree] Failed to start add-relative mode:", retryError);
          }
        }
      }
    },
    stopAddRelative: () => {
      // Cancel the add-relative mode and clean up placeholder cards
      if (editTreeRef.current && chartRef.current) {
        // Access the addRelativeInstance to clean up
        const editTree = editTreeRef.current as unknown as {
          addRelativeInstance?: {
            is_active: boolean;
            cleanUp: (data?: unknown[]) => unknown[];
            datum: unknown;
            cancelCallback?: (datum: unknown) => void;
          };
        };

        if (editTree.addRelativeInstance?.is_active) {
          // Call cleanUp to remove placeholder cards from data
          editTree.addRelativeInstance.cleanUp();

          // Call cancelCallback if available
          if (editTree.addRelativeInstance.cancelCallback && editTree.addRelativeInstance.datum) {
            editTree.addRelativeInstance.cancelCallback(editTree.addRelativeInstance.datum);
          }

          // Update the tree to reflect changes
          chartRef.current.updateTree({ tree_position: "inherit" });
        }
      }
    },
    showFullGraph: () => {
      if (chartRef.current && rootId) {
        // Use updateMainId to reset to the root (founding mother)
        chartRef.current.updateMainId(rootId);
        chartRef.current.updateTree({ tree_position: "main_to_middle" });
        currentMainIdRef.current = rootId;
        onMainIdChangeRef.current?.(rootId);
      }
    },
    getCurrentMainId: () => currentMainIdRef.current,
  }), [rootId]);

  // Initialize chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartData.length === 0) return;

    // If chart exists and data count changed, do partial update
    if (chartRef.current && prevDataLengthRef.current > 0) {
      chartRef.current.updateData(chartData);
      chartRef.current.updateTree({ tree_position: "inherit" });
      prevDataLengthRef.current = chartData.length;
      return;
    }

    // Clear previous chart
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Create chart with proper spacing
    const chart = f3.createChart(container, chartData)
      .setTransitionTime(300)
      .setCardXSpacing(220)
      .setCardYSpacing(150);

    // Set orientation
    if (orientation === "horizontal") {
      chart.setOrientationHorizontal();
    } else {
      chart.setOrientationVertical();
    }

    // Setup card display - show name in two lines
    const f3Card = chart.setCardHtml()
      .setStyle("imageRect")
      .setCardDisplay([["first name"], ["last name"]])
      .setCardImageField("avatar")
      .setOnHoverPathToMain();

    cardRef.current = f3Card;

    // Setup editTree for add-relative functionality
    // We use setNoEdit() so clicking cards doesn't open the library's edit form
    const f3EditTree = chart.editTree()
      .setNoEdit();  // Don't show the library's edit form (we use our sidebar)

    editTreeRef.current = f3EditTree;

    // Card click: detect placeholder or real card, recenter + open sidebar
    f3Card.setOnCardClick((e: MouseEvent, d: TreeDatum) => {
      e.stopPropagation();

      // Check if this is an "add relative" placeholder card
      // Structure: d.data._new_rel_data = { rel_type, label, rel_id, other_parent_id? }
      const newRelData = (d.data as unknown as {
        _new_rel_data?: {
          rel_type: string;
          rel_id: string;
          other_parent_id?: string;
        }
      })._new_rel_data;

      if (newRelData && onAddRelativeRef.current) {
        // User clicked "Add Son", "Add Daughter", or "Add Spouse" placeholder
        // Find the parent cat from the chartData using rel_id
        const parentDatum = chartData.find(datum => datum.id === newRelData.rel_id);
        const parentCatData = parentDatum?.data as unknown as CustomData | undefined;

        if (parentCatData?.catData) {
          let relType: RelativeType = "son";
          if (newRelData.rel_type === "daughter") relType = "daughter";
          else if (newRelData.rel_type === "spouse") relType = "spouse";

          // Cancel the add-relative mode after generating
          if (editTreeRef.current?.isAddingRelative()) {
            // Get main datum to cancel properly
            const mainDatum = chartRef.current?.getMainDatum();
            if (mainDatum && editTreeRef.current) {
              // Clean up the add-relative placeholders
              const editTree = editTreeRef.current as unknown as {
                addRelativeInstance?: { cleanUp: () => void }
              };
              editTree.addRelativeInstance?.cleanUp();
            }
          }

          onAddRelativeRef.current(relType, parentCatData.catData, newRelData.other_parent_id);
        }
        return;
      }

      // Regular card click: call default handler (recenters tree) + open sidebar
      f3Card.onCardClickDefault(e, d);

      // If we were in add-relative mode, cancel it since user clicked a different card
      const editTree = editTreeRef.current as unknown as {
        addRelativeInstance?: {
          is_active: boolean;
          cleanUp: (data?: unknown[]) => unknown[];
        };
      } | null;
      if (editTree?.addRelativeInstance?.is_active) {
        editTree.addRelativeInstance.cleanUp();
        chart.updateTree({ tree_position: "inherit" });
        // Notify parent that edit mode was cancelled
        onEditModeChangedRef.current?.(false);
      }

      // Track new main ID
      const newMainId = d.data.id as string;
      currentMainIdRef.current = newMainId;
      onMainIdChangeRef.current?.(newMainId);

      // Open sidebar with cat data
      const customData = d.data.data as unknown as CustomData;
      if (customData?.catData) {
        onSelectCatRef.current(customData.catData);
      }
    });

    // Initial render
    chart.updateTree({ initial: true });

    // Set initial main ID using the correct API
    const mainDatum = chart.getMainDatum();
    if (mainDatum) {
      currentMainIdRef.current = mainDatum.id as string;
      onMainIdChangeRef.current?.(mainDatum.id as string);
    }

    chartRef.current = chart;
    prevDataLengthRef.current = chartData.length;

    return () => {
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
      chartRef.current = null;
      editTreeRef.current = null;
      cardRef.current = null;
      prevDataLengthRef.current = 0;
      currentMainIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]); // Only recreate on orientation change, chartData handled separately

  // Handle data updates (partial update) - triggers on any chartData change
  useEffect(() => {
    if (!chartRef.current) return;
    if (chartData.length === 0) return;
    // Skip initial render (handled by chart initialization)
    if (prevDataLengthRef.current === 0) return;

    chartRef.current.updateData(chartData);

    // Re-establish main ID after data update to prevent stale datum references
    // This ensures getMainDatum() returns a valid datum from the new data
    if (currentMainIdRef.current) {
      // Verify the main ID still exists in the new data
      const mainIdExists = chartData.some(d => d.id === currentMainIdRef.current);
      if (mainIdExists) {
        chartRef.current.updateMainId(currentMainIdRef.current);
      }
    }

    chartRef.current.updateTree({ tree_position: "inherit" });
    prevDataLengthRef.current = chartData.length;
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Generate a tree to see the visualization</p>
      </div>
    );
  }

  return (
    <div className="family-chart-wrapper h-full w-full relative overflow-hidden bg-black/20">
      <div
        ref={containerRef}
        className="f3 w-full h-full"
        id="FamilyChart"
      />
    </div>
  );
});

// Set display name for DevTools
FamilyChartTree.displayName = "FamilyChartTree";
