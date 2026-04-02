"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import {
  Copy,
  Eye,
  Loader2,
  Minus,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Square,
  Timer,
  Tv,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { signIn } from "@/lib/shooAuth";
import { cn } from "@/lib/utils";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import { PaletteMultiSelect } from "@/components/common/PaletteMultiSelect";
import { LayerCountModeSelector } from "@/components/common/LayerCountModeSelector";
import { AFTERLIFE_OPTIONS } from "@/utils/catSettingsHelpers";
import {
  DEFAULT_SINGLE_CAT_SETTINGS,
  type AfterlifeOption,
  type LayerRange,
  type SingleCatSettings,
} from "@/utils/singleCatVariants";
import type { PaletteId } from "@/lib/palettes";
import { useCatGenerator } from "@/components/cat-builder/hooks";

// ---------------------------------------------------------------------------
// StreamControlClient
// ---------------------------------------------------------------------------

export function StreamControlClient() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const session = useQuery(
    api.catStream.getSession,
    isAuthenticated ? {} : "skip"
  );
  const history = useQuery(
    api.catStream.getHistory,
    isAuthenticated ? { limit: 50 } : "skip"
  );

  const ensureSession = useMutation(api.catStream.ensureSession);
  const updateSettingsMut = useMutation(api.catStream.updateSettings);
  const triggerSpinMut = useMutation(api.catStream.triggerSpin);
  const showLobbyMut = useMutation(api.catStream.showLobby);
  const clearOverlayMut = useMutation(api.catStream.clearOverlay);
  const toggleTestModeMut = useMutation(api.catStream.toggleTestMode);
  const recordResultMut = useMutation(api.catStream.recordResult);

  const { generator, ready: generatorReady } = useCatGenerator();

  // Local settings state — synced to Convex on change
  const [settings, setSettings] = useState<SingleCatSettings>(
    DEFAULT_SINGLE_CAT_SETTINGS
  );
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [spinning, setSpinning] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Seed from session settings on first load
  useEffect(() => {
    if (session && !initialized) {
      if (session.settings && typeof session.settings === "object") {
        setSettings((prev) => ({ ...prev, ...session.settings }));
      }
      setInitialized(true);
    }
  }, [session, initialized]);

  // Ensure session exists on mount
  useEffect(() => {
    if (isAuthenticated && session === null) {
      ensureSession({}).catch(console.error);
    }
  }, [isAuthenticated, session, ensureSession]);

  // Sync settings to Convex (debounced)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateSettings = useCallback(
    (next: Partial<SingleCatSettings>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...next };
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => {
          if (session) updateSettingsMut({ settings: merged }).catch(() => {});
        }, 500);
        return merged;
      });
    },
    [updateSettingsMut]
  );

  // Spin handler
  const handleSpin = useCallback(async () => {
    if (!generator || spinning) return;
    setSpinning(true);
    try {
      if (!generator.generateRandomCat) {
        throw new Error("Generator does not support random cat generation");
      }
      const result = await generator.generateRandomCat({
        experimentalColourMode:
          settings.extendedModes.length > 0
            ? settings.extendedModes.filter((m) => m !== "base")
            : undefined,
        includeBaseColours: settings.includeBaseColours,
        exactLayerCounts: settings.exactLayerCounts,
        accessoryCount: settings.accessoryRange.max,
        scarCount: settings.scarRange.max,
        tortieCount: settings.tortieRange.max,
      });

      await triggerSpinMut({
        params: result.params,
        slots: result.slotSelections,
        countdownSeconds,
      });

      await recordResultMut({
        params: result.params,
      });

      toast.success("Spin triggered!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to trigger spin"
      );
    } finally {
      setSpinning(false);
    }
  }, [
    generator,
    spinning,
    settings,
    countdownSeconds,
    triggerSpinMut,
    recordResultMut,
  ]);

  // Auth gate
  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-sm text-muted-foreground">
          Sign in to use the stream control center.
        </p>
        <button
          onClick={() => signIn()}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border/50",
            "px-5 py-2.5 text-sm font-semibold text-muted-foreground",
            "transition hover:bg-foreground hover:text-background"
          )}
        >
          Sign in
        </button>
      </div>
    );
  }

  const apiKey = viewer?.apiKey;
  const obsUrl = apiKey
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/single-cat-stream/obs?key=${apiKey}`
    : null;

  return (
    <div className="space-y-6">
      {/* Top row: Settings + OBS Preview */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings Panel */}
        <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </h3>
          <div className="space-y-4">
            {/* Mode */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Mode
              </span>
              <div className="inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1">
                {(["flashy", "calm"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateSettings({ mode })}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold capitalize transition",
                      settings.mode === mode
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
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
              onChange={(scarRange: LayerRange) =>
                updateSettings({ scarRange })
              }
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
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Afterlife
              </span>
              <select
                value={settings.afterlifeMode}
                onChange={(e) =>
                  updateSettings({
                    afterlifeMode: e.target.value as AfterlifeOption,
                  })
                }
                className={cn(
                  "w-full rounded-lg border border-border/50 bg-background px-3 py-2",
                  "text-sm text-foreground"
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
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Palettes
              </span>
              <PaletteMultiSelect
                selected={
                  new Set(
                    settings.extendedModes.filter(
                      (m): m is PaletteId => m !== "base"
                    )
                  )
                }
                onChange={(selected) =>
                  updateSettings({
                    extendedModes: [
                      ...(settings.includeBaseColours ? [] : []),
                      ...Array.from(selected),
                    ],
                  })
                }
                includeClassic={settings.includeBaseColours}
                onClassicChange={(include) =>
                  updateSettings({ includeBaseColours: include })
                }
                compact
              />
            </div>
          </div>
        </section>

        {/* Right column: OBS Preview + Controls */}
        <div className="flex flex-col gap-4">
          {/* OBS Preview */}
          <section className="flex-1 rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Tv className="mr-1.5 inline size-3.5" />
                OBS Preview
              </h3>
              {obsUrl && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(obsUrl);
                    toast.success("OBS URL copied!");
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5",
                    "text-xs font-medium text-muted-foreground transition",
                    "hover:bg-foreground hover:text-background"
                  )}
                >
                  <Copy className="size-3" />
                  Copy URL
                </button>
              )}
            </div>
            <div className="relative aspect-video overflow-hidden rounded-lg border border-border/30 bg-black/90">
              {obsUrl ? (
                <iframe
                  src={obsUrl}
                  className="absolute left-0 top-0 origin-top-left"
                  style={{
                    width: "1920px",
                    height: "1080px",
                    transform: "scale(var(--preview-scale, 0.3))",
                  }}
                  title="OBS Overlay Preview"
                  ref={(el) => {
                    if (!el) return;
                    const container = el.parentElement;
                    if (!container) return;
                    const observer = new ResizeObserver(([entry]) => {
                      const scale = entry.contentRect.width / 1920;
                      container.style.setProperty("--preview-scale", String(scale));
                    });
                    observer.observe(container);
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Loading API key…
                </div>
              )}
            </div>
          </section>

          {/* Controls */}
          <section className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Controls
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {/* Spin */}
              <button
                onClick={handleSpin}
                disabled={spinning || !generatorReady}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5",
                  "text-sm font-semibold text-white transition",
                  "hover:bg-amber-700 disabled:opacity-50"
                )}
              >
                {spinning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Spin!
              </button>

              {/* Countdown */}
              <div className="flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5">
                <Timer className="size-3.5 text-muted-foreground" />
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={countdownSeconds}
                  onChange={(e) =>
                    setCountdownSeconds(
                      Math.max(0, Math.min(30, Number(e.target.value)))
                    )
                  }
                  className="w-10 bg-transparent text-center text-sm text-foreground focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">sec</span>
              </div>

              {/* Speed */}
              <div className="flex items-center gap-1 rounded-lg border border-border/50 px-1.5 py-1">
                <Zap className="size-3.5 text-muted-foreground" />
                <button
                  onClick={() =>
                    updateSettings({
                      speedMultiplier: Math.max(
                        0.25,
                        (settings.speedMultiplier ?? 1) - 0.25
                      ),
                    })
                  }
                  className="rounded p-1 text-muted-foreground transition hover:bg-foreground hover:text-background"
                >
                  <Minus className="size-3" />
                </button>
                <span className="w-8 text-center text-xs font-semibold text-foreground">
                  {(settings.speedMultiplier ?? 1).toFixed(2).replace(/\.?0+$/, "")}x
                </span>
                <button
                  onClick={() =>
                    updateSettings({
                      speedMultiplier: Math.min(
                        4,
                        (settings.speedMultiplier ?? 1) + 0.25
                      ),
                    })
                  }
                  className="rounded p-1 text-muted-foreground transition hover:bg-foreground hover:text-background"
                >
                  <Plus className="size-3" />
                </button>
              </div>

              {/* Lobby */}
              <button
                onClick={() => showLobbyMut().catch(console.error)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2",
                  "text-xs font-medium text-muted-foreground transition",
                  "hover:bg-foreground hover:text-background"
                )}
              >
                <Eye className="size-3.5" />
                Lobby
              </button>

              {/* Test Mode */}
              <button
                onClick={() => toggleTestModeMut().catch(console.error)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2",
                  "text-xs font-medium transition",
                  session?.testMode
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                    : "border-border/50 text-muted-foreground hover:bg-foreground hover:text-background"
                )}
              >
                <Radio className="size-3.5" />
                Test
              </button>

              {/* Clear */}
              <button
                onClick={() => clearOverlayMut().catch(console.error)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2",
                  "text-xs font-medium text-muted-foreground transition",
                  "hover:bg-foreground hover:text-background"
                )}
              >
                <Square className="size-3.5" />
                Clear
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Spin History Table */}
      <section className="rounded-2xl border border-border/40 bg-background/80 p-5 backdrop-blur">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Spin History
        </h3>
        {!history || history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No spins yet. Click Spin! to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Pelt</th>
                  <th className="pb-2 pr-4">Colour</th>
                  <th className="pb-2 pr-4">Eyes</th>
                  <th className="pb-2 pr-4">Sprite</th>
                  <th className="pb-2 pr-4">Tortie</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => {
                  const p = row.params ?? {};
                  return (
                    <tr
                      key={row._id}
                      className="border-b border-border/10 text-foreground/80"
                    >
                      <td className="py-2 pr-4 text-muted-foreground">
                        {history.length - i}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(row.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-4">{p.peltName ?? "—"}</td>
                      <td className="py-2 pr-4">{p.colour ?? "—"}</td>
                      <td className="py-2 pr-4">{p.eyeColour ?? "—"}</td>
                      <td className="py-2 pr-4">{p.spriteNumber ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {p.isTortie ? "Yes" : "No"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
