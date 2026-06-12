"use client";

import {
  ArrowUpRight,
  Copy,
  Download,
  Loader2,
  Play,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { LayerCountModeSelector } from "@/components/common/LayerCountModeSelector";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import { PaletteMultiSelect } from "@/components/common/PaletteMultiSelect";
import type { PaletteId } from "@/lib/palettes";
import { cn } from "@/lib/utils";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import type { AfterlifeOption, LayerRange } from "@/utils/singleCatVariants";
import { useStreamControl } from "./context";
import { SliderControl, ToggleControl } from "./controls";
import { formatMultiplier } from "./helpers";
import { SettingsCode } from "./SettingsCode";

/**
 * Spin tab: generator settings, the spin/wheel triggers with timing
 * controls, and the share/history actions for the latest result.
 */
export function SpinPanel() {
  const {
    settings,
    updateSettings,
    syncSessionSettings,
    variants,
    handleVariantSelect,
    paletteDisplayMode,
    setPaletteDisplayMode,
    spinning,
    wheelSpinning,
    commandBusy,
    hasWheelSource,
    generatorReady,
    countdownSeconds,
    setCountdownSeconds,
    handleSpin,
    handleWheelSpin,
    resultAutoClearEnabled,
    setResultAutoClearEnabled,
    resultAutoClearSeconds,
    setResultAutoClearSeconds,
    shareLink,
    currentSlug,
    currentProfileId,
    hasTint,
    lastResultRef,
    handleDownload,
    exportCat,
    catNameDraft,
    setCatNameDraft,
    creatorNameDraft,
    setCreatorNameDraft,
    metaDirty,
    setMetaDirty,
    handleSaveMeta,
    historySaving,
    metaSaving,
  } = useStreamControl();

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
        {/* Spin + sliders row */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSpin}
            disabled={commandBusy || !generatorReady}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3",
              "text-sm font-bold text-white shadow-lg shadow-amber-900/20 transition",
              "hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50",
            )}
          >
            {spinning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {spinning ? "Spinning…" : "Spin!"}
          </button>
          <button
            type="button"
            onClick={handleWheelSpin}
            disabled={commandBusy || !hasWheelSource}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3",
              "text-sm font-semibold text-amber-100 transition",
              "hover:border-amber-400/50 hover:bg-amber-500/15 disabled:opacity-50",
            )}
          >
            {wheelSpinning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {wheelSpinning ? "Wheel…" : "Spin Wheel"}
          </button>

          <div className="flex flex-1 items-center gap-4">
            <SliderControl
              label="Countdown"
              value={countdownSeconds}
              min={0}
              max={15}
              step={1}
              format={(v) => `${v}s`}
              onChange={setCountdownSeconds}
            />
            <SliderControl
              label="Speed"
              value={settings.speedMultiplier ?? 1}
              min={0.25}
              max={4}
              step={0.25}
              format={formatMultiplier}
              onChange={(v) => updateSettings({ speedMultiplier: v })}
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <ToggleControl
            label="Roll Auto-Clear"
            description=""
            checked={resultAutoClearEnabled}
            onChange={(checked) => {
              setResultAutoClearEnabled(checked);
              syncSessionSettings({ resultAutoClearEnabled: checked });
            }}
          />
          <SliderControl
            label="Clear After Roll"
            value={resultAutoClearSeconds}
            min={5}
            max={120}
            step={5}
            format={(v) => `${v}s`}
            disabled={!resultAutoClearEnabled}
            onChange={(v) => {
              setResultAutoClearSeconds(v);
              syncSessionSettings({ resultAutoClearSeconds: v });
            }}
          />
        </div>
      </section>

      {/* Settings Panel */}
      <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Settings
        </h3>
        <div className="space-y-4">
          {/* Timing Variant */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="stream-variant-select"
              className="text-xs font-medium text-muted-foreground"
            >
              Variant
            </label>
            <select
              id="stream-variant-select"
              value={variants.store.activeId ?? ""}
              onChange={(e) => handleVariantSelect(e.target.value || null)}
              className={cn(
                "rounded-lg border border-border/50 bg-background px-3 py-1.5",
                "text-xs text-foreground",
              )}
            >
              <option value="">Default</option>
              {variants.store.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Mode
            </span>
            <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
              {(["flashy", "calm"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => updateSettings({ mode })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                    settings.mode === mode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Layer ranges */}
          <LayerRangeSelector
            label="Accessories"
            value={settings.accessoryRange}
            onChange={(accessoryRange: LayerRange) =>
              updateSettings({ accessoryRange })
            }
            compact
          />
          <LayerRangeSelector
            label="Scars"
            value={settings.scarRange}
            onChange={(scarRange: LayerRange) => updateSettings({ scarRange })}
            compact
          />
          <LayerRangeSelector
            label="Torties"
            value={settings.tortieRange}
            onChange={(tortieRange: LayerRange) =>
              updateSettings({ tortieRange })
            }
            compact
          />

          {/* Exact counts toggle */}
          <LayerCountModeSelector
            value={settings.exactLayerCounts}
            onChange={(exactLayerCounts) =>
              updateSettings({ exactLayerCounts })
            }
            compact
          />

          {/* Afterlife */}
          <div>
            <label
              htmlFor="stream-afterlife-select"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Afterlife
            </label>
            <select
              id="stream-afterlife-select"
              value={settings.afterlifeMode}
              onChange={(e) =>
                updateSettings({
                  afterlifeMode: e.target.value as AfterlifeOption,
                })
              }
              className={cn(
                "w-full rounded-lg border border-border/50 bg-background px-3 py-2",
                "text-sm text-foreground",
              )}
            >
              {AFTERLIFE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Palettes */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Palettes
              </span>
              <div className="flex items-center gap-0.5 rounded-md border border-border/30 p-0.5">
                {(["cycle", "all"] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => {
                      setPaletteDisplayMode(m);
                      syncSessionSettings({ paletteDisplayMode: m });
                    }}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-semibold transition",
                      paletteDisplayMode === m
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "cycle" ? "Cycle" : "Show All"}
                  </button>
                ))}
              </div>
            </div>
            <PaletteMultiSelect
              selected={
                new Set(
                  settings.extendedModes.filter(
                    (m): m is PaletteId => m !== "base",
                  ),
                )
              }
              onChange={(selected) =>
                updateSettings({
                  extendedModes: Array.from(selected),
                })
              }
              includeClassic={settings.includeBaseColours}
              onClassicChange={(include) =>
                updateSettings({ includeBaseColours: include })
              }
              compact
            />
          </div>

          {/* Settings Code */}
          <SettingsCode settings={settings} onApply={updateSettings} />
        </div>
      </section>

      {/* Links & Actions */}
      <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
        <h3 className="text-sm font-semibold text-foreground">
          Links & Actions
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition",
              "hover:bg-foreground hover:text-background disabled:opacity-50",
            )}
            onClick={async () => {
              if (!shareLink) return;
              try {
                await navigator.clipboard.writeText(shareLink);
                toast.success("Share link copied!");
              } catch {
                window.prompt("Copy this link", shareLink);
              }
            }}
            disabled={!shareLink}
          >
            <SendHorizontal className="size-4" /> Copy Share Link
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition",
              "hover:bg-foreground hover:text-background disabled:opacity-50",
            )}
            onClick={() => {
              if (!currentSlug) return;
              window.open(`/view/${currentSlug}`, "_blank", "noopener=yes");
            }}
            disabled={!currentSlug}
          >
            <Sparkles className="size-4" /> Open Share Viewer
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition",
              "hover:bg-foreground hover:text-background disabled:opacity-50",
            )}
            onClick={() => void handleDownload()}
            disabled={!lastResultRef.current}
          >
            <Download className="size-4" /> Download PNG
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
              "text-xs font-medium text-muted-foreground transition",
              "hover:bg-foreground hover:text-background disabled:opacity-50",
            )}
            onClick={() => exportCat()}
            disabled={!lastResultRef.current}
          >
            <Copy className="size-4" /> Copy 700x700
          </button>
          {hasTint && (
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
                "text-xs font-medium text-muted-foreground transition",
                "hover:bg-foreground hover:text-background disabled:opacity-50",
              )}
              onClick={() => exportCat({ noTint: true })}
              disabled={!lastResultRef.current}
            >
              <Copy className="size-4" /> Copy (No Tint)
            </button>
          )}
        </div>
        {shareLink && (
          <p className="mt-3 truncate text-xs text-muted-foreground">
            Latest share: <span className="text-foreground">{shareLink}</span>
          </p>
        )}
        <div className="mt-4 grid gap-3 rounded-xl border border-border/40 bg-background/50 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
            History Entry
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/70">
              <span>Cat Name</span>
              <input
                type="text"
                value={catNameDraft}
                onChange={(e) => {
                  setCatNameDraft(e.target.value);
                  setMetaDirty(true);
                }}
                placeholder="Optional"
                className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/70">
              <span>Your Name</span>
              <input
                type="text"
                value={creatorNameDraft}
                onChange={(e) => {
                  setCreatorNameDraft(e.target.value);
                  setMetaDirty(true);
                }}
                placeholder="Optional"
                className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
                "text-xs font-medium text-muted-foreground transition",
                "hover:bg-foreground hover:text-background disabled:opacity-50",
              )}
              onClick={handleSaveMeta}
              disabled={
                !currentProfileId || historySaving || metaSaving || !metaDirty
              }
            >
              {historySaving || metaSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}{" "}
              Save to History
            </button>
            <Link
              href="/history"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
                "text-xs font-medium text-muted-foreground transition",
                "hover:bg-foreground hover:text-background",
              )}
            >
              Browse History
            </Link>
            {currentSlug && (
              <Link
                href={`/view/${currentSlug}`}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2",
                  "text-xs font-medium text-muted-foreground transition",
                  "hover:bg-foreground hover:text-background",
                )}
              >
                <ArrowUpRight className="size-4" /> View Entry
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
