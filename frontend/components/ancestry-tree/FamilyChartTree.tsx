"use client";

import { useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import * as f3 from "family-chart";
import type { TreeDatum } from "family-chart";
import "family-chart/styles/family-chart.css";
import "./family-chart-custom.css";

import type { AncestryTreeCat, SerializedAncestryTree } from "@/lib/ancestry-tree/types";
import { convertToFamilyChartFormat } from "@/lib/ancestry-tree/familyChartAdapter";

export type TreeOrientation = "vertical" | "horizontal";

export type RelativeType = "son" | "daughter" | "spouse" | "father" | "mother";

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

  // Stable refs for callbacks and data - synced via useEffect to comply with React rules
  const onSelectCatRef = useRef(onSelectCat);
  const onAddRelativeRef = useRef(onAddRelative);
  const onMainIdChangeRef = useRef(onMainIdChange);
  const onEditModeChangedRef = useRef(onEditModeChanged);
  const chartDataRef = useRef(chartData);

  useEffect(() => {
    onSelectCatRef.current = onSelectCat;
    onAddRelativeRef.current = onAddRelative;
    onMainIdChangeRef.current = onMainIdChange;
    onEditModeChangedRef.current = onEditModeChanged;
  }, [onSelectCat, onAddRelative, onMainIdChange, onEditModeChanged]);

  // Keep chartData ref current for use in event handlers
  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  // Find root cat ID
  const rootId = useMemo(() => {
    // The founding mother is typically the "root" for full graph view
    return tree.foundingMotherId;
  }, [tree.foundingMotherId]);

  // Helper function to safely get the main datum
  const safeGetMainDatum = (): ReturnType<ReturnType<typeof f3.createChart>["getMainDatum"]> | null => {
    if (!chartRef.current) return null;
    try {
      return chartRef.current.getMainDatum();
    } catch {
      // getMainDatum() throws "Main datum not found" when no main datum exists
      return null;
    }
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startAddRelative: () => {
      // Use the editTree API to show add-relative options on the graph
      if (!editTreeRef.current || !chartRef.current) return;

      // Step 1: Ensure the main ID is synced with the current chart data
      if (currentMainIdRef.current) {
        try {
          chartRef.current.updateMainId(currentMainIdRef.current);
        } catch {
          // updateMainId can fail if the ID doesn't exist in the data
        }
      }

      // Step 2: Try to get the main datum
      let mainDatum = safeGetMainDatum();

      // Step 3: If no main datum, try updating the tree first
      if (!mainDatum) {
        try {
          chartRef.current.updateTree({ tree_position: "inherit" });
          mainDatum = safeGetMainDatum();
        } catch {
          // Tree update failed
        }
      }

      // Step 4: If still no main datum, fall back to first cat in data
      if (!mainDatum && chartData.length > 0) {
        const fallbackId = currentMainIdRef.current || chartData[0].id;
        try {
          chartRef.current.updateMainId(fallbackId);
          chartRef.current.updateTree({ tree_position: "main_to_middle" });
          mainDatum = safeGetMainDatum();
          if (mainDatum) {
            currentMainIdRef.current = fallbackId;
            onMainIdChangeRef.current?.(fallbackId);
          }
        } catch {
          // Fallback also failed
        }
      }

      // Step 5: Start add-relative mode if we have a valid datum
      if (mainDatum && editTreeRef.current) {
        try {
          editTreeRef.current.addRelative(mainDatum);
        } catch (error) {
          console.error("[FamilyChartTree] Failed to start add-relative mode:", error);
        }
      }
    },
    stopAddRelative: () => {
      // Cancel the add-relative mode and clean up placeholder cards
      if (editTreeRef.current && chartRef.current) {
        // Access the addRelativeInstance to properly cancel
        const editTree = editTreeRef.current as unknown as {
          addRelativeInstance?: {
            is_active: boolean;
            onCancel: () => void;
          };
        };

        if (editTree.addRelativeInstance?.is_active) {
          // Call onCancel to properly reset state and clean up placeholders
          editTree.addRelativeInstance.onCancel();
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
  }), [rootId, chartData]);

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
      .setCardYSpacing(150)
      .setSingleParentEmptyCard(false);  // Hide empty spouse placeholder cards (the "ADD" cards)

    // Set orientation
    if (orientation === "horizontal") {
      chart.setOrientationHorizontal();
    } else {
      chart.setOrientationVertical();
    }

    // Setup card display - show full name on one line
    const f3Card = chart.setCardHtml()
      .setStyle("imageRect")
      .setCardDisplay([["full name"]])
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
        // Find the parent cat from the current chartData using rel_id
        // Note: Use chartDataRef.current to get the latest data (not stale closure)
        const currentChartData = chartDataRef.current;
        const parentDatum = currentChartData.find(datum => datum.id === newRelData.rel_id);
        const parentCatData = parentDatum?.data as unknown as CustomData | undefined;

        if (parentCatData?.catData) {
          // Map rel_type from library to our RelativeType
          let relType: RelativeType = "son";
          if (newRelData.rel_type === "daughter") relType = "daughter";
          else if (newRelData.rel_type === "spouse") relType = "spouse";
          else if (newRelData.rel_type === "father") relType = "father";
          else if (newRelData.rel_type === "mother") relType = "mother";

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
      // IMPORTANT: Must call onCancel() not just cleanUp() to properly reset is_active state
      const editTree = editTreeRef.current as unknown as {
        addRelativeInstance?: {
          is_active: boolean;
          onCancel: () => void;
        };
      } | null;
      if (editTree?.addRelativeInstance?.is_active) {
        editTree.addRelativeInstance.onCancel();
        // Note: onCancel() already calls cleanUp() and resets is_active
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

    // Initial render - center on founding mother for better initial view
    // This prevents the "zoomed out too far" issue with large trees
    if (rootId) {
      chart.updateMainId(rootId);
      chart.updateTree({ initial: true, tree_position: "main_to_middle" });
      currentMainIdRef.current = rootId;
      onMainIdChangeRef.current?.(rootId);
    } else {
      chart.updateTree({ initial: true });
      // Set initial main ID using the correct API
      const mainDatum = chart.getMainDatum();
      if (mainDatum) {
        currentMainIdRef.current = mainDatum.id as string;
        onMainIdChangeRef.current?.(mainDatum.id as string);
      }
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
