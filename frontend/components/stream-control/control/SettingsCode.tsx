"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  decodePortableSettings,
  SETTINGS_CODE_MAX_INPUT_LENGTH,
} from "@/lib/portable-settings";
import { cn } from "@/lib/utils";
import type { SingleCatSettings } from "@/utils/singleCatVariants";
import { encodePortableCodeFromSettings } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Code — encode/decode portable 6-word settings codes
// ---------------------------------------------------------------------------

export function SettingsCode({
  settings,
  onApply,
}: {
  settings: SingleCatSettings;
  onApply: (next: Partial<SingleCatSettings>) => void;
}) {
  const [codeInput, setCodeInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);

  const liveCode = useMemo(
    () => encodePortableCodeFromSettings(settings),
    [settings],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(liveCode);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleApply = () => {
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    const decoded = decodePortableSettings(trimmed);
    if (!decoded) {
      toast.error("Invalid settings code");
      return;
    }
    onApply({
      accessoryRange: decoded.accessoryRange,
      scarRange: decoded.scarRange,
      tortieRange: decoded.tortieRange,
      exactLayerCounts: decoded.exactLayerCounts,
      afterlifeMode: decoded.afterlifeMode,
      includeBaseColours: decoded.includeBaseColours,
      includeNewSprites: decoded.includeNewSprites,
      extendedModes: decoded.extendedModes,
    });
    setCodeInput("");
    toast.success("Settings applied!");
  };

  return (
    <div className="space-y-2 border-t border-border/30 pt-4">
      <span className="text-xs font-medium text-muted-foreground">
        Settings Code
      </span>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 font-mono text-xs text-foreground">
          {liveCode}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "shrink-0 rounded-md border px-2 py-1.5 text-[10px] font-medium transition",
            copyFeedback
              ? "border-emerald-500/40 text-emerald-400"
              : "border-border/50 text-muted-foreground hover:text-foreground",
          )}
        >
          {copyFeedback ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label="Settings code"
          maxLength={SETTINGS_CODE_MAX_INPUT_LENGTH}
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
          placeholder="Paste code…"
          className="min-w-0 flex-1 rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/40 focus:border-primary/40"
        />
        <button
          type="button"
          onClick={handleApply}
          className="shrink-0 rounded-md border border-border/50 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
