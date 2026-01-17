"use client";

import { useState, useCallback } from "react";
import { Settings, RefreshCw, Dices, History } from "lucide-react";
import type { TreeGenerationConfig } from "@/lib/ancestry-tree/types";
import { DEFAULT_TREE_CONFIG } from "@/lib/ancestry-tree/types";

interface TreeConfigPanelProps {
  config: TreeGenerationConfig;
  onConfigChange: (config: TreeGenerationConfig) => void;
  onGenerateRandom: () => void;
  onSelectFromHistory: () => void;
  onRegenerate: () => void;
  isGenerating?: boolean;
  hasTree?: boolean;
}

export function TreeConfigPanel({
  config,
  onConfigChange,
  onGenerateRandom,
  onSelectFromHistory,
  onRegenerate,
  isGenerating = false,
  hasTree = false,
}: TreeConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<TreeGenerationConfig>(config);

  const handleChange = useCallback(
    (key: keyof TreeGenerationConfig, value: number) => {
      const newConfig = { ...localConfig, [key]: value };
      setLocalConfig(newConfig);
      onConfigChange(newConfig);
    },
    [localConfig, onConfigChange]
  );

  return (
    <div className="glass-card flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-amber-500" />
        <h3 className="font-semibold">Tree Settings</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="depth" className="block text-sm text-muted-foreground mb-1">
            Generations: {localConfig.depth}
          </label>
          <input
            type="range"
            id="depth"
            min={1}
            max={6}
            value={localConfig.depth}
            onChange={(e) => handleChange("depth", parseInt(e.target.value, 10))}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1</span>
            <span>6</span>
          </div>
        </div>

        <div>
          <label htmlFor="minChildren" className="block text-sm text-muted-foreground mb-1">
            Min Children: {localConfig.minChildren}
          </label>
          <input
            type="range"
            id="minChildren"
            min={1}
            max={5}
            value={localConfig.minChildren}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              handleChange("minChildren", val);
              if (val > localConfig.maxChildren) {
                handleChange("maxChildren", val);
              }
            }}
            className="w-full accent-amber-500"
          />
        </div>

        <div>
          <label htmlFor="maxChildren" className="block text-sm text-muted-foreground mb-1">
            Max Children: {localConfig.maxChildren}
          </label>
          <input
            type="range"
            id="maxChildren"
            min={localConfig.minChildren}
            max={8}
            value={localConfig.maxChildren}
            onChange={(e) => handleChange("maxChildren", parseInt(e.target.value, 10))}
            className="w-full accent-amber-500"
          />
        </div>

        <div>
          <label htmlFor="genderRatio" className="block text-sm text-muted-foreground mb-1">
            Male Ratio: {Math.round(localConfig.genderRatio * 100)}%
          </label>
          <input
            type="range"
            id="genderRatio"
            min={0}
            max={100}
            value={Math.round(localConfig.genderRatio * 100)}
            onChange={(e) => handleChange("genderRatio", parseInt(e.target.value, 10) / 100)}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>All Female</span>
            <span>All Male</span>
          </div>
        </div>
      </div>

      <hr className="border-white/10" />

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Founding Couple</h4>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onGenerateRandom}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {isGenerating ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Dices className="size-4" />
            )}
            Random Couple
          </button>
          <button
            type="button"
            onClick={onSelectFromHistory}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <History className="size-4" />
            From History
          </button>
        </div>
      </div>

      {hasTree && (
        <>
          <hr className="border-white/10" />
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {isGenerating ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Regenerate Descendants
          </button>
        </>
      )}
    </div>
  );
}
