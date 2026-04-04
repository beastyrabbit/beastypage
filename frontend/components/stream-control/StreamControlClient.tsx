"use client";

import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Copy,
  Download,
  Eye,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Square,
  Timer,
  Tv,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { LayerCountModeSelector } from "@/components/common/LayerCountModeSelector";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import { PaletteMultiSelect } from "@/components/common/PaletteMultiSelect";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PaletteId } from "@/lib/palettes";
import {
  decodePortableSettings,
  encodePortableSettings,
} from "@/lib/portable-settings";
import { cn } from "@/lib/utils";
import {
  AFTERLIFE_OPTIONS,
  computeLayerCount,
} from "@/utils/catSettingsHelpers";
import {
  type AfterlifeOption,
  DEFAULT_SINGLE_CAT_SETTINGS,
  type LayerRange,
  type SingleCatSettings,
} from "@/utils/singleCatVariants";
import { useVariants } from "@/utils/variants";

// ---------------------------------------------------------------------------
// StreamControlClient
// ---------------------------------------------------------------------------

const LOBBY_MODE_DEFAULTS = {
  "fruit-ninja": { cats: 5, move: 1.5, swap: 1 },
  matrix: { cats: 8, move: 1, swap: 1 },
  dvd: { cats: 3, move: 0.5, swap: 1 },
} as const;

/** Format a multiplier value like 1 -> "1x", 0.25 -> "0.25x", 2.50 -> "2.5x" */
function formatMultiplier(v: number): string {
  return `${v.toFixed(2).replace(/\.?0+$/, "")}x`;
}

export function StreamControlClient() {
  const clerk = useClerk();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const session = useQuery(
    api.catStream.getSession,
    isAuthenticated ? {} : "skip",
  );

  const ensureSession = useMutation(api.catStream.ensureSession);
  const updateSettingsMut = useMutation(api.catStream.updateSettings);
  const triggerSpinMut = useMutation(api.catStream.triggerSpin);
  const showLobbyMut = useMutation(api.catStream.showLobby);
  const showBrbMut = useMutation(api.catStream.showBrb);
  const clearOverlayMut = useMutation(api.catStream.clearOverlay);
  const toggleTestModeMut = useMutation(api.catStream.toggleTestMode);
  const createMapper = useMutation(api.mapper.create);
  const updateMapperMeta = useMutation(api.mapper.updateMeta);

  const { generator, ready: generatorReady } = useCatGenerator();

  // Variant management — read-only, reuses SingleCatPlus variants
  const variants = useVariants<SingleCatSettings>({
    storageKey: "singleCatPlus.variants",
    toolKey: "singleCatPlus",
  });

  // Local settings state — synced to Convex on change
  const [settings, setSettings] = useState<SingleCatSettings>(
    DEFAULT_SINGLE_CAT_SETTINGS,
  );
  const [countdownSeconds, setCountdownSeconds] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Cat profile state — for "Links & Actions" / history entry
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [creatorNameDraft, setCreatorNameDraft] = useState("");
  const [metaDirty, setMetaDirty] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const creatorFilledRef = useRef(false);
  const lastResultRef = useRef<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
    params: Record<string, unknown>;
  } | null>(null);
  const [hasTint, setHasTint] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Lobby animation settings
  const [lobbyMode, setLobbyMode] = useState<"fruit-ninja" | "matrix" | "dvd">(
    "fruit-ninja",
  );
  const [lobbyCatCount, setLobbyCatCount] = useState(4);
  const [lobbyMoveSpeed, setLobbyMoveSpeed] = useState(1.0);
  const [lobbySwapSpeed, setLobbySwapSpeed] = useState(1.0);
  const [lobbyCatMinSize, setLobbyCatMinSize] = useState(1.0);
  const [lobbyCatMaxSize, setLobbyCatMaxSize] = useState(2.0);
  const [paletteDisplayMode, setPaletteDisplayMode] = useState<"cycle" | "all">(
    "cycle",
  );
  const [autoClearSeconds, setAutoClearSeconds] = useState(30);

  // Instant sync for lobby settings — no debounce
  const syncLobbySettings = useCallback(
    (updates: Record<string, unknown>) => {
      const merged = {
        ...settings,
        lobbyMode,
        lobbyCatCount,
        lobbyMoveSpeed,
        lobbySwapSpeed,
        lobbyCatMinSize,
        lobbyCatMaxSize,
        paletteDisplayMode,
        autoClearSeconds,
        ...updates,
      };
      if (session) updateSettingsMut({ settings: merged }).catch(() => {});
    },
    [
      settings,
      lobbyMode,
      lobbyCatCount,
      lobbyMoveSpeed,
      lobbySwapSpeed,
      lobbyCatMinSize,
      lobbyCatMaxSize,
      paletteDisplayMode,
      autoClearSeconds,
      session,
      updateSettingsMut,
    ],
  );

  // Seed from session settings on first load
  useEffect(() => {
    if (session && !initialized) {
      if (session.settings && typeof session.settings === "object") {
        const s = session.settings as Record<string, unknown>;
        setSettings((prev) => ({ ...prev, ...s }));
        if (s.lobbyMode) setLobbyMode(s.lobbyMode as typeof lobbyMode);
        if (s.lobbyCatCount) setLobbyCatCount(s.lobbyCatCount as number);
        if (s.lobbyMoveSpeed) setLobbyMoveSpeed(s.lobbyMoveSpeed as number);
        if (s.lobbySwapSpeed) setLobbySwapSpeed(s.lobbySwapSpeed as number);
        if (s.lobbyCatMinSize != null)
          setLobbyCatMinSize(s.lobbyCatMinSize as number);
        if (s.lobbyCatMaxSize != null)
          setLobbyCatMaxSize(s.lobbyCatMaxSize as number);
        if (s.paletteDisplayMode)
          setPaletteDisplayMode(s.paletteDisplayMode as "cycle" | "all");
        if (s.autoClearSeconds != null)
          setAutoClearSeconds(s.autoClearSeconds as number);
        if (typeof s.creatorName === "string" && s.creatorName) {
          setCreatorNameDraft(s.creatorName);
          creatorFilledRef.current = true;
        }
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

  // Auto-fill creator name from viewer username
  useEffect(() => {
    const username = viewer?.username;
    if (username && !creatorFilledRef.current && !creatorNameDraft) {
      setCreatorNameDraft(username);
      creatorFilledRef.current = true;
    }
  }, [viewer?.username, creatorNameDraft]);

  // Scale the OBS preview iframe to fit its container
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const scale = entry.contentRect.width / 1920;
      container.style.setProperty("--preview-scale", String(scale));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Sync settings to Convex (debounced) — includes lobby fields so they aren't overwritten
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lobbyModeRef = useRef(lobbyMode);
  lobbyModeRef.current = lobbyMode;
  const lobbyCatCountRef = useRef(lobbyCatCount);
  lobbyCatCountRef.current = lobbyCatCount;
  const lobbyMoveSpeedRef = useRef(lobbyMoveSpeed);
  lobbyMoveSpeedRef.current = lobbyMoveSpeed;
  const lobbySwapSpeedRef = useRef(lobbySwapSpeed);
  lobbySwapSpeedRef.current = lobbySwapSpeed;
  const lobbyCatMinSizeRef = useRef(lobbyCatMinSize);
  lobbyCatMinSizeRef.current = lobbyCatMinSize;
  const lobbyCatMaxSizeRef = useRef(lobbyCatMaxSize);
  lobbyCatMaxSizeRef.current = lobbyCatMaxSize;
  const paletteDisplayModeRef = useRef(paletteDisplayMode);
  paletteDisplayModeRef.current = paletteDisplayMode;
  const autoClearSecondsRef = useRef(autoClearSeconds);
  autoClearSecondsRef.current = autoClearSeconds;

  const updateSettings = useCallback(
    (next: Partial<SingleCatSettings>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...next };
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => {
          if (sessionRef.current) {
            // Read lobby values from refs to avoid stale closures
            const full = {
              ...merged,
              lobbyMode: lobbyModeRef.current,
              lobbyCatCount: lobbyCatCountRef.current,
              lobbyMoveSpeed: lobbyMoveSpeedRef.current,
              lobbySwapSpeed: lobbySwapSpeedRef.current,
              lobbyCatMinSize: lobbyCatMinSizeRef.current,
              lobbyCatMaxSize: lobbyCatMaxSizeRef.current,
              paletteDisplayMode: paletteDisplayModeRef.current,
              autoClearSeconds: autoClearSecondsRef.current,
            };
            updateSettingsMut({ settings: full }).catch(() => {});
          }
        }, 500);
        return merged;
      });
    },
    [updateSettingsMut],
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
        accessoryCount: computeLayerCount(settings.accessoryRange),
        scarCount: computeLayerCount(settings.scarRange),
        tortieCount: computeLayerCount(settings.tortieRange),
      });

      // Store result for export buttons
      lastResultRef.current = {
        canvas: result.canvas,
        params: result.params as unknown as Record<string, unknown>,
      };
      const p = result.params as unknown as Record<string, unknown>;
      setHasTint(Boolean(p.darkForest || p.darkMode || p.dead));

      // Flush settings (including creatorName) to Convex so OBS has them before spinning
      clearTimeout(syncTimer.current);
      const settingsWithCreator = {
        ...settings,
        creatorName: creatorNameDraft,
      };
      await updateSettingsMut({ settings: settingsWithCreator });

      await triggerSpinMut({
        params: result.params,
        slots: result.slotSelections,
        countdownSeconds,
      });

      // Persist to cat_profile (same as SingleCatPlus)
      const catData = {
        params: result.params,
        accessorySlots: result.slotSelections?.accessories ?? [],
        scarSlots: result.slotSelections?.scars ?? [],
        tortieSlots: result.slotSelections?.tortie ?? [],
        counts: {
          accessories: (result.slotSelections?.accessories ?? []).filter(
            (s: string) => s !== "none",
          ).length,
          scars: (result.slotSelections?.scars ?? []).filter(
            (s: string) => s !== "none",
          ).length,
          tortie: (result.slotSelections?.tortie ?? []).filter(Boolean).length,
        },
      };
      const profile = await createMapper({
        catData,
        creatorName: creatorNameDraft.trim() || undefined,
      });
      if (profile) {
        setCurrentProfileId(profile.id);
        setCurrentSlug(profile.slug);
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        setShareLink(`${origin}/view/${profile.slug}`);
        setCatNameDraft("");
        setMetaDirty(false);
      }

      toast.success("Spin triggered!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to trigger spin",
      );
    } finally {
      setSpinning(false);
    }
  }, [
    generator,
    spinning,
    settings,
    countdownSeconds,
    creatorNameDraft,
    triggerSpinMut,
    createMapper,
    updateSettingsMut,
  ]);

  // Save meta (cat name / creator name) to existing profile
  const handleSaveMeta = useCallback(async () => {
    if (!currentProfileId) {
      toast.error("Roll a cat before saving.");
      return;
    }
    setMetaSaving(true);
    try {
      await updateMapperMeta({
        id: currentProfileId as Id<"cat_profile">,
        catName: catNameDraft.trim() || undefined,
        creatorName: creatorNameDraft.trim() || undefined,
      });
      setMetaDirty(false);
      toast.success("Saved to history!");
    } catch (_err) {
      toast.error("Unable to save history entry. Please try again.");
    } finally {
      setMetaSaving(false);
    }
  }, [currentProfileId, catNameDraft, creatorNameDraft, updateMapperMeta]);

  // Variant selection handler
  const handleVariantSelect = useCallback(
    (variantId: string | null) => {
      if (!variantId) {
        variants.setActive(null);
        updateSettings(DEFAULT_SINGLE_CAT_SETTINGS);
        return;
      }
      const variant = variants.store.variants.find((v) => v.id === variantId);
      if (!variant) return;
      variants.setActive(variantId);
      updateSettings(variant.settings);
    },
    [variants, updateSettings],
  );

  // Export handlers — copy / download the last generated cat
  const FULL_EXPORT_SIZE = 700;

  const copyCanvasToClipboard = useCallback(
    async (
      canvas: HTMLCanvasElement,
      successMsg: string,
      fallbackName: string,
    ) => {
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/png",
          );
        });
        if (navigator.clipboard && "write" in navigator.clipboard) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          toast.success(successMsg);
          return;
        }
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fallbackName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Image downloaded.");
      } catch {
        toast.error("Failed to copy image.");
      }
    },
    [],
  );

  const exportCat = useCallback(
    async (options?: { noTint?: boolean; size?: number }) => {
      const last = lastResultRef.current;
      if (!last || !generator) return;
      let sourceCanvas = last.canvas as HTMLCanvasElement;
      if (options?.noTint) {
        const params = {
          ...last.params,
          darkForest: false,
          darkMode: false,
          dead: false,
        };
        const rendered = await generator.generateCat(params);
        sourceCanvas = rendered.canvas as HTMLCanvasElement;
      }
      const size = options?.size ?? FULL_EXPORT_SIZE;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size;
      exportCanvas.height = size;
      const ctx = exportCanvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sourceCanvas, 0, 0, size, size);
      }
      const label = options?.noTint
        ? `Copied (no tint) ${size}x${size}!`
        : `Copied ${size}x${size}!`;
      await copyCanvasToClipboard(
        exportCanvas,
        label,
        options?.noTint ? "cat-no-tint" : "cat",
      );
    },
    [generator, copyCanvasToClipboard],
  );

  const handleDownload = useCallback(() => {
    const last = lastResultRef.current;
    if (!last) return;
    const canvas = last.canvas as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cat.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Downloaded PNG");
    }, "image/png");
  }, []);

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
          type="button"
          onClick={() => clerk.openSignIn()}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border/50",
            "px-5 py-2.5 text-sm font-semibold text-muted-foreground",
            "transition hover:bg-foreground hover:text-background",
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
            {/* Timing Variant */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Variant
              </span>
              <select
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
                        syncLobbySettings({ paletteDisplayMode: m });
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
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(obsUrl);
                    toast.success("OBS URL copied!");
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5",
                    "text-xs font-medium text-muted-foreground transition",
                    "hover:bg-foreground hover:text-background",
                  )}
                >
                  <Copy className="size-3" />
                  Copy URL
                </button>
              )}
            </div>
            <div
              ref={previewContainerRef}
              className="relative aspect-video overflow-hidden rounded-lg border border-border/30 bg-black/90"
            >
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
            {/* Spin + sliders row */}
            <div className="mb-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSpin}
                disabled={spinning || !generatorReady}
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

            {/* Scene buttons */}
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  {
                    label: "Lobby",
                    desc: "Settings + cats",
                    icon: Eye,
                    onClick: () => showLobbyMut().catch(console.error),
                    active: false,
                    danger: false,
                  },
                  {
                    label: "BRB",
                    desc: "Cats only",
                    icon: Timer,
                    onClick: () => showBrbMut().catch(console.error),
                    active: false,
                    danger: false,
                  },
                  {
                    label: "Test",
                    desc: session?.testMode ? "On" : "Debug border",
                    icon: Radio,
                    onClick: () => toggleTestModeMut().catch(console.error),
                    active: session?.testMode ?? false,
                    danger: false,
                  },
                  {
                    label: "Clear",
                    desc: "Hide overlay",
                    icon: Square,
                    onClick: () => clearOverlayMut().catch(console.error),
                    active: false,
                    danger: true,
                  },
                ] as const
              ).map((btn) => {
                let borderClass: string;
                let iconClass: string;
                if (btn.active) {
                  borderClass = "border-amber-500/50 bg-amber-500/10";
                  iconClass = "text-amber-500";
                } else if (btn.danger) {
                  borderClass =
                    "border-border/50 hover:border-red-500/40 hover:bg-red-500/5";
                  iconClass = "text-muted-foreground group-hover:text-red-400";
                } else {
                  borderClass =
                    "border-border/50 hover:border-amber-500/40 hover:bg-amber-500/5";
                  iconClass =
                    "text-muted-foreground group-hover:text-amber-500";
                }
                return (
                  <button
                    type="button"
                    key={btn.label}
                    onClick={btn.onClick}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                      borderClass,
                    )}
                  >
                    <btn.icon
                      className={cn("size-4 shrink-0 transition", iconClass)}
                    />
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-xs font-semibold",
                          btn.active ? "text-amber-400" : "text-foreground",
                        )}
                      >
                        {btn.label}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground/60">
                        {btn.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Lobby Animation */}
      <section className="rounded-2xl border border-border/40 bg-background/80 backdrop-blur">
        {/* Header with mode selector */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Lobby Animation
          </h3>
          <div className="flex items-center gap-1 rounded-lg border border-border/40 p-0.5">
            {(
              [
                { key: "fruit-ninja" as const, label: "Fruit Ninja" },
                { key: "matrix" as const, label: "Matrix" },
                { key: "dvd" as const, label: "DVD Bounce" },
              ] as const
            ).map(({ key, label }) => {
              const defaults = LOBBY_MODE_DEFAULTS[key];
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setLobbyMode(key);
                    setLobbyCatCount(defaults.cats);
                    setLobbyMoveSpeed(defaults.move);
                    setLobbySwapSpeed(defaults.swap);
                    syncLobbySettings({
                      lobbyMode: key,
                      lobbyCatCount: defaults.cats,
                      lobbyMoveSpeed: defaults.move,
                      lobbySwapSpeed: defaults.swap,
                    });
                  }}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition",
                    lobbyMode === key
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders grid — 3 columns, clean rows */}
        <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <SliderControl
            label="Cats on Screen"
            value={lobbyCatCount}
            min={1}
            max={12}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => {
              setLobbyCatCount(v);
              syncLobbySettings({ lobbyCatCount: v });
            }}
          />
          <SliderControl
            label="Move Speed"
            value={lobbyMoveSpeed}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbyMoveSpeed(v);
              syncLobbySettings({ lobbyMoveSpeed: v });
            }}
          />
          <SliderControl
            label="Frame Swap"
            value={lobbySwapSpeed}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbySwapSpeed(v);
              syncLobbySettings({ lobbySwapSpeed: v });
            }}
          />
          <SliderControl
            label="Min Cat Size"
            value={lobbyCatMinSize}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbyCatMinSize(v);
              if (v > lobbyCatMaxSize) setLobbyCatMaxSize(v);
              syncLobbySettings({
                lobbyCatMinSize: v,
                lobbyCatMaxSize: Math.max(v, lobbyCatMaxSize),
              });
            }}
          />
          <SliderControl
            label="Max Cat Size"
            value={lobbyCatMaxSize}
            min={0.25}
            max={4}
            step={0.25}
            format={formatMultiplier}
            onChange={(v) => {
              setLobbyCatMaxSize(v);
              if (v < lobbyCatMinSize) setLobbyCatMinSize(v);
              syncLobbySettings({
                lobbyCatMaxSize: v,
                lobbyCatMinSize: Math.min(v, lobbyCatMinSize),
              });
            }}
          />
          <SliderControl
            label="Auto-Clear"
            value={autoClearSeconds}
            min={0}
            max={120}
            step={5}
            format={(v) => (v === 0 ? "Off" : `${v}s`)}
            onChange={(v) => {
              setAutoClearSeconds(v);
              syncLobbySettings({ autoClearSeconds: v });
            }}
          />
        </div>

        {/* Footer action */}
        <div className="border-t border-border/30 px-5 py-2.5">
          <button
            type="button"
            onClick={() => syncLobbySettings({ lobbyClearSeq: Date.now() })}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 transition",
              "hover:text-red-400",
            )}
          >
            <RotateCcw className="size-3" />
            Clear all cats from screen
          </button>
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
            onClick={handleDownload}
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
              disabled={!currentProfileId || metaSaving || !metaDirty}
            >
              <Sparkles className="size-4" /> Save to History
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

// ---------------------------------------------------------------------------
// Settings Code — encode/decode portable 6-word settings codes
// ---------------------------------------------------------------------------

function SettingsCode({
  settings,
  onApply,
}: {
  settings: SingleCatSettings;
  onApply: (next: Partial<SingleCatSettings>) => void;
}) {
  const [codeInput, setCodeInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);

  const liveCode = useMemo(
    () =>
      encodePortableSettings({
        accessoryRange: settings.accessoryRange,
        scarRange: settings.scarRange,
        tortieRange: settings.tortieRange,
        exactLayerCounts: settings.exactLayerCounts,
        afterlifeMode: settings.afterlifeMode,
        includeBaseColours: settings.includeBaseColours,
        extendedModes: settings.extendedModes,
      }),
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

// ---------------------------------------------------------------------------
// SliderControl — labeled slider with value readout
// ---------------------------------------------------------------------------

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tabular-nums text-sm font-semibold text-foreground">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border/40 accent-amber-500 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:shadow-amber-900/30"
      />
    </label>
  );
}
