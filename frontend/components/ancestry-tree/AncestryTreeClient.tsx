"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Save, Loader2, ArrowLeft, Trees, Dices, History, Settings, RefreshCw, Palette, ArrowUpDown, ArrowLeftRight, Maximize2 } from "lucide-react";

import type {
  AncestryTreeCat,
  SerializedAncestryTree,
  TreeGenerationConfig,
  FoundingCoupleInput,
  OffspringOptions,
  CatName,
  PaletteMode,
} from "@/lib/ancestry-tree/types";
import { DEFAULT_TREE_CONFIG, DEFAULT_OFFSPRING_OPTIONS } from "@/lib/ancestry-tree/types";
import { AncestryTreeManager, type MutationPool } from "@/lib/ancestry-tree/treeManager";
import { useTreeWorker, type TreeProgress } from "@/lib/ancestry-tree/useTreeWorker";
import { generateRandomParamsV3, ensureSpriteMapper } from "@/lib/cat-v3/randomGenerator";
import { generateWarriorName } from "@/lib/ancestry-tree/nameGenerator";
import type { CatParams } from "@/lib/cat-v3/types";

import { FamilyChartTree, type TreeOrientation, type FamilyChartTreeRef, type RelativeType } from "./FamilyChartTree";
import { CatSidebar } from "./CatSidebar";
import { FoundingCoupleSelector } from "./FoundingCoupleSelector";
import { SaveTreeDialog } from "./SaveTreeDialog";
import { FoundingParentCard } from "./FoundingParentCard";
import { OffspringOptionsPanel } from "./OffspringOptionsPanel";
import { SliderWithInput } from "./SliderWithInput";
import "./family-chart-custom.css";

interface AncestryTreeClientProps {
  initialTree?: SerializedAncestryTree;
  initialHasPassword?: boolean;
}

type ViewMode = "config" | "tree";

interface ParentPreview {
  params: CatParams;
  name: CatName;
}

/**
 * Estimate the number of cats that will be generated.
 * Accounts for: children, outsider partners (~89% of partners), and multiple partners (20% get 2).
 */
function estimateCatCount(depth: number, avgChildren: number, partnerChance: number): number {
  const MULTIPLE_PARTNERS_CHANCE = 0.20;
  const OUTSIDER_CHANCE = 0.89; // 89% chance partner is a newly generated outsider
  const avgPartnersPerChild = 1 * (1 - MULTIPLE_PARTNERS_CHANCE) + 2 * MULTIPLE_PARTNERS_CHANCE; // 1.2

  let total = 2; // founding couple
  let couples = 1;

  for (let gen = 1; gen <= depth; gen++) {
    const children = Math.round(couples * avgChildren);
    total += children; // children born this generation

    // Each child has partnerChance to find a partner, averaging 1.2 partners each
    // ~89% of partners are outsiders (new cats added to the tree)
    const expectedPartnerRelationships = children * partnerChance * avgPartnersPerChild;
    const outsiderPartners = Math.round(expectedPartnerRelationships * OUTSIDER_CHANCE);
    total += outsiderPartners;

    // Number of couples for next generation
    couples = Math.round(expectedPartnerRelationships);
  }

  return total;
}

export function AncestryTreeClient({ initialTree, initialHasPassword }: AncestryTreeClientProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>(initialTree ? "tree" : "config");
  const [tree, setTree] = useState<SerializedAncestryTree | null>(initialTree ?? null);
  const [config, setConfig] = useState<TreeGenerationConfig>(
    initialTree?.config ?? DEFAULT_TREE_CONFIG
  );
  const [selectedCat, setSelectedCat] = useState<AncestryTreeCat | null>(null);
  const [hasPassword, setHasPassword] = useState(initialHasPassword ?? false);

  // Use Web Worker for tree generation
  const { generateTree: generateTreeWorker, progress: workerProgress, isGenerating: isWorkerGenerating, cancel: cancelWorker } = useTreeWorker();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSpriteMapperReady, setIsSpriteMapperReady] = useState(false);
  const [spriteMapperError, setSpriteMapperError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<TreeOrientation>("vertical");
  const [currentMainId, setCurrentMainId] = useState<string | null>(null);
  const [isEditingRelations, setIsEditingRelations] = useState(false);
  const [chartRedrawKey, setChartRedrawKey] = useState(0);
  const familyChartRef = useRef<FamilyChartTreeRef>(null);

  // Parent preview state for config screen
  const [motherPreview, setMotherPreview] = useState<ParentPreview | null>(null);
  const [fatherPreview, setFatherPreview] = useState<ParentPreview | null>(null);
  const [isRerollingMother, setIsRerollingMother] = useState(false);
  const [isRerollingFather, setIsRerollingFather] = useState(false);

  const mutationPoolRef = useRef<MutationPool>({
    pelts: [],
    colours: [],
    eyeColours: [],
    skinColours: [],
    whitePatches: [],
    spriteNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    accessories: [],
    scars: [],
    tortieMasks: [],
  });

  const saveTreeMutation = useMutation(api.ancestryTree.save);

  // Initialize sprite mapper on mount
  useEffect(() => {
    async function initSpriteMapper() {
      try {
        const mapper = await ensureSpriteMapper();
        mutationPoolRef.current = {
          pelts: mapper.getPeltNames().filter((p: string) => p !== "Tortie" && p !== "Calico"),
          colours: mapper.getColourOptions(),
          eyeColours: mapper.getEyeColours(),
          skinColours: mapper.getSkinColours(),
          whitePatches: mapper.getWhitePatches(),
          spriteNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          accessories: mapper.getAccessories(),
          scars: mapper.getScars(),
          tortieMasks: mapper.getTortieMasks(),
        };
        setIsSpriteMapperReady(true);
        setSpriteMapperError(null);
      } catch (error) {
        console.error("Failed to initialize sprite mapper:", error);
        setSpriteMapperError("Failed to load sprite data. Please refresh the page.");
      }
    }
    initSpriteMapper();
  }, []);

  const handleConfigChange = useCallback((newConfig: TreeGenerationConfig) => {
    setConfig(newConfig);
  }, []);

  const handleOffspringOptionsChange = useCallback((options: OffspringOptions) => {
    setConfig((prev) => ({ ...prev, offspringOptions: options }));
  }, []);

  const generateTreeFromCouple = useCallback(
    async (input: FoundingCoupleInput) => {
      setIsGenerating(true);
      try {
        // Use Web Worker for non-blocking generation
        const serialized = await generateTreeWorker(
          config,
          input,
          mutationPoolRef.current
        );
        setTree(serialized);
        setViewMode("tree");
      } catch (error) {
        console.error("Failed to generate tree:", error);
      } finally {
        setIsGenerating(false);
      }
    },
    [config, generateTreeWorker]
  );

  // Generate base tree (founding couple only, no descendants)
  const generateBaseTreeFromCouple = useCallback(
    (input: FoundingCoupleInput) => {
      setIsGenerating(true);
      try {
        const manager = new AncestryTreeManager(mutationPoolRef.current);
        manager.setConfig(config);
        manager.setName("Unnamed Tree");
        manager.initializeFoundingCouple(input);
        // Don't call generateFullTree() - just keep the founding couple

        const serialized = manager.serialize();
        setTree(serialized);
        setViewMode("tree");
      } catch (error) {
        console.error("Failed to generate base tree:", error);
      } finally {
        setIsGenerating(false);
      }
    },
    [config]
  );

  // Generate base tree from preview parents
  const handleGenerateBaseFromPreview = useCallback(() => {
    if (!motherPreview || !fatherPreview) return;
    generateBaseTreeFromCouple({
      mother: { params: motherPreview.params, name: motherPreview.name },
      father: { params: fatherPreview.params, name: fatherPreview.name },
    });
  }, [motherPreview, fatherPreview, generateBaseTreeFromCouple]);

  // Pick a random palette from enabled modes
  const getRandomPaletteMode = useCallback(() => {
    const modes = config.paletteModes;
    // Treat empty array or undefined as no special modes - fall back to 'off'
    if (!modes || modes.length === 0) {
      return 'off';
    }
    return modes[Math.floor(Math.random() * modes.length)];
  }, [config.paletteModes]);

  // Reroll mother preview
  const handleRerollMother = useCallback(async () => {
    if (!isSpriteMapperReady) return;
    setIsRerollingMother(true);
    try {
      const params = await generateRandomParamsV3({
        experimentalColourMode: getRandomPaletteMode(),
      });
      const name = generateWarriorName("warrior");
      setMotherPreview({ params, name });
    } catch (error) {
      console.error("Failed to generate mother:", error);
    } finally {
      setIsRerollingMother(false);
    }
  }, [isSpriteMapperReady, getRandomPaletteMode]);

  // Reroll father preview
  const handleRerollFather = useCallback(async () => {
    if (!isSpriteMapperReady) return;
    setIsRerollingFather(true);
    try {
      const params = await generateRandomParamsV3({
        experimentalColourMode: getRandomPaletteMode(),
      });
      const name = generateWarriorName("warrior");
      setFatherPreview({ params, name });
    } catch (error) {
      console.error("Failed to generate father:", error);
    } finally {
      setIsRerollingFather(false);
    }
  }, [isSpriteMapperReady, getRandomPaletteMode]);

  // Generate random couple for preview
  const handleGenerateRandomCouple = useCallback(async () => {
    if (!isSpriteMapperReady) return;
    setIsRerollingMother(true);
    setIsRerollingFather(true);
    try {
      // Each parent gets a random palette from enabled modes
      const [motherParams, fatherParams] = await Promise.all([
        generateRandomParamsV3({ experimentalColourMode: getRandomPaletteMode() }),
        generateRandomParamsV3({ experimentalColourMode: getRandomPaletteMode() }),
      ]);
      setMotherPreview({ params: motherParams, name: generateWarriorName("warrior") });
      setFatherPreview({ params: fatherParams, name: generateWarriorName("warrior") });
    } catch (error) {
      console.error("Failed to generate random couple:", error);
    } finally {
      setIsRerollingMother(false);
      setIsRerollingFather(false);
    }
  }, [isSpriteMapperReady, getRandomPaletteMode]);

  // Generate tree from preview parents
  const handleGenerateFromPreview = useCallback(async () => {
    if (!motherPreview || !fatherPreview) return;
    await generateTreeFromCouple({
      mother: { params: motherPreview.params, name: motherPreview.name },
      father: { params: fatherPreview.params, name: fatherPreview.name },
    });
  }, [motherPreview, fatherPreview, generateTreeFromCouple]);

  const handleSelectFromHistory = useCallback(() => {
    setShowHistoryPicker(true);
  }, []);

  const handleHistorySelect = useCallback(
    async (input: FoundingCoupleInput) => {
      setShowHistoryPicker(false);
      await generateTreeFromCouple(input);
    },
    [generateTreeFromCouple]
  );

  const handleRegenerate = useCallback(async () => {
    if (!tree || !isSpriteMapperReady) return;

    // Extract founding couple from current tree
    const foundingMother = tree.cats.find((c) => c.id === tree.foundingMotherId);
    const foundingFather = tree.cats.find((c) => c.id === tree.foundingFatherId);

    if (!foundingMother || !foundingFather) {
      console.error("Founding couple not found in tree");
      return;
    }

    const foundingCouple: FoundingCoupleInput = {
      mother: {
        params: foundingMother.params,
        name: foundingMother.name,
        historyProfileId: foundingMother.historyProfileId,
      },
      father: {
        params: foundingFather.params,
        name: foundingFather.name,
        historyProfileId: foundingFather.historyProfileId,
      },
    };

    setIsGenerating(true);
    try {
      // Use Web Worker for non-blocking generation
      const serialized = await generateTreeWorker(
        config,
        foundingCouple,
        mutationPoolRef.current
      );
      setTree(serialized);
    } catch (error) {
      console.error("Failed to regenerate tree:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [tree, config, isSpriteMapperReady, generateTreeWorker]);

  const handleCatClick = useCallback((cat: AncestryTreeCat) => {
    setSelectedCat(cat);
  }, []);

  const handleSelectCatFromPopup = useCallback((cat: AncestryTreeCat) => {
    setSelectedCat(cat);
  }, []);

  const handleReplacePartner = useCallback(
    async (cat: AncestryTreeCat) => {
      if (!tree || !isSpriteMapperReady) return;

      setIsGenerating(true);
      try {
        const newPartnerParams = await generateRandomParamsV3();
        const manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);
        manager.replacePartner(cat.id, newPartnerParams);

        const serialized = manager.serialize();
        setTree(serialized);
        setSelectedCat(null);
      } catch (error) {
        console.error("Failed to replace partner:", error);
      } finally {
        setIsGenerating(false);
      }
    },
    [tree, isSpriteMapperReady]
  );

  // Assign a random partner to a cat without one
  const handleAssignRandomPartner = useCallback(
    async (cat: AncestryTreeCat) => {
      if (!tree || !isSpriteMapperReady) return;

      setIsGenerating(true);
      try {
        const newPartnerParams = await generateRandomParamsV3();
        const manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);

        // Assign partner without generating children
        manager.assignPartner(cat.id, newPartnerParams, undefined, false);

        const serialized = manager.serialize();
        setTree(serialized);

        // Update selectedCat with fresh data from the new tree (don't close sidebar)
        const updatedCat = serialized.cats.find((c) => c.id === cat.id);
        if (updatedCat) {
          setSelectedCat(updatedCat);
        }
      } catch (error) {
        console.error("Failed to assign partner:", error);
      } finally {
        setIsGenerating(false);
      }
    },
    [tree, isSpriteMapperReady]
  );

  // Add a child to a couple with a specific partner
  const handleAddChildWithPartner = useCallback(
    async (cat: AncestryTreeCat, partnerId: string, forcedGender?: "M" | "F") => {
      if (!tree || !isSpriteMapperReady) return;

      setIsGenerating(true);
      let manager: AncestryTreeManager | null = null;
      let originalConfig: ReturnType<AncestryTreeManager["getTree"]>["config"] | null = null;
      try {
        manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);

        // Get fresh cat data from the deserialized tree (not from potentially stale state)
        const currentCat = manager.getCat(cat.id);
        if (!currentCat) {
          console.error("Cat not found");
          setIsGenerating(false);
          return;
        }

        // Temporarily set config to generate exactly 1 child
        originalConfig = { ...manager.getTree().config };
        manager.setConfig({ minChildren: 1, maxChildren: 1 });

        // Determine mother and father based on the specified partner
        const motherId = currentCat.gender === "F" ? currentCat.id : partnerId;
        const fatherId = currentCat.gender === "M" ? currentCat.id : partnerId;

        // Generate one child with optional forced gender
        manager.generateOffspring(motherId, fatherId, currentCat.generation + 1, forcedGender);

        const serialized = manager.serialize();
        setTree(serialized);

        // Update selectedCat with fresh data (so sidebar shows updated children)
        const updatedCat = serialized.cats.find((c) => c.id === cat.id);
        if (updatedCat) {
          setSelectedCat(updatedCat);
        }
      } catch (error) {
        console.error("Failed to add child:", error);
      } finally {
        // Always restore original config if it was changed
        if (manager && originalConfig) {
          manager.setConfig(originalConfig);
        }
        setIsGenerating(false);
      }
    },
    [tree, isSpriteMapperReady]
  );

  // Handle mainId changes from the chart
  const handleMainIdChange = useCallback((mainId: string | null) => {
    setCurrentMainId(mainId);
  }, []);

  // Handle edit mode changes from the chart (e.g., when clicking a different card cancels edit mode)
  const handleEditModeChanged = useCallback((isEditing: boolean) => {
    setIsEditingRelations(isEditing);
  }, []);

  // Handle edit relations button click - toggles add-relative mode on graph
  const handleEditRelations = useCallback(() => {
    if (isEditingRelations) {
      // Stop editing - cancel the add-relative mode
      setIsEditingRelations(false);
      familyChartRef.current?.stopAddRelative();
    } else {
      // Start editing
      setIsEditingRelations(true);
      familyChartRef.current?.startAddRelative();
    }
  }, [isEditingRelations]);

  // Handle show full graph button click - forces complete chart redraw
  const handleShowFullGraph = useCallback(() => {
    // Reset to root cat and force chart recreation
    setCurrentMainId(tree?.foundingMotherId ?? null);
    setChartRedrawKey((k) => k + 1);
  }, [tree?.foundingMotherId]);

  // Handle adding a parent (father or mother) to a cat
  const handleAddParent = useCallback(
    async (cat: AncestryTreeCat, parentType: 'father' | 'mother') => {
      if (!tree || !isSpriteMapperReady) return;

      setIsGenerating(true);
      try {
        const newParentParams = await generateRandomParamsV3();
        const manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);

        manager.addParent(cat.id, newParentParams, parentType);

        const serialized = manager.serialize();
        setTree(serialized);

        // Update selectedCat with fresh data
        const updatedCat = serialized.cats.find((c) => c.id === cat.id);
        if (updatedCat) {
          setSelectedCat(updatedCat);
        }
      } catch (error) {
        console.error(`Failed to add ${parentType}:`, error);
      } finally {
        setIsGenerating(false);
      }
    },
    [tree, isSpriteMapperReady]
  );

  // Handle add relative from graph placeholder click
  const handleAddRelativeFromGraph = useCallback(
    async (type: RelativeType, parentCat: AncestryTreeCat, otherParentId?: string) => {
      // Stop edit mode after adding
      setIsEditingRelations(false);

      if (type === "spouse") {
        // Add new spouse (supports multiple spouses)
        await handleAssignRandomPartner(parentCat);
      } else if (type === "father" || type === "mother") {
        // Add a parent to the cat
        await handleAddParent(parentCat, type);
      } else {
        // Add child - respect the son/daughter choice
        const forcedGender: "M" | "F" = type === "son" ? "M" : "F";

        // Check if otherParentId references a valid existing spouse
        let validPartnerId: string | undefined;

        if (otherParentId && tree) {
          // Check if otherParentId exists in the tree
          const partnerExists = tree.cats.some(c => c.id === otherParentId);
          if (partnerExists) {
            validPartnerId = otherParentId;
          }
        }

        if (validPartnerId) {
          // Specific spouse indicated - add child with that spouse
          await handleAddChildWithPartner(parentCat, validPartnerId, forcedGender);
        } else {
          // No specific spouse - create new spouse first, then add child
          if (!tree || !isSpriteMapperReady) return;

          setIsGenerating(true);
          try {
            const newPartnerParams = await generateRandomParamsV3();
            const manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);

            // First, assign a partner (without generating offspring)
            manager.assignPartner(parentCat.id, newPartnerParams, undefined, false);

            // Then generate a child with the correct gender
            const currentCat = manager.getCat(parentCat.id);
            if (currentCat && currentCat.partnerIds.length > 0) {
              const newPartnerId = currentCat.partnerIds[currentCat.partnerIds.length - 1];
              const motherId = currentCat.gender === "F" ? currentCat.id : newPartnerId;
              const fatherId = currentCat.gender === "M" ? currentCat.id : newPartnerId;

              // Temporarily set config to generate exactly 1 child
              const originalConfig = { ...manager.getTree().config };
              manager.setConfig({ minChildren: 1, maxChildren: 1 });
              manager.generateOffspring(motherId, fatherId, currentCat.generation + 1, forcedGender);
              manager.setConfig(originalConfig);
            }

            const serialized = manager.serialize();
            setTree(serialized);

            // Update selectedCat with fresh data
            const updatedCat = serialized.cats.find((c) => c.id === parentCat.id);
            if (updatedCat) {
              setSelectedCat(updatedCat);
            }
          } catch (error) {
            console.error("Failed to add spouse and child:", error);
          } finally {
            setIsGenerating(false);
          }
        }
      }
    },
    [handleAssignRandomPartner, handleAddChildWithPartner, handleAddParent, tree, isSpriteMapperReady]
  );

  // Handle pose change for a cat
  const handleChangePose = useCallback(
    (cat: AncestryTreeCat, newSpriteNumber: number) => {
      if (!tree) return;

      // Update the cat's sprite number in the tree
      const updatedCats = tree.cats.map((c) =>
        c.id === cat.id
          ? { ...c, params: { ...c.params, spriteNumber: newSpriteNumber } }
          : c
      );

      setTree({ ...tree, cats: updatedCats });

      // Update selectedCat if it's the same cat
      if (selectedCat?.id === cat.id) {
        setSelectedCat({
          ...cat,
          params: { ...cat.params, spriteNumber: newSpriteNumber },
        });
      }
    },
    [tree, selectedCat]
  );

  const handleSaveTree = useCallback(
    async (name: string, creatorName: string, password?: string): Promise<{ success: boolean; error?: string; slug?: string; isNew?: boolean }> => {
      if (!tree) return { success: false, error: "No tree to save" };

      const updatedTree = { ...tree, name, creatorName };
      try {
        const result = await saveTreeMutation({
          slug: updatedTree.slug,
          name: updatedTree.name,
          foundingMotherId: updatedTree.foundingMotherId,
          foundingFatherId: updatedTree.foundingFatherId,
          cats: updatedTree.cats,
          config: updatedTree.config,
          creatorName: updatedTree.creatorName,
          password,
        });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        setTree(updatedTree);

        // If password was set on new tree, track it
        if (password && result.isNew) {
          setHasPassword(true);
        }

        // Update URL to include the slug using Next.js router
        const newUrl = `/projects/warrior-cats/ancestry-tree/${updatedTree.slug}`;
        router.replace(newUrl);

        return { success: true, slug: result.slug, isNew: result.isNew };
      } catch (error) {
        console.error("Failed to save tree:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },
    [tree, saveTreeMutation, router]
  );

  const handleBackToConfig = useCallback(() => {
    setViewMode("config");
  }, []);

  // Render config screen
  if (viewMode === "config" || !tree) {
    return (
      <div className="w-full">
        {spriteMapperError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="text-red-400 text-lg font-medium">Failed to load sprite data</div>
            <p className="text-muted-foreground text-sm">{spriteMapperError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        ) : !isSpriteMapperReady ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 className="size-8 animate-spin text-amber-500" />
            <span className="text-muted-foreground">Loading sprite data...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Founding Couple */}
            <div className="space-y-6">
              {/* Founding Couple Section */}
              <div className="glass-card p-6 space-y-6">
                <h2 className="font-semibold text-xl flex items-center gap-2">
                  <span className="text-pink-400">♀</span>
                  <span className="text-blue-400">♂</span>
                  Founding Couple
                </h2>

                <div className="flex justify-center items-center gap-8">
                  <FoundingParentCard
                    gender="F"
                    params={motherPreview?.params ?? null}
                    name={motherPreview?.name ?? null}
                    onReroll={handleRerollMother}
                    isLoading={isRerollingMother}
                  />
                  <div className="flex items-center text-4xl text-pink-500">♥</div>
                  <FoundingParentCard
                    gender="M"
                    params={fatherPreview?.params ?? null}
                    name={fatherPreview?.name ?? null}
                    onReroll={handleRerollFather}
                    isLoading={isRerollingFather}
                  />
                </div>

                <div className="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleGenerateRandomCouple}
                    disabled={isGenerating || isRerollingMother || isRerollingFather}
                    className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                  >
                    <Dices className="size-4" />
                    Random Couple
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectFromHistory}
                    disabled={isGenerating}
                    className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    <History className="size-4" />
                    From History
                  </button>
                </div>
              </div>

              {/* Generation Progress or Generate Button */}
              {(isGenerating || isWorkerGenerating) && workerProgress ? (
                <div className="glass-card p-6 text-center space-y-4">
                  <Loader2 className="size-8 animate-spin mx-auto text-amber-500" />
                  <p className="text-lg font-medium">
                    Generating Generation {workerProgress.generation} of {workerProgress.total}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {workerProgress.catCount.toLocaleString()} cats created...
                  </p>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${(workerProgress.generation / workerProgress.total) * 100}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={cancelWorker}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Tree Size Estimate */}
                  {(() => {
                    const avgChildren = (config.minChildren + config.maxChildren) / 2;
                    const estimated = estimateCatCount(config.depth, avgChildren, config.partnerChance ?? 1);
                    const isLarge = estimated > 1000;
                    const isHuge = estimated > 5000;
                    const isTooLarge = estimated > 5000;
                    return (
                      <>
                        <div className={`text-center text-sm ${isHuge ? "text-red-400" : isLarge ? "text-amber-400" : "text-muted-foreground"}`}>
                          {isHuge ? (
                            <span>🚫 ~{estimated.toLocaleString()} cats — too large to render, will not load</span>
                          ) : isLarge ? (
                            <span>⚠️ ~{estimated.toLocaleString()} cats — may not load properly</span>
                          ) : (
                            <span>~{estimated.toLocaleString()} cats estimated</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateFromPreview}
                          disabled={!motherPreview || !fatherPreview || isGenerating || isWorkerGenerating || isTooLarge}
                          className="w-full flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-5 text-lg font-semibold text-white transition-all hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                          {isGenerating || isWorkerGenerating ? (
                            <Loader2 className="size-6 animate-spin" />
                          ) : (
                            <Trees className="size-6" />
                          )}
                          {isTooLarge ? "Tree Too Large" : "Generate Ancestry Tree"}
                        </button>
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={handleGenerateBaseFromPreview}
                    disabled={!motherPreview || !fatherPreview || isGenerating || isWorkerGenerating}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate Base Tree (Parents Only)
                  </button>
                </div>
              )}
            </div>

            {/* Right Column - Settings */}
            <div className="space-y-6">
              {/* Tree Settings */}
              <div className="glass-card p-6 space-y-5">
                <h2 className="font-semibold text-xl flex items-center gap-2">
                  <Settings className="size-5 text-amber-500" />
                  Tree Settings
                </h2>

                <div className="space-y-5">
                  <SliderWithInput
                    label="Generations"
                    value={config.depth}
                    onChange={(val) => handleConfigChange({ ...config, depth: val })}
                    min={1}
                    max={30}
                    description="Higher values create larger trees exponentially"
                  />

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-muted-foreground">Male Ratio</label>
                      <span className="text-sm font-medium tabular-nums">{Math.round(config.genderRatio * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(config.genderRatio * 100)}
                      onChange={(e) =>
                        handleConfigChange({
                          ...config,
                          genderRatio: parseInt(e.target.value, 10) / 100,
                        })
                      }
                      className="slider-amber w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <SliderWithInput
                      label="Min Children"
                      value={config.minChildren}
                      onChange={(val) =>
                        handleConfigChange({
                          ...config,
                          minChildren: val,
                          maxChildren: Math.max(config.maxChildren, val),
                        })
                      }
                      min={0}
                      max={50}
                    />

                    <SliderWithInput
                      label="Max Children"
                      value={config.maxChildren}
                      onChange={(val) =>
                        handleConfigChange({
                          ...config,
                          maxChildren: Math.max(val, config.minChildren),
                        })
                      }
                      min={1}
                      max={50}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-muted-foreground">Partner Chance</label>
                      <span className="text-sm font-medium tabular-nums">{Math.round((config.partnerChance ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((config.partnerChance ?? 1) * 100)}
                      onChange={(e) =>
                        handleConfigChange({
                          ...config,
                          partnerChance: parseInt(e.target.value, 10) / 100,
                        })
                      }
                      className="slider-amber w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Chance for each female to find a partner and have children
                    </p>
                  </div>
                </div>
              </div>

              {/* Color Palette Mode */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Palette className="size-4 text-purple-400" />
                  Color Palettes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(["off", "mood", "bold", "darker", "blackout"] as PaletteMode[]).map((mode) => {
                    const modes = config.paletteModes ?? ["off"];
                    const isSelected = modes.includes(mode);
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          let newModes: PaletteMode[];
                          if (isSelected) {
                            // Remove mode, but keep at least one
                            newModes = modes.filter((m) => m !== mode);
                            if (newModes.length === 0) newModes = ["off"];
                          } else {
                            // Add mode
                            newModes = [...modes, mode];
                          }
                          handleConfigChange({ ...config, paletteModes: newModes });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isSelected
                            ? "bg-purple-500 text-white"
                            : "bg-white/10 hover:bg-white/20"
                        }`}
                      >
                        {mode === "off" ? "Classic" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select multiple palettes - each cat picks randomly from enabled options.
                </p>
              </div>

              {/* Offspring Options */}
              <OffspringOptionsPanel
                options={config.offspringOptions ?? DEFAULT_OFFSPRING_OPTIONS}
                onChange={handleOffspringOptionsChange}
              />
            </div>
          </div>
        )}

        {/* History Picker Modal */}
        {showHistoryPicker && (
          <FoundingCoupleSelector
            onSelect={handleHistorySelect}
            onClose={() => setShowHistoryPicker(false)}
          />
        )}
      </div>
    );
  }

  // Render tree view - fixed viewport, no page scrolling
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          type="button"
          onClick={handleBackToConfig}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="size-4" />
          Back to Config
        </button>

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {tree.name} &bull; {tree.cats.length} cats
          </span>

          {/* Orientation Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setOrientation("vertical")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                orientation === "vertical"
                  ? "bg-amber-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              }`}
              title="Vertical layout"
            >
              <ArrowUpDown className="size-3.5" />
              Vertical
            </button>
            <button
              type="button"
              onClick={() => setOrientation("horizontal")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                orientation === "horizontal"
                  ? "bg-amber-600 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              }`}
              title="Horizontal layout"
            >
              <ArrowLeftRight className="size-3.5" />
              Horizontal
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom to Parents button - always visible */}
          <button
            type="button"
            onClick={handleShowFullGraph}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            title="Zoom to the founding couple"
          >
            <Maximize2 className="size-4" />
            Zoom to Parents
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isGenerating ? "animate-spin" : ""}`} />
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <Save className="size-4" />
            Save Tree
          </button>
        </div>
      </div>

      {/* Tree Visualization */}
      <div className="flex-1 glass-card m-4 overflow-hidden">
        <FamilyChartTree
          key={chartRedrawKey}
          ref={familyChartRef}
          tree={tree}
          orientation={orientation}
          onSelectCat={handleCatClick}
          onAddRelative={handleAddRelativeFromGraph}
          onMainIdChange={handleMainIdChange}
          onEditModeChanged={handleEditModeChanged}
        />
      </div>

      {/* Sidebar for cat details */}
      <CatSidebar
        cat={selectedCat}
        isOpen={selectedCat !== null}
        onClose={() => setSelectedCat(null)}
        onEditRelations={handleEditRelations}
        isEditingRelations={isEditingRelations}
        onChangePose={handleChangePose}
      />

      {showSaveDialog && tree && (
        <SaveTreeDialog
          currentName={tree.name}
          currentCreator={tree.creatorName}
          currentSlug={tree.slug}
          hasPassword={hasPassword}
          onSave={handleSaveTree}
          onClose={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
