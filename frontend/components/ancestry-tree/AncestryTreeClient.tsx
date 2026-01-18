"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import { generateRandomParamsV3, ensureSpriteMapper } from "@/lib/cat-v3/randomGenerator";
import { generateWarriorName } from "@/lib/ancestry-tree/nameGenerator";
import type { CatParams } from "@/lib/cat-v3/types";

import { FamilyChartTree, type TreeOrientation, type FamilyChartTreeRef, type RelativeType } from "./FamilyChartTree";
import { CatSidebar } from "./CatSidebar";
import { FoundingCoupleSelector } from "./FoundingCoupleSelector";
import { SaveTreeDialog } from "./SaveTreeDialog";
import { FoundingParentCard } from "./FoundingParentCard";
import { OffspringOptionsPanel } from "./OffspringOptionsPanel";

interface AncestryTreeClientProps {
  initialTree?: SerializedAncestryTree;
}

type ViewMode = "config" | "tree";

interface ParentPreview {
  params: CatParams;
  name: CatName;
}

export function AncestryTreeClient({ initialTree }: AncestryTreeClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialTree ? "tree" : "config");
  const [tree, setTree] = useState<SerializedAncestryTree | null>(initialTree ?? null);
  const [config, setConfig] = useState<TreeGenerationConfig>(
    initialTree?.config ?? DEFAULT_TREE_CONFIG
  );
  const [selectedCat, setSelectedCat] = useState<AncestryTreeCat | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSpriteMapperReady, setIsSpriteMapperReady] = useState(false);
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
      } catch (error) {
        console.error("Failed to initialize sprite mapper:", error);
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
        const manager = new AncestryTreeManager(mutationPoolRef.current);
        manager.setConfig(config);
        manager.setName("Unnamed Tree");

        manager.initializeFoundingCouple(input);
        manager.generateFullTree();

        const serialized = manager.serialize();
        setTree(serialized);
        setViewMode("tree");
      } catch (error) {
        console.error("Failed to generate tree:", error);
      } finally {
        setIsGenerating(false);
      }
    },
    [config]
  );

  // Pick a random palette from enabled modes
  const getRandomPaletteMode = useCallback(() => {
    const modes = config.paletteModes ?? ['off'];
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

    setIsGenerating(true);
    try {
      const manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);
      manager.setConfig(config);
      manager.generateFullTree();
      const serialized = manager.serialize();
      setTree(serialized);
    } catch (error) {
      console.error("Failed to regenerate tree:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [tree, config, isSpriteMapperReady]);

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
    async (cat: AncestryTreeCat, partnerId: string) => {
      if (!tree || !isSpriteMapperReady) return;

      setIsGenerating(true);
      try {
        const manager = AncestryTreeManager.deserialize(tree, mutationPoolRef.current);

        // Get fresh cat data from the deserialized tree (not from potentially stale state)
        const currentCat = manager.getCat(cat.id);
        if (!currentCat) {
          console.error("Cat not found");
          setIsGenerating(false);
          return;
        }

        // Temporarily set config to generate exactly 1 child
        const originalConfig = { ...manager.getTree().config };
        manager.setConfig({ minChildren: 1, maxChildren: 1 });

        // Determine mother and father based on the specified partner
        const motherId = currentCat.gender === "F" ? currentCat.id : partnerId;
        const fatherId = currentCat.gender === "M" ? currentCat.id : partnerId;

        // Generate one child
        manager.generateOffspring(motherId, fatherId, currentCat.generation + 1);

        // Restore original config
        manager.setConfig(originalConfig);

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

  // Handle add relative from graph placeholder click
  const handleAddRelativeFromGraph = useCallback(
    async (type: RelativeType, parentCat: AncestryTreeCat, otherParentId?: string) => {
      // Stop edit mode after adding
      setIsEditingRelations(false);

      if (type === "spouse") {
        // Add new spouse (supports multiple spouses)
        await handleAssignRandomPartner(parentCat);
      } else {
        // Add child (son or daughter are handled the same - gender is random)
        const partnerIds = parentCat.partnerIds ?? [];

        // The library's other_parent_id might not match our cat IDs directly
        // Check if it's a valid cat ID in the tree, otherwise fall back to parent's partners
        let validPartnerId: string | undefined;

        if (otherParentId && tree) {
          // Check if otherParentId exists in the tree
          const partnerExists = tree.cats.some(c => c.id === otherParentId);
          if (partnerExists) {
            validPartnerId = otherParentId;
          }
        }

        if (validPartnerId) {
          await handleAddChildWithPartner(parentCat, validPartnerId);
        } else if (partnerIds.length === 1) {
          // Single partner - use it
          await handleAddChildWithPartner(parentCat, partnerIds[0]);
        } else if (partnerIds.length > 1) {
          // Multiple partners but invalid otherParentId - use the last partner as fallback
          // TODO: Better heuristic for determining which partner based on graph position
          console.warn("[handleAddRelativeFromGraph] Could not determine partner, using last partner");
          await handleAddChildWithPartner(parentCat, partnerIds[partnerIds.length - 1]);
        }
      }
    },
    [handleAssignRandomPartner, handleAddChildWithPartner, tree]
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
    async (name: string, creatorName: string) => {
      if (!tree) return;

      const updatedTree = { ...tree, name, creatorName };
      try {
        await saveTreeMutation({
          slug: updatedTree.slug,
          name: updatedTree.name,
          foundingMotherId: updatedTree.foundingMotherId,
          foundingFatherId: updatedTree.foundingFatherId,
          cats: updatedTree.cats,
          config: updatedTree.config,
          creatorName: updatedTree.creatorName,
        });
        setTree(updatedTree);
      } catch (error) {
        console.error("Failed to save tree:", error);
        throw error;
      }
    },
    [tree, saveTreeMutation]
  );

  const handleBackToConfig = useCallback(() => {
    setViewMode("config");
  }, []);

  // Render config screen
  if (viewMode === "config" || !tree) {
    return (
      <div className="w-full">
        {!isSpriteMapperReady ? (
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

              {/* Generate Button */}
              <button
                type="button"
                onClick={handleGenerateFromPreview}
                disabled={!motherPreview || !fatherPreview || isGenerating}
                className="w-full flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-5 text-lg font-semibold text-white transition-all hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isGenerating ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <Trees className="size-6" />
                )}
                Generate Ancestry Tree
              </button>
            </div>

            {/* Right Column - Settings */}
            <div className="space-y-6">
              {/* Tree Settings */}
              <div className="glass-card p-6 space-y-5">
                <h2 className="font-semibold text-xl flex items-center gap-2">
                  <Settings className="size-5 text-amber-500" />
                  Tree Settings
                </h2>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="depth" className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Generations</span>
                      <span className="font-medium">{config.depth}</span>
                    </label>
                    <input
                      type="range"
                      id="depth"
                      min={1}
                      max={6}
                      value={config.depth}
                      onChange={(e) =>
                        handleConfigChange({ ...config, depth: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="genderRatio" className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Male Ratio</span>
                      <span className="font-medium">{Math.round(config.genderRatio * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      id="genderRatio"
                      min={0}
                      max={100}
                      value={Math.round(config.genderRatio * 100)}
                      onChange={(e) =>
                        handleConfigChange({
                          ...config,
                          genderRatio: parseInt(e.target.value, 10) / 100,
                        })
                      }
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="minChildren" className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Min Children</span>
                        <span className="font-medium">{config.minChildren}</span>
                      </label>
                      <input
                        type="range"
                        id="minChildren"
                        min={1}
                        max={5}
                        value={config.minChildren}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          handleConfigChange({
                            ...config,
                            minChildren: val,
                            maxChildren: Math.max(config.maxChildren, val),
                          });
                        }}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="maxChildren" className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Max Children</span>
                        <span className="font-medium">{config.maxChildren}</span>
                      </label>
                      <input
                        type="range"
                        id="maxChildren"
                        min={config.minChildren}
                        max={8}
                        value={config.maxChildren}
                        onChange={(e) =>
                          handleConfigChange({
                            ...config,
                            maxChildren: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-amber-500"
                      />
                    </div>
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
          {/* Show Full Graph button - only visible when viewing a subtree */}
          {currentMainId && tree && currentMainId !== tree.foundingMotherId && (
            <button
              type="button"
              onClick={handleShowFullGraph}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              title="Show the complete family tree from the founding couple"
            >
              <Maximize2 className="size-4" />
              Show Full Graph
            </button>
          )}
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
        tree={tree}
        isOpen={selectedCat !== null}
        onClose={() => setSelectedCat(null)}
        onSelectCat={handleSelectCatFromPopup}
        onAssignRandomPartner={handleAssignRandomPartner}
        onAddChildWithPartner={handleAddChildWithPartner}
        onEditRelations={handleEditRelations}
        isEditingRelations={isEditingRelations}
        onChangePose={handleChangePose}
      />

      {showSaveDialog && tree && (
        <SaveTreeDialog
          currentName={tree.name}
          currentCreator={tree.creatorName}
          onSave={handleSaveTree}
          onClose={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
