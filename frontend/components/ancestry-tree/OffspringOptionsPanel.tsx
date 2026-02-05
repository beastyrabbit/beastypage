"use client";

import { Sword } from "lucide-react";
import SparklesIcon from "@/components/ui/sparkles-icon";
import type { OffspringOptions } from "@/lib/ancestry-tree/types";

interface OffspringOptionsPanelProps {
  options: OffspringOptions;
  onChange: (options: OffspringOptions) => void;
}

const CHANCE_OPTIONS = [
  { value: 0, label: "0%" },
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
];

const MAX_COUNT_OPTIONS = [1, 2, 3, 4];

export function OffspringOptionsPanel({ options, onChange }: OffspringOptionsPanelProps) {
  const handleAccessoryChanceChange = (value: number) => {
    onChange({ ...options, accessoryChance: value });
  };

  const handleScarChanceChange = (value: number) => {
    onChange({ ...options, scarChance: value });
  };

  const handleMaxAccessoriesChange = (value: number) => {
    onChange({ ...options, maxAccessories: value });
  };

  const handleMaxScarsChange = (value: number) => {
    onChange({ ...options, maxScars: value });
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <SparklesIcon size={16} className="text-amber-500" />
        Offspring Options
      </h3>

      {/* Accessory Options */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <SparklesIcon size={14} className="text-purple-400" />
          <span className="text-muted-foreground">Accessory Chance</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {CHANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAccessoryChanceChange(opt.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                options.accessoryChance === opt.value
                  ? "bg-purple-500 text-white"
                  : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {options.accessoryChance > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">Max:</span>
            <div className="flex gap-1">
              {MAX_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleMaxAccessoriesChange(count)}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                    options.maxAccessories === count
                      ? "bg-purple-500/70 text-white"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scar Options */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Sword className="size-3.5 text-red-400" />
          <span className="text-muted-foreground">Scar Chance</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {CHANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleScarChanceChange(opt.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                options.scarChance === opt.value
                  ? "bg-red-500 text-white"
                  : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {options.scarChance > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">Max:</span>
            <div className="flex gap-1">
              {MAX_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleMaxScarsChange(count)}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                    options.maxScars === count
                      ? "bg-red-500/70 text-white"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        These options apply to generated offspring only.
      </p>
    </div>
  );
}
