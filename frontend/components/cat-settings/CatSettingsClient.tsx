"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import {
  encodePortableSettings,
  decodePortableSettings,
} from "@/lib/portable-settings";
import type { SingleCatPortableSettings } from "@/lib/portable-settings";
import type { AfterlifeOption, ExtendedMode, LayerRange } from "@/utils/singleCatVariants";
import { DEFAULT_SINGLE_CAT_SETTINGS } from "@/utils/singleCatVariants";
import { PaletteGroupPicker } from "./PaletteGroupPicker";
import { ExampleCatGrid } from "./ExampleCatGrid";
import CopyIcon from "@/components/ui/copy-icon";

// ---------------------------------------------------------------------------
// Defaults (from the DEFAULT_SINGLE_CAT_SETTINGS)
// ---------------------------------------------------------------------------

const DEFAULTS: SingleCatPortableSettings = {
  accessoryRange: { ...DEFAULT_SINGLE_CAT_SETTINGS.accessoryRange },
  scarRange: { ...DEFAULT_SINGLE_CAT_SETTINGS.scarRange },
  tortieRange: { ...DEFAULT_SINGLE_CAT_SETTINGS.tortieRange },
  afterlifeMode: DEFAULT_SINGLE_CAT_SETTINGS.afterlifeMode,
  includeBaseColours: DEFAULT_SINGLE_CAT_SETTINGS.includeBaseColours,
  extendedModes: [...DEFAULT_SINGLE_CAT_SETTINGS.extendedModes],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CatSettingsClientProps {
  initialSettings: SingleCatPortableSettings | null;
  initialCode: string | null;
}

export function CatSettingsClient({
  initialSettings,
  initialCode,
}: CatSettingsClientProps) {
  const router = useRouter();

  // Settings state
  const init = initialSettings ?? DEFAULTS;
  const [accessoryRange, setAccessoryRange] = useState<LayerRange>(init.accessoryRange);
  const [scarRange, setScarRange] = useState<LayerRange>(init.scarRange);
  const [tortieRange, setTortieRange] = useState<LayerRange>(init.tortieRange);
  const [afterlifeMode, setAfterlifeMode] = useState<AfterlifeOption>(init.afterlifeMode);
  const [includeBaseColours, setIncludeBaseColours] = useState(init.includeBaseColours);
  const [extendedModes, setExtendedModes] = useState<ExtendedMode[]>(init.extendedModes);

  // Code input state
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyUrlFeedback, setCopyUrlFeedback] = useState(false);

  // Compute settings object and live code
  const currentSettings = useMemo<SingleCatPortableSettings>(
    () => ({
      accessoryRange,
      scarRange,
      tortieRange,
      afterlifeMode,
      includeBaseColours,
      extendedModes,
    }),
    [accessoryRange, scarRange, tortieRange, afterlifeMode, includeBaseColours, extendedModes],
  );

  const liveCode = useMemo(
    () => encodePortableSettings(currentSettings),
    [currentSettings],
  );

  // Copy code
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(liveCode);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      // Fallback: select text
    }
  }, [liveCode]);

  // Copy URL
  const handleCopyUrl = useCallback(async () => {
    try {
      const url = `${window.location.origin}/single-cat-plus/settings?code=${encodeURIComponent(liveCode)}`;
      await navigator.clipboard.writeText(url);
      setCopyUrlFeedback(true);
      setTimeout(() => setCopyUrlFeedback(false), 1500);
    } catch {
      // Fallback
    }
  }, [liveCode]);

  // Apply pasted code
  const handleApplyCode = useCallback(() => {
    const trimmed = codeInput.trim();
    if (!trimmed) {
      setCodeError("Enter a settings code");
      return;
    }
    const decoded = decodePortableSettings(trimmed);
    if (!decoded) {
      setCodeError("Invalid code — must be 6 words like \"word-word-word-word-word-word\"");
      return;
    }
    setCodeError(null);
    setAccessoryRange(decoded.accessoryRange);
    setScarRange(decoded.scarRange);
    setTortieRange(decoded.tortieRange);
    setAfterlifeMode(decoded.afterlifeMode);
    setIncludeBaseColours(decoded.includeBaseColours);
    setExtendedModes(decoded.extendedModes);
    setCodeInput("");
  }, [codeInput]);

  // Transfer to Single Cat Plus
  const handleTransfer = useCallback(() => {
    router.push(`/single-cat-plus?code=${encodeURIComponent(liveCode)}`);
  }, [router, liveCode]);

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Guided Wizard CTA ─── */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center backdrop-blur">
        <p className="text-sm text-muted-foreground">
          New here?{" "}
          <a
            href={`/single-cat-plus/settings/guided${liveCode ? `?code=${encodeURIComponent(liveCode)}` : ""}`}
            className="font-semibold text-primary underline underline-offset-4 transition hover:text-primary/80"
          >
            Try the guided wizard
          </a>{" "}
          for a step-by-step walkthrough with visual examples.
        </p>
      </div>

      {/* ─── Code Bar ─── */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Settings Code
        </div>

        {/* Live code display */}
        <div className="flex flex-wrap items-center gap-3">
          <code className="flex-1 rounded-lg border border-primary/30 bg-background/80 px-4 py-2.5 font-mono text-lg tracking-wide text-foreground">
            {liveCode}
          </code>
          <button
            type="button"
            onClick={handleCopyCode}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition",
              copyFeedback
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border/50 bg-background/70 text-muted-foreground hover:text-foreground",
            )}
          >
            <CopyIcon size={14} />
            {copyFeedback ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleCopyUrl}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition",
              copyUrlFeedback
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border/50 bg-background/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {copyUrlFeedback ? "Copied!" : "Copy URL"}
          </button>
        </div>

        {/* Paste + Apply */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              if (codeError) setCodeError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApplyCode();
            }}
            placeholder="Paste a code..."
            className="min-w-0 flex-1 rounded-lg border border-border/40 bg-background/70 px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/50"
          />
          <button
            type="button"
            onClick={handleApplyCode}
            className="rounded-lg border border-border/50 bg-background/70 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
          >
            Open in Single Cat Plus &rarr;
          </button>
        </div>
        {codeError && (
          <p className="mt-1.5 text-xs text-red-400">{codeError}</p>
        )}
      </section>

      {/* ─── Example Cats (full width, directly under code bar) ─── */}
      <ExampleCatGrid settings={currentSettings} />

      {/* ─── Layer Counts + Afterlife (combined) ─── */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h2 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Layer Counts
        </h2>
        <div className="space-y-5">
          <LayerRangeSelector label="Accessories" value={accessoryRange} onChange={setAccessoryRange} compact />
          <LayerRangeSelector label="Scars" value={scarRange} onChange={setScarRange} compact />
          <LayerRangeSelector label="Tortie Layers" value={tortieRange} onChange={setTortieRange} compact />
        </div>

        <div className="my-5 border-t border-border/30" />

        <h2 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Afterlife Effects
        </h2>
        <select
          value={afterlifeMode}
          onChange={(e) => setAfterlifeMode(e.target.value as AfterlifeOption)}
          className="w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
        >
          {AFTERLIFE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {/* ─── Colour Palettes ─── */}
      <section className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
        <h2 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Colour Palettes
        </h2>

        {/* Classic toggle */}
        <label className="mb-4 flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={includeBaseColours}
            onChange={(e) => setIncludeBaseColours(e.target.checked)}
            className="size-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Classic colours</span>
          <span className="text-xs text-muted-foreground">(19 base ClanGen colours)</span>
        </label>

        <PaletteGroupPicker
          selected={extendedModes}
          onChange={setExtendedModes}
        />
      </section>

      {/* Mobile-only transfer button */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={handleTransfer}
          className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
        >
          Open in Single Cat Plus &rarr;
        </button>
      </div>
    </div>
  );
}
