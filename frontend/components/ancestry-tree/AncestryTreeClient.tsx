"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Save, Loader2 } from "lucide-react";

import type {
  AncestryTreeCat,
  SerializedAncestryTree,
  TreeGenerationConfig,
  FoundingCoupleInput,
} from "@/lib/ancestry-tree/types";
import { DEFAULT_TREE_CONFIG } from "@/lib/ancestry-tree/types";
import { AncestryTreeManager } from "@/lib/ancestry-tree/treeManager";
import { generateRandomParamsV3, ensureSpriteMapper } from "@/lib/cat-v3/randomGenerator";
import { generateWarriorName } from "@/lib/ancestry-tree/nameGenerator";

import { TreeVisualization } from "./TreeVisualization";
import { TreeConfigPanel } from "./TreeConfigPanel";
import { CatPopup } from "./CatPopup";
import { FoundingCoupleSelector } from "./FoundingCoupleSelector";
import { SaveTreeDialog } from "./SaveTreeDialog";

interface AncestryTreeClientProps {
  initialTree?: SerializedAncestryTree;
}

interface MutationPool {
  pelts: string[];
  colours: string[];
  eyeColours: string[];
  skinColours: string[];
  whitePatches: string[];
  spriteNumbers: number[];
}

export function AncestryTreeClient({ initialTree }: AncestryTreeClientProps) {
  const [tree, setTree] = useState<SerializedAncestryTree | null>(initialTree ?? null);
  const [config, setConfig] = useState<TreeGenerationConfig>(initialTree?.config ?? DEFAULT_TREE_CONFIG);
  const [selectedCat, setSelectedCat] = useState<AncestryTreeCat | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSpriteMapperReady, setIsSpriteMapperReady] = useState(false);

  const mutationPoolRef = useRef<MutationPool>({
    pelts: [],
    colours: [],
    eyeColours: [],
    skinColours: [],
    whitePatches: [],
    spriteNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
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
      } catch (error) {
        console.error("Failed to generate tree:", error);
      } finally {
        setIsGenerating(false);
      }
    },
    [config]
  );

  const handleGenerateRandom = useCallback(async () => {
    if (!isSpriteMapperReady) return;

    setIsGenerating(true);
    try {
      const [motherParams, fatherParams] = await Promise.all([
        generateRandomParamsV3(),
        generateRandomParamsV3(),
      ]);

      await generateTreeFromCouple({
        mother: {
          params: motherParams,
          name: generateWarriorName("warrior"),
        },
        father: {
          params: fatherParams,
          name: generateWarriorName("warrior"),
        },
      });
    } catch (error) {
      console.error("Failed to generate random couple:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [isSpriteMapperReady, generateTreeFromCouple]);

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

  const handleSaveTree = useCallback(
    async (name: string, creatorName: string) => {
      if (!tree) return;

      const updatedTree = { ...tree, name, creatorName };
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
    },
    [tree, saveTreeMutation]
  );

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Left Sidebar */}
      <div className="w-72 flex-shrink-0 overflow-y-auto">
        <TreeConfigPanel
          config={config}
          onConfigChange={handleConfigChange}
          onGenerateRandom={handleGenerateRandom}
          onSelectFromHistory={handleSelectFromHistory}
          onRegenerate={handleRegenerate}
          isGenerating={isGenerating || !isSpriteMapperReady}
          hasTree={!!tree}
        />

        {tree && (
          <div className="glass-card mt-4 p-4">
            <h3 className="font-semibold mb-3">Tree Info</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{tree.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cats</dt>
                <dd>{tree.cats.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Generations</dt>
                <dd>{tree.config.depth + 1}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => setShowSaveDialog(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <Save className="size-4" />
              Save Tree
            </button>
          </div>
        )}
      </div>

      {/* Main Tree View */}
      <div className="glass-card flex-1 overflow-hidden">
        {!isSpriteMapperReady ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-8 animate-spin text-amber-500" />
            <span className="ml-3 text-muted-foreground">Loading sprite data...</span>
          </div>
        ) : (
          <TreeVisualization
            tree={tree ?? { id: "", slug: "", name: "", foundingMotherId: "", foundingFatherId: "", cats: [], config: DEFAULT_TREE_CONFIG, createdAt: 0, updatedAt: 0 }}
            onCatClick={handleCatClick}
            highlightedCatId={selectedCat?.id}
          />
        )}
      </div>

      {/* Modals */}
      {selectedCat && tree && (
        <CatPopup
          cat={selectedCat}
          tree={tree}
          onClose={() => setSelectedCat(null)}
          onSelectCat={handleSelectCatFromPopup}
          onReplacePartner={handleReplacePartner}
        />
      )}

      {showHistoryPicker && (
        <FoundingCoupleSelector
          onSelect={handleHistorySelect}
          onClose={() => setShowHistoryPicker(false)}
        />
      )}

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
