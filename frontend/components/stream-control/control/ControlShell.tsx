"use client";

/**
 * ControlShell — owns all stream-control state, Convex wiring, and command
 * handlers (moved verbatim from StreamControlClient.tsx), and renders the
 * tabbed control layout: a persistent StatusBar + OBS preview alongside
 * per-feature tab panels. Panels consume the state via StreamControlContext.
 */

import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Cat, Dna, Loader2, Play, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BatchStreamCommand } from "@/lib/adoption/streamBatch";
import {
  catDataToLegacyPersistence,
  catParamsToLegacyPersistence,
} from "@/lib/cat-system";
import { syncChangedRegistryTraitsFromLegacy } from "@/lib/cat-system/document";
import { normalizePortableSettingsCode } from "@/lib/portable-settings";
import { cn } from "@/lib/utils";
import { withResolvedAfterlifeParams } from "@/utils/catSettingsHelpers";
import {
  DEFAULT_SINGLE_CAT_SETTINGS,
  parseSingleCatPayload,
  type SingleCatSettings,
} from "@/utils/singleCatVariants";
import { useVariants } from "@/utils/variants";
import { getActiveStreamScene } from "../sceneState";
import { BatchCullBoard } from "./BatchCullBoard";
import { BatchPanel } from "./BatchPanel";
import { type StreamControlApi, StreamControlContext } from "./context";
import { EvolutionPanel } from "./EvolutionPanel";
import {
  buildStreamGeneratorOptions,
  type CanvasExportSource,
  canvasToPngBlob,
  FULL_EXPORT_SIZE,
  isLobbyMode,
  isNonNegativeFiniteNumber,
  isPaletteDisplayMode,
  isPositiveFiniteNumber,
  type LobbyMode,
} from "./helpers";
import { PreviewCard } from "./PreviewCard";
import { SettingsPanel } from "./SettingsPanel";
import { SpinPanel } from "./SpinPanel";
import { StatusBar } from "./StatusBar";
import { useFollowGuard } from "./useFollowGuard";

type ControlTabId = "spin" | "evolution" | "batch" | "settings";

const TABS: Array<{
  id: ControlTabId;
  label: string;
  icon: typeof Play;
}> = [
  { id: "spin", label: "Spin", icon: Play },
  { id: "evolution", label: "Evolution", icon: Dna },
  { id: "batch", label: "Batch", icon: Cat },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function ControlShell() {
  const clerk = useClerk();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const session = useQuery(
    api.catStream.getSession,
    isAuthenticated ? {} : "skip",
  );

  const ensureSession = useMutation(api.catStream.ensureSession);
  const updateSettingsMut = useMutation(api.catStream.updateSettings);
  const mergeSettingsMut = useMutation(api.catStream.mergeSettings);
  const triggerSpinMut = useMutation(api.catStream.triggerSpin);
  const attachViewSlugMut = useMutation(api.catStream.attachViewSlug);
  const triggerWheelMut = useMutation(api.catStream.triggerWheel);
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
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [sceneCommandPending, setSceneCommandPending] = useState<string | null>(
    null,
  );
  const [initialized, setInitialized] = useState(false);

  // Cat profile state — for "Links & Actions" / history entry
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [catNameDraft, setCatNameDraft] = useState("");
  const [creatorNameDraft, setCreatorNameDraft] = useState("");
  const [metaDirty, setMetaDirty] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const creatorFilledRef = useRef(false);
  const spinRequestSeqRef = useRef(0);
  const lastResultRef = useRef<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
    params: Record<string, unknown>;
    slots?: {
      accessories?: string[];
      scars?: string[];
      tortie?: unknown[];
    };
  } | null>(null);
  const [hasTint, setHasTint] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const clearSeqRef = useRef(0);

  // Lobby animation settings
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>("fruit-ninja");
  const [lobbyCatCount, setLobbyCatCount] = useState(4);
  const [lobbyMoveSpeed, setLobbyMoveSpeed] = useState(1.0);
  const [lobbySwapSpeed, setLobbySwapSpeed] = useState(1.0);
  const [lobbyCatMinSize, setLobbyCatMinSize] = useState(1.0);
  const [lobbyCatMaxSize, setLobbyCatMaxSize] = useState(2.0);
  const [paletteDisplayMode, setPaletteDisplayMode] = useState<"cycle" | "all">(
    "cycle",
  );
  const [lobbyAutoClearSeconds, setLobbyAutoClearSeconds] = useState(20);
  const [resultAutoClearEnabled, setResultAutoClearEnabled] = useState(true);
  const [resultAutoClearSeconds, setResultAutoClearSeconds] = useState(30);
  const [brbSettingsCode, setBrbSettingsCode] = useState("");
  const [brbSettingsDraft, setBrbSettingsDraft] = useState("");

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
  const lobbyAutoClearSecondsRef = useRef(lobbyAutoClearSeconds);
  lobbyAutoClearSecondsRef.current = lobbyAutoClearSeconds;
  const paletteDisplayModeRef = useRef(paletteDisplayMode);
  paletteDisplayModeRef.current = paletteDisplayMode;
  const resultAutoClearEnabledRef = useRef(resultAutoClearEnabled);
  resultAutoClearEnabledRef.current = resultAutoClearEnabled;
  const resultAutoClearSecondsRef = useRef(resultAutoClearSeconds);
  resultAutoClearSecondsRef.current = resultAutoClearSeconds;
  const brbSettingsCodeRef = useRef(brbSettingsCode);
  brbSettingsCodeRef.current = brbSettingsCode;

  // Local edits must win over in-flight settings echoes — see useFollowGuard.
  const { touch: touchLocalEdit, deferIfEditing, retryTick } = useFollowGuard();

  const buildSessionSettings = useCallback(
    (
      baseSettings: SingleCatSettings,
      overrides: Record<string, unknown> = {},
    ) => ({
      // Start from the stored settings so fields synced by other panels
      // (lobbyInfoMode, evolutionInfo, batchInfo, obs appearance, …) survive
      // writes that don't know about them.
      ...((sessionRef.current?.settings as Record<string, unknown>) ?? {}),
      ...baseSettings,
      lobbyMode: lobbyModeRef.current,
      lobbyCatCount: lobbyCatCountRef.current,
      lobbyMoveSpeed: lobbyMoveSpeedRef.current,
      lobbySwapSpeed: lobbySwapSpeedRef.current,
      lobbyCatMinSize: lobbyCatMinSizeRef.current,
      lobbyCatMaxSize: lobbyCatMaxSizeRef.current,
      lobbyAutoClearSeconds: lobbyAutoClearSecondsRef.current,
      paletteDisplayMode: paletteDisplayModeRef.current,
      resultAutoClearEnabled: resultAutoClearEnabledRef.current,
      resultAutoClearSeconds: resultAutoClearSecondsRef.current,
      brbSettingsCode: brbSettingsCodeRef.current,
      ...overrides,
    }),
    [],
  );

  const saveSessionSettings = useCallback(
    async (settingsSnapshot: Record<string, unknown>) => {
      touchLocalEdit();
      if (!sessionRef.current) {
        await ensureSession({ settings: settingsSnapshot });
        return;
      }
      await updateSettingsMut({ settings: settingsSnapshot });
    },
    [ensureSession, updateSettingsMut, touchLocalEdit],
  );

  // Instant sync for session settings (lobby + result auto-clear) — no debounce
  const syncSessionSettings = useCallback(
    (updates: Record<string, unknown>) => {
      touchLocalEdit();
      // Server-side merge: concurrent per-field syncs (lobby sliders, mode
      // info, overlay appearance) must not clobber each other.
      if (!sessionRef.current) {
        const merged = buildSessionSettings(settingsRef.current, updates);
        void saveSessionSettings(merged).catch((err) => {
          console.error(
            "[StreamControl] Failed to sync settings to Convex",
            err,
          );
          toast.error("Failed to save stream settings");
        });
        return;
      }
      void mergeSettingsMut({ settings: updates }).catch((err) => {
        console.error("[StreamControl] Failed to sync settings to Convex", err);
        toast.error("Failed to save stream settings");
      });
    },
    [
      buildSessionSettings,
      saveSessionSettings,
      mergeSettingsMut,
      touchLocalEdit,
    ],
  );

  const runSceneCommand = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      if (sceneCommandPending || spinning || wheelSpinning) return;
      setSceneCommandPending(label);
      try {
        await saveSessionSettings(buildSessionSettings(settingsRef.current));
        await action();
      } catch (err) {
        console.error(`[StreamControl] Failed to run ${label} command`, err);
        toast.error(
          err instanceof Error ? err.message : `Failed to run ${label}`,
        );
      } finally {
        setSceneCommandPending(null);
      }
    },
    [
      buildSessionSettings,
      saveSessionSettings,
      sceneCommandPending,
      spinning,
      wheelSpinning,
    ],
  );

  // Apply the session's settings to local state — on first load AND on
  // every remote change, so a second open control tab stays in sync.
  const applySessionSettings = useCallback(
    (s: Record<string, unknown>, firstLoad: boolean) => {
      const parsed = parseSingleCatPayload(s);
      setSettings((prev) =>
        JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed,
      );
      if (isLobbyMode(s.lobbyMode)) setLobbyMode(s.lobbyMode);
      if (isPositiveFiniteNumber(s.lobbyCatCount))
        setLobbyCatCount(s.lobbyCatCount);
      if (isNonNegativeFiniteNumber(s.lobbyMoveSpeed))
        setLobbyMoveSpeed(s.lobbyMoveSpeed);
      if (isNonNegativeFiniteNumber(s.lobbySwapSpeed))
        setLobbySwapSpeed(s.lobbySwapSpeed);
      if (isNonNegativeFiniteNumber(s.lobbyCatMinSize))
        setLobbyCatMinSize(s.lobbyCatMinSize);
      if (isNonNegativeFiniteNumber(s.lobbyCatMaxSize))
        setLobbyCatMaxSize(s.lobbyCatMaxSize);
      if (isPositiveFiniteNumber(s.lobbyAutoClearSeconds)) {
        setLobbyAutoClearSeconds(s.lobbyAutoClearSeconds);
      }
      if (isPaletteDisplayMode(s.paletteDisplayMode))
        setPaletteDisplayMode(s.paletteDisplayMode);
      const savedResultAutoClearSeconds = isPositiveFiniteNumber(
        s.resultAutoClearSeconds,
      )
        ? s.resultAutoClearSeconds
        : isPositiveFiniteNumber(s.autoClearSeconds)
          ? s.autoClearSeconds
          : 30;
      setResultAutoClearSeconds(savedResultAutoClearSeconds);
      if (typeof s.resultAutoClearEnabled === "boolean") {
        setResultAutoClearEnabled(s.resultAutoClearEnabled);
      } else if (typeof s.autoClearEnabled === "boolean") {
        setResultAutoClearEnabled(s.autoClearEnabled);
      } else {
        setResultAutoClearEnabled(
          (s.autoClearSeconds as number | undefined) !== 0,
        );
      }
      if (typeof s.brbSettingsCode === "string") {
        const storedCode = s.brbSettingsCode.trim();
        const normalized = storedCode
          ? normalizePortableSettingsCode(storedCode)
          : "";
        const displayCode = normalized ?? storedCode;
        // Only touch the draft when the saved code actually changed, so a
        // half-typed draft survives unrelated settings echoes.
        if (displayCode !== brbSettingsCodeRef.current) {
          setBrbSettingsCode(displayCode);
          setBrbSettingsDraft(displayCode);
        }
      }
      if (
        isPositiveFiniteNumber(s.lobbyClearSeq) &&
        s.lobbyClearSeq > clearSeqRef.current
      ) {
        clearSeqRef.current = s.lobbyClearSeq;
      }
      // The creator name is a typing field — only seed it once.
      if (firstLoad && typeof s.creatorName === "string" && s.creatorName) {
        setCreatorNameDraft(s.creatorName);
        creatorFilledRef.current = true;
      }
    },
    [],
  );

  const lastAppliedSettingsRef = useRef<string | null>(null);
  useEffect(() => {
    void retryTick; // re-runs the follow once a deferred apply is due
    if (!session) return;
    const raw =
      session.settings && typeof session.settings === "object"
        ? (session.settings as Record<string, unknown>)
        : null;
    const json = raw ? JSON.stringify(raw) : "";
    if (initialized && json === lastAppliedSettingsRef.current) return;
    if (initialized) {
      // A fresh local edit wins over remote echoes — retry once it settles.
      const cancelRetry = deferIfEditing();
      if (cancelRetry) return cancelRetry;
    }
    lastAppliedSettingsRef.current = json;
    if (raw) applySessionSettings(raw, !initialized);
    if (!initialized) setInitialized(true);
  }, [session, initialized, applySessionSettings, deferIfEditing, retryTick]);

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

  const updateSettings = useCallback(
    (next: Partial<SingleCatSettings>) => {
      touchLocalEdit();
      setSettings((prev) => {
        const merged = { ...prev, ...next };
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => {
          const full = buildSessionSettings(merged);
          void saveSessionSettings(full).catch((err) => {
            console.error(
              "[StreamControl] Failed to sync settings to Convex",
              err,
            );
            toast.error("Failed to save stream settings");
          });
        }, 500);
        return merged;
      });
    },
    [buildSessionSettings, saveSessionSettings, touchLocalEdit],
  );

  // Spin handler
  const handleSpin = useCallback(async () => {
    if (!generator || spinning || wheelSpinning || sceneCommandPending) return;
    const requestSeq = ++spinRequestSeqRef.current;
    setSpinning(true);
    setHistorySaving(false);
    try {
      if (!generator.generateRandomCat) {
        throw new Error("Generator does not support random cat generation");
      }
      const result = await generator.generateRandomCat(
        buildStreamGeneratorOptions(settings),
      );

      const resolvedParams = withResolvedAfterlifeParams(
        result.params as unknown as Record<string, unknown>,
        settings.afterlifeMode,
      );
      syncChangedRegistryTraitsFromLegacy(resolvedParams, [
        "darkForest",
        "dead",
      ]);
      const generatedHasTint = Boolean(
        resolvedParams.darkForest || resolvedParams.dead,
      );
      const resolvedCanvas = (await generator.generateCat(resolvedParams))
        .canvas;

      const nextLastResult = {
        canvas: resolvedCanvas,
        params: resolvedParams,
        slots: result.slotSelections,
      };
      // Flush settings (including creatorName) to Convex so OBS has them before spinning
      clearTimeout(syncTimer.current);
      const settingsWithCreator = buildSessionSettings(settings, {
        creatorName: creatorNameDraft,
      });
      await saveSessionSettings(settingsWithCreator);

      const spinSeq = await triggerSpinMut({
        params: catParamsToLegacyPersistence(resolvedParams),
        slots: result.slotSelections,
        countdownSeconds,
      });
      setSpinning(false);

      // Store result only after the live stream command succeeds.
      lastResultRef.current = nextLastResult;
      setHasTint(generatedHasTint);
      setCurrentProfileId(null);
      setCurrentSlug(null);
      setShareLink(null);
      setMetaDirty(false);
      toast.success("Spin triggered!");

      setHistorySaving(true);
      try {
        // Persist to cat_profile (same as SingleCatPlus)
        const catData = {
          params: resolvedParams,
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
            tortie: (result.slotSelections?.tortie ?? []).filter(Boolean)
              .length,
          },
        };
        const profile = await createMapper({
          catData: catDataToLegacyPersistence(catData),
          creatorName: creatorNameDraft.trim() || undefined,
        });
        if (!profile) {
          throw new Error("History save returned no profile");
        }
        if (spinRequestSeqRef.current !== requestSeq) return;
        setCurrentProfileId(profile.id);
        setCurrentSlug(profile.slug);
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        setShareLink(`${origin}/view/${profile.slug}`);
        setCatNameDraft("");
        setMetaDirty(false);
        // Stamp the slug onto the live command so the overlay shows the QR.
        // Best-effort: a newer command may already have replaced the spin.
        if (typeof spinSeq === "number") {
          void attachViewSlugMut({ seq: spinSeq, slug: profile.slug }).catch(
            (err) => {
              console.warn(
                "[StreamControl] Failed to attach view slug to spin",
                err,
              );
            },
          );
        }
      } catch (err) {
        if (spinRequestSeqRef.current !== requestSeq) return;
        console.error("Failed to save stream history entry", err);
        toast.warning("Spin triggered, but history save failed.");
      } finally {
        if (spinRequestSeqRef.current === requestSeq) {
          setHistorySaving(false);
        }
      }
    } catch (err) {
      if (spinRequestSeqRef.current === requestSeq) {
        setHistorySaving(false);
      }
      toast.error(
        err instanceof Error ? err.message : "Failed to trigger spin",
      );
    } finally {
      if (spinRequestSeqRef.current === requestSeq) {
        setSpinning(false);
      }
    }
  }, [
    buildSessionSettings,
    generator,
    spinning,
    wheelSpinning,
    sceneCommandPending,
    settings,
    countdownSeconds,
    creatorNameDraft,
    triggerSpinMut,
    attachViewSlugMut,
    createMapper,
    saveSessionSettings,
  ]);

  const handleWheelSpin = useCallback(async () => {
    if (spinning || wheelSpinning || sceneCommandPending) return;

    const command = session?.currentCommand as
      | {
          type?: string;
          params?: unknown;
        }
      | undefined;

    if (command?.type !== "spin" || command.params === undefined) {
      toast.error("Spin a cat before spinning the wheel.");
      return;
    }

    setWheelSpinning(true);
    try {
      await triggerWheelMut({});
      toast.success("Wheel triggered!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to trigger wheel",
      );
    } finally {
      setWheelSpinning(false);
    }
  }, [
    session?.currentCommand,
    spinning,
    sceneCommandPending,
    triggerWheelMut,
    wheelSpinning,
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

  const saveBrbSettingsCode = useCallback(
    async (rawCode: string) => {
      const normalized = rawCode.trim()
        ? normalizePortableSettingsCode(rawCode)
        : "";
      if (normalized === null) {
        toast.error("Invalid BRB settings code");
        return false;
      }

      clearTimeout(syncTimer.current);
      const previousCode = brbSettingsCodeRef.current;
      brbSettingsCodeRef.current = normalized;
      try {
        await saveSessionSettings(
          buildSessionSettings(settingsRef.current, {
            brbSettingsCode: normalized,
          }),
        );
      } catch {
        brbSettingsCodeRef.current = previousCode;
        toast.error("Failed to save BRB preset");
        return false;
      }

      setBrbSettingsCode(normalized);
      setBrbSettingsDraft(normalized);
      toast.success(normalized ? "BRB preset saved" : "BRB preset cleared");
      return true;
    },
    [buildSessionSettings, saveSessionSettings],
  );

  const copyCanvasToClipboard = useCallback(
    async (
      canvas: CanvasExportSource,
      successMsg: string,
      fallbackName: string,
    ) => {
      try {
        const blob = await canvasToPngBlob(canvas);
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
      let sourceCanvas: CanvasExportSource = last.canvas;
      if (options?.noTint) {
        const params = {
          ...last.params,
          darkForest: false,
          darkMode: false,
          dead: false,
        };
        syncChangedRegistryTraitsFromLegacy(params, ["darkForest", "dead"]);
        const rendered = await generator.generateCat(params);
        sourceCanvas = rendered.canvas;
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

  const handleDownload = useCallback(async () => {
    const last = lastResultRef.current;
    if (!last) {
      toast.error("Roll a cat before downloading.");
      return;
    }

    try {
      const blob = await canvasToPngBlob(last.canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cat.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Downloaded PNG");
    } catch {
      toast.error("Failed to download PNG");
    }
  }, []);

  const [activeTab, setActiveTab] = useState<ControlTabId>("spin");

  // Tell the lobby which mode's info to show (Scenes is not a mode).
  useEffect(() => {
    if (activeTab === "settings" || !initialized) return;
    syncSessionSettings({ lobbyInfoMode: activeTab });
  }, [activeTab, initialized, syncSessionSettings]);

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
  const fallbackCommand =
    (session?.currentCommand as
      | {
          type?: string;
          params?: unknown;
        }
      | undefined) ?? undefined;
  const hasWheelSource = Boolean(
    fallbackCommand?.type === "spin" && fallbackCommand.params !== undefined,
  );
  const commandBusy = spinning || wheelSpinning || sceneCommandPending !== null;
  const activeScene = getActiveStreamScene(session);
  const sessionCommand = session?.currentCommand;
  const currentBatchCommand =
    sessionCommand?.type === "batch" && sessionCommand.batch
      ? {
          ...(sessionCommand.batch as BatchStreamCommand),
          seq: sessionCommand.seq,
        }
      : null;
  const batchLiveState = session?.batchState ?? null;

  const controlApi: StreamControlApi = {
    testMode: Boolean(session?.testMode),
    obsUrl,
    activeScene,
    commandBusy,
    hasWheelSource,
    generatorReady,
    settings,
    updateSettings,
    syncSessionSettings,
    variants,
    handleVariantSelect,
    paletteDisplayMode,
    setPaletteDisplayMode,
    spinning,
    wheelSpinning,
    countdownSeconds,
    setCountdownSeconds,
    handleSpin,
    handleWheelSpin,
    resultAutoClearEnabled,
    setResultAutoClearEnabled,
    resultAutoClearSeconds,
    setResultAutoClearSeconds,
    runLobbyScene: () => void runSceneCommand("Lobby", () => showLobbyMut()),
    runBrbScene: () => void runSceneCommand("BRB", () => showBrbMut()),
    runTestScene: () => void runSceneCommand("Test", () => toggleTestModeMut()),
    runClearScene: () => void runSceneCommand("Clear", () => clearOverlayMut()),
    lobbyMode,
    setLobbyMode,
    lobbyCatCount,
    setLobbyCatCount,
    lobbyMoveSpeed,
    setLobbyMoveSpeed,
    lobbySwapSpeed,
    setLobbySwapSpeed,
    lobbyCatMinSize,
    setLobbyCatMinSize,
    lobbyCatMaxSize,
    setLobbyCatMaxSize,
    lobbyAutoClearSeconds,
    setLobbyAutoClearSeconds,
    clearLobbyCats: () =>
      syncSessionSettings({ lobbyClearSeq: ++clearSeqRef.current }),
    brbSettingsCode,
    brbSettingsDraft,
    setBrbSettingsDraft,
    saveBrbSettingsCode,
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
    currentBatchCommand,
    batchLiveState,
    rawSessionSettings:
      (session?.settings as Record<string, unknown> | undefined) ?? null,
    previewContainerRef,
  };

  return (
    <StreamControlContext.Provider value={controlApi}>
      <div className="space-y-6">
        <StatusBar />
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            {/* Tab strip */}
            <div
              role="tablist"
              aria-label="Stream control sections"
              className="mb-4 inline-flex items-center gap-1 rounded-xl border border-border/40 bg-background/60 p-1"
            >
              {TABS.map((tab) => (
                <button
                  type="button"
                  role="tab"
                  key={tab.id}
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition",
                    activeTab === tab.id
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Panels stay mounted so drafts and sliders keep their state */}
            <div className={cn(activeTab !== "spin" && "hidden")}>
              <SpinPanel />
            </div>
            <div className={cn(activeTab !== "evolution" && "hidden")}>
              <EvolutionPanel />
            </div>
            <div className={cn(activeTab !== "batch" && "hidden")}>
              <BatchPanel />
            </div>
            <div className={cn(activeTab !== "settings" && "hidden")}>
              <SettingsPanel />
            </div>
          </div>

          <PreviewCard />
        </div>

        {/* Full-width live elimination board — visible on every tab */}
        <BatchCullBoard />
      </div>
    </StreamControlContext.Provider>
  );
}
