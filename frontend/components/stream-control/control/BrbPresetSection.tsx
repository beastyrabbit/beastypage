"use client";

import { Copy } from "lucide-react";
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
// BRB Preset — store a portable settings code used only for BRB mode
// ---------------------------------------------------------------------------

export function BrbPresetSection({
  settings,
  savedCode,
  draftCode,
  onDraftChange,
  onSave,
}: {
  settings: SingleCatSettings;
  savedCode: string;
  draftCode: string;
  onDraftChange: (value: string) => void;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const currentCode = useMemo(
    () => encodePortableCodeFromSettings(settings),
    [settings],
  );
  const hasSavedPreset = savedCode.length > 0;
  const presetValid = hasSavedPreset
    ? Boolean(decodePortableSettings(savedCode))
    : true;
  const presetStatus = hasSavedPreset
    ? presetValid
      ? "Preset Ready"
      : "Invalid Preset"
    : "Uses Live Settings";

  const runSave = async (value: string) => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      toast.success("Current settings code copied");
    } catch {
      toast.error("Failed to copy settings code");
    }
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-background/80 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/30 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">BRB Preset</h3>
          <p className="text-xs text-muted-foreground">
            Save an optional 6-word code. The BRB button uses this preset
            without changing your live stream settings.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            hasSavedPreset && presetValid
              ? "border-emerald-500/30 text-emerald-400"
              : hasSavedPreset
                ? "border-red-500/30 text-red-400"
                : "border-border/40 text-muted-foreground",
          )}
        >
          {presetStatus}
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            aria-label="BRB settings code"
            maxLength={SETTINGS_CODE_MAX_INPUT_LENGTH}
            value={draftCode}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) {
                void runSave(draftCode);
              }
            }}
            placeholder="Paste BRB settings code…"
            className="min-w-0 flex-1 rounded-lg border border-border/40 bg-background/60 px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40"
          />
          <button
            type="button"
            onClick={() => void runSave(draftCode)}
            disabled={saving}
            className={cn(
              "inline-flex items-center justify-center rounded-lg border border-border/50 px-3 py-2 text-xs font-medium transition",
              "text-muted-foreground hover:text-foreground disabled:opacity-50",
            )}
          >
            {saving ? "Saving…" : "Save Preset"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runSave(currentCode)}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:opacity-50",
            )}
          >
            Use Current Settings
          </button>
          <button
            type="button"
            onClick={() => void handleCopyCurrent()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background",
            )}
          >
            <Copy className="size-4" /> Copy Current Code
          </button>
          <button
            type="button"
            onClick={() => void runSave("")}
            disabled={saving || !hasSavedPreset}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition hover:border-red-500/40 hover:bg-red-500/5 hover:text-red-400 disabled:opacity-50",
            )}
          >
            Clear Preset
          </button>
        </div>

        {hasSavedPreset ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Saved BRB code</p>
            <code className="block rounded-lg border border-border/40 bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
              {savedCode}
            </code>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No preset saved. BRB will use whatever settings are currently
            active.
          </p>
        )}
      </div>
    </section>
  );
}
