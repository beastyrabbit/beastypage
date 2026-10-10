"use client";

import { useMutation } from "convex/react";
import { ArrowUpRight, Download, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { LayerRangeSelector } from "@/components/common/LayerRangeSelector";
import { PaletteMultiSelect } from "@/components/common/PaletteMultiSelect";
import {
  buildFlipSequence,
  buildParameterOptions,
  buildSharePayload,
  type CatState,
  coerceSpriteNumber,
  compositeCountFrame,
  computeStepDurations,
  copyCanvasToClipboard,
  DEFAULT_SPRITE_NUMBER,
  DISPLAY_SIZE,
  deriveOptionCounts,
  FULL_EXPORT_SIZE,
  type GenerationCounts,
  GLOBAL_PRESETS,
  getBaseFrameDuration,
  getSpeedSettings,
  type LayerRowState,
  logTimingReport,
  PARAM_REVEAL_PAUSE,
  type ParamDefinition,
  type ParameterOptions,
  type ParamRow,
  PLACEHOLDER_COLOUR,
  PRE_SPIN_DELAY,
  ROLLER_REVEAL_HOLD,
  type SpriteMapperApi,
  sanitizeForBuilder,
  type TimingSnapshot,
  type TortieSlot,
  type VariationFrame,
  wait,
} from "@/components/stream-control/obs/spinSupport";
import CopyIcon from "@/components/ui/copy-icon";
import ExternalLinkIcon from "@/components/ui/external-link-icon";
import PaintIcon from "@/components/ui/paint-icon";
import RefreshIcon from "@/components/ui/refresh-icon";
import SendHorizontalIcon from "@/components/ui/send-horizontal-icon";
import SparklesIcon from "@/components/ui/sparkles-icon";
import XIcon from "@/components/ui/x-icon";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { track } from "@/lib/analytics";
import {
  catDataToLegacyPersistence,
  syncChangedRegistryTraitsFromLegacy,
} from "@/lib/cat-system";
import {
  getCoatChoiceValue,
  getCoatPatternName,
} from "@/lib/cat-v3/coatPatterns";
import {
  DEFAULT_POSE_NAME,
  formatPoseName,
  getAvailablePoseNames,
} from "@/lib/cat-v3/poseOptions";
import type { CatParams } from "@/lib/cat-v3/types";
// `encodeCatShare` is still defined in the legacy pipeline and gives us a
// portable payload for the old viewer and future React viewer work.
import { createCatShare, encodeCatShare } from "@/lib/catShare";
import type { PaletteId } from "@/lib/palettes";
import type { SingleCatPortableSettings } from "@/lib/portable-settings";
import {
  decodePortableSettings,
  encodePortableSettings,
} from "@/lib/portable-settings";
import {
  type CountRevealGroup,
  prefetchCountReveal,
  prepareCountReveal,
} from "@/lib/single-cat/spin/countReveal";
import {
  isAnimatableParam,
  readSpinPools,
  type SpinParamRoute,
  spinParamRoute,
  type TortieSlotSpin,
  type TortieStageSpin,
  tortieStageCandidate,
} from "@/lib/single-cat/spin/descriptors";
import {
  createSpinFrameLoader,
  SpinLoaderDisposedError,
} from "@/lib/single-cat/spin/frameLoader";
import {
  buildSpinPlan,
  type EmptySlotsPhase,
  type ParamPhase,
  prefetchSpin,
  type SpinPlan,
  type StringSlotPhase,
  type TortieSlotPhase,
} from "@/lib/single-cat/spin/spinPlan";
import type { SpinFrameLoader } from "@/lib/single-cat/spin/types";
import { useDefaultCreatorName } from "@/lib/useDefaultCreatorName";
import { cn } from "@/lib/utils";
import {
  AFTERLIFE_OPTIONS,
  computeLayerCount,
  resolveAfterlife,
} from "@/utils/catSettingsHelpers";
import {
  type AfterlifeOption,
  DEFAULT_SINGLE_CAT_SETTINGS,
  type ExtendedMode,
  type LayerRange,
  type SingleCatSettings,
  singleCatSettingsEqual,
} from "../../utils/singleCatVariants";
import {
  clampDelay,
  computeDefaultTotal,
  computeTimingTotals,
  DEFAULT_TIMING_CONFIG,
  getDelayForKey,
  getPresetValues,
  getRegistryRevealDefinition,
  getRegistryRevealValue,
  isParamTimingKey,
  MIN_SAFE_STEP_MS,
  PARAM_DEFAULT_STEP_COUNTS,
  REGISTRY_REVEAL_SEQUENCE as PARAM_SEQUENCE,
  PARAM_TIMING_LABELS,
  PARAM_TIMING_ORDER,
  PARAM_TIMING_PRESETS,
  type ParamTimingKey,
  type SpinTimingConfig,
  stepCountsToMetrics,
  type TimingPresetSet,
} from "../../utils/spinTiming";
import { useVariants } from "../../utils/variants";
import { LayerCountModeSelector } from "../common/LayerCountModeSelector";
import { VariantBar } from "../common/VariantBar";

export type { AfterlifeOption } from "../../utils/singleCatVariants";

interface SpriteVariation {
  id: string;
  spriteNumber: number;
  poseName: string;
  name: string;
  dataUrl: string;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0.00 s";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(0)} ms`;
}

const LAYER_ROW_STATUS_CLASSES: Record<LayerRowState["status"], string> = {
  active: "border-primary/60 bg-primary/10 text-primary",
  revealed: "border-border/40 text-foreground",
  idle: "border-border/20 text-muted-foreground",
};

const STRING_LAYER_LABELS = {
  accessory: { group: "Accessories", slot: "Accessory", rows: "accessories" },
  scar: { group: "Scars", slot: "Scar", rows: "scars" },
} as const;

function getGlobalPresetLabel(preset: keyof TimingPresetSet): string {
  if (preset === "slow") return "Slow";
  if (preset === "fast") return "Fast";
  return "Normal";
}

function getGenerateButtonLabel(
  initializing: boolean,
  isGenerating: boolean,
): string {
  if (initializing) return "Loading";
  if (isGenerating) return "Rolling...";
  return "Generate Cat";
}

const layerGroupLabels: Record<string, string> = Object.fromEntries(
  PARAM_SEQUENCE.filter((definition) => definition.strategy !== "single").map(
    (definition) => [definition.layerKey, definition.groupLabel],
  ),
);

const DIALOG_FOCUS_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function handleManagedDialogKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  closeDialog: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(DIALOG_FOCUS_SELECTOR),
  ).filter((element) => element.offsetParent !== null);

  if (focusable.length === 0) {
    event.preventDefault();
    event.currentTarget.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

function formatValue(value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "none"
  ) {
    return "None";
  }
  const str = stringifyValue(value)
    .replace(/_/g, " ")
    .replace(/^\d+\s*-\s*/, "")
    .toLowerCase();
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPoseDisplayName(params: Partial<CatParams>): string {
  if (params.poseName) {
    return formatPoseName(params.poseName);
  }
  const spriteNumber = coerceSpriteNumber(params.spriteNumber);
  if (spriteNumber !== undefined) {
    return `Sprite ${spriteNumber}`;
  }
  return "Sprite";
}

function formatTortieLayer(layer: TortieSlot | null): string {
  if (!layer) return "None";
  return [layer.mask, layer.pattern, layer.colour]
    .map((part) => formatValue(part ?? "none"))
    .join(" • ");
}

function formatOptionDisplay(paramId: string, raw: unknown): string {
  if (paramId === "sprite") {
    if (typeof raw === "string" && !/^-?\d+$/.test(raw.trim())) {
      return formatPoseName(raw);
    }
    const spriteNumber = coerceSpriteNumber(raw);
    if (spriteNumber !== undefined) {
      return `Sprite ${spriteNumber}`;
    }
  }

  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }

  if (paramId === "pelt") {
    return getCoatPatternName(raw) ?? formatValue(raw);
  }

  if (raw === undefined || raw === null || raw === "") {
    return "None";
  }

  if (typeof raw === "string" && raw.toLowerCase() === "none") {
    return "None";
  }

  return formatValue(raw);
}

function getParameterValueForDisplay(
  paramId: string,
  params: Partial<CatParams>,
): string {
  switch (paramId) {
    case "colour":
      return formatValue(params.colour);
    case "pelt":
      return (
        getCoatPatternName(getCoatChoiceValue(params)) ??
        formatValue(params.peltName)
      );
    case "eyeColour":
      return formatValue(params.eyeColour);
    case "eyeColour2":
      if (!params.eyeColour2 || params.eyeColour2 === params.eyeColour) {
        return "None";
      }
      return formatValue(params.eyeColour2);
    case "tortie":
      return params.isTortie ? "Yes" : "No";
    case "tortieMask":
      return formatValue(params.tortieMask);
    case "tortiePattern":
      return formatValue(params.tortiePattern);
    case "tortieColour":
      return formatValue(params.tortieColour);
    case "tint":
      return formatValue(params.tint ?? "None");
    case "skinColour":
      return formatValue(params.skinColour);
    case "whitePatches":
      return formatValue(params.whitePatches ?? "None");
    case "points":
      return formatValue(params.points ?? "None");
    case "whitePatchesTint":
      return formatValue(params.whitePatchesTint ?? "None");
    case "vitiligo":
      return formatValue(params.vitiligo ?? "None");
    case "shading":
      return params.shading ? "Yes" : "No";
    case "reverse":
      return params.reverse ? "Yes" : "No";
    case "sprite":
      return getPoseDisplayName(params);
    default: {
      const definition = getRegistryRevealDefinition(paramId);
      const value = definition
        ? getRegistryRevealValue(params, definition)
        : undefined;
      if (Array.isArray(value)) return value.map(formatValue).join(", ");
      return formatOptionDisplay(paramId, value);
    }
  }
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Spin helpers
// ---------------------------------------------------------------------------

/** What every param reveal of one spin shares. */
interface ParamSpinContext {
  plan: SpinPlan;
  params: Partial<CatParams>;
  rollerOptions: ParameterOptions | null;
  loader: SpinFrameLoader;
  token: number;
}

/** A param's summary row index, set whenever React runs the append updater. */
interface ParamRowIndex {
  index: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Recalculated per step so timing edits apply mid-spin. */
function currentStepDuration(
  sequence: { delay: number }[],
  index: number,
  baseDelay: number,
  allowFastFlips: boolean,
): number {
  return (
    computeStepDurations(sequence.slice(index), baseDelay, allowFastFlips)[0] ??
    baseDelay
  );
}

function flipStepStatus(isFinal: boolean): "revealed" | "active" {
  return isFinal ? "revealed" : "active";
}

function slotDisplay(value: string | null): string {
  return value ? formatValue(value) : "None";
}

function joinSummary(summary: string[], separator: string): string {
  return summary.length > 0 ? summary.join(separator) : "None";
}

function revealParamRowById(
  rows: ParamRow[],
  id: string,
  value: string,
): ParamRow[] {
  return rows.map((row) =>
    row.id === id ? { ...row, value, status: "revealed" } : row,
  );
}

/** A flip step on a param row: the value only lands on the final frame. */
function flipParamRowById(
  rows: ParamRow[],
  id: string,
  display: string,
  isFinal: boolean,
): ParamRow[] {
  const update: Partial<ParamRow> = isFinal
    ? { value: display, status: "revealed" }
    : { status: "active" };
  return rows.map((row) => (row.id === id ? { ...row, ...update } : row));
}

function paramPauseDuration(
  speed: { paramPause: number; calmParamPause: number },
  mode: "flashy" | "calm",
  speedMultiplier: number,
): number {
  const basePause = mode === "calm" ? speed.calmParamPause : speed.paramPause;
  return Math.max(PARAM_REVEAL_PAUSE, basePause / speedMultiplier);
}

/** A count group's frames; `null` when its batch failed (logged and skipped). */
async function loadCountFrames(
  loader: SpinFrameLoader,
  group: CountRevealGroup,
): Promise<VariationFrame[] | null> {
  try {
    return await loader.frames(group.baseParams, group.descriptors);
  } catch (error) {
    if (error instanceof SpinLoaderDisposedError) throw error;
    console.warn(`Failed to render ${group.label} count frames`, error);
    return null;
  }
}

/** Count frames with their number composited in, the rolled count last. */
function countRevealFrames(
  rendered: VariationFrame[],
  count: number,
): VariationFrame[] {
  const frames: VariationFrame[] = rendered.map((frame) => ({
    option: frame.option,
    canvas: compositeCountFrame(frame.canvas, Number(frame.option.raw)),
  }));

  // Reorder frames so the rolled count is last (buildFlipSequence targets the last frame)
  const targetIdx = frames.findIndex((f) => f.option.raw === count);
  if (targetIdx !== -1 && targetIdx !== frames.length - 1) {
    const [target] = frames.splice(targetIdx, 1);
    frames.push(target);
  }
  return frames;
}

/** The rolled params with the colour fallback and the afterlife applied. */
function applyRolledAfterlife(
  rolled: CatParams,
  afterlifeMode: AfterlifeOption,
): { params: Partial<CatParams>; tinted: boolean } {
  const params: Partial<CatParams> = {
    ...rolled,
  };
  if (!params.colour) {
    params.colour = PLACEHOLDER_COLOUR;
  }

  const { darkForest: enableDarkForest, dead: enableDead } =
    resolveAfterlife(afterlifeMode);
  params.darkForest = enableDarkForest;
  params.darkMode = enableDarkForest;
  params.dead = enableDead;
  syncChangedRegistryTraitsFromLegacy(params, ["darkForest", "dead"]);
  return { params, tinted: Boolean(enableDarkForest || enableDead) };
}

function uniqueSlotValues(slots: string[]): string[] {
  return Array.from(
    new Set(
      slots.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry !== "none",
      ),
    ),
  );
}

/** Builder params for a rolled cat: its first accessory, scar, and tortie. */
function buildBuilderParams(
  params: Partial<CatParams>,
  slots: SpinPlan["slots"],
): ReturnType<typeof sanitizeForBuilder> {
  const tortieLayers = slots.tortieSlots.filter(Boolean) as TortieSlot[];
  const builderParams = sanitizeForBuilder(params, {
    accessory: uniqueSlotValues(slots.accessorySlots)[0] ?? null,
    scar: uniqueSlotValues(slots.scarSlots)[0] ?? null,
    tortie: tortieLayers.length > 0 ? tortieLayers[0] : null,
  });
  builderParams.spriteNumber = DEFAULT_SPRITE_NUMBER;
  builderParams.poseName = DEFAULT_POSE_NAME;
  return builderParams;
}

function appOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function withOrigin(origin: string, path: string): string {
  return origin ? `${origin}${path}` : path;
}

/** The existing encoding, else a fresh one; `existing` when encoding fails. */
function encodeLegacyShare(
  payload: ReturnType<typeof buildSharePayload>,
  existing: string | null,
): string | null {
  if (existing) return existing;
  try {
    return encodeCatShare(payload);
  } catch (err) {
    console.warn("Failed to encode share payload", err);
    return existing;
  }
}

// ---------------------------------------------------------------------------
// Settings Code section (inline sub-component for the aside)
// ---------------------------------------------------------------------------

interface SettingsCodeSectionProps {
  accessoryRange: LayerRange;
  scarRange: LayerRange;
  tortieRange: LayerRange;
  exactLayerCounts: boolean;
  afterlifeMode: AfterlifeOption;
  includeBaseColours: boolean;
  includeNewSprites: boolean;
  extendedModes: Set<ExtendedMode>;
  onApply: (portable: SingleCatPortableSettings) => void;
}

function SettingsCodeSection({
  accessoryRange,
  scarRange,
  tortieRange,
  exactLayerCounts,
  afterlifeMode,
  includeBaseColours,
  includeNewSprites,
  extendedModes,
  onApply,
}: Readonly<SettingsCodeSectionProps>) {
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const liveCode = useMemo(
    () =>
      encodePortableSettings({
        accessoryRange,
        scarRange,
        tortieRange,
        exactLayerCounts,
        afterlifeMode,
        includeBaseColours,
        includeNewSprites,
        extendedModes: Array.from(extendedModes),
      }),
    [
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      includeBaseColours,
      includeNewSprites,
      extendedModes,
    ],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(liveCode);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (err) {
      console.warn("[SingleCatPlus] clipboard copy failed:", err);
    }
  }, [liveCode]);

  const handleApply = useCallback(() => {
    const trimmed = codeInput.trim();
    if (!trimmed) {
      setCodeError("Enter a settings code");
      return;
    }
    const decoded = decodePortableSettings(trimmed);
    if (!decoded) {
      setCodeError("Invalid code");
      return;
    }
    setCodeError(null);
    setCodeInput("");
    onApply(decoded);
  }, [codeInput, onApply]);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/80">
        Settings Code
      </p>
      {/* Live code */}
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-primary/20 bg-background/60 px-3 py-1.5 font-mono text-xs tracking-wide text-foreground">
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
      {/* Paste + Apply */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={codeInput}
          onChange={(e) => {
            setCodeInput(e.target.value);
            if (codeError) setCodeError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
          placeholder="Paste a code..."
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
      {codeError && <p className="text-[10px] text-red-400">{codeError}</p>}
      <Link
        href="/single-cat-plus/settings"
        className="inline-flex items-center gap-1 text-[10px] text-primary/70 transition hover:text-primary"
      >
        Open Settings Configurator &rarr;
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type SingleCatPlusClientProps = {
  defaultMode?: "flashy" | "calm";
  defaultAccessoryRange?: LayerRange;
  defaultScarRange?: LayerRange;
  defaultTortieRange?: LayerRange;
  defaultAfterlife?: AfterlifeOption;
  variantSlug?: string;
  initialVariantSettings?: SingleCatSettings | null;
  initialVariantLoadError?: string | null;
  initialCodeSettings?: SingleCatPortableSettings | null;
};

export function SingleCatPlusClient({
  defaultMode = "flashy",
  defaultAccessoryRange = { min: 1, max: 4 },
  defaultScarRange = { min: 1, max: 1 },
  defaultTortieRange = { min: 1, max: 4 },
  defaultAfterlife = "dark10",
  variantSlug,
  initialVariantSettings = null,
  initialVariantLoadError = null,
  initialCodeSettings = null,
}: Readonly<SingleCatPlusClientProps>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const mapperRef = useRef<SpriteMapperApi | null>(null);
  const parameterOptionsRef = useRef<ParameterOptions | null>(null);
  const catStateRef = useRef<CatState | null>(null);
  const generationIdRef = useRef(0);
  /** The running spin's frame loader; disposed when a new spin starts. */
  const spinLoaderRef = useRef<SpinFrameLoader | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const initialVariantLoadHandledRef = useRef(false);

  const [initializing, setInitializing] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialSettings = useMemo<SingleCatSettings>(() => {
    let base: SingleCatSettings;
    if (initialVariantSettings) {
      base = initialVariantSettings;
    } else {
      base = {
        ...DEFAULT_SINGLE_CAT_SETTINGS,
        mode: defaultMode,
        accessoryRange: { ...defaultAccessoryRange },
        scarRange: { ...defaultScarRange },
        tortieRange: { ...defaultTortieRange },
        afterlifeMode: defaultAfterlife,
        timing: {
          ...DEFAULT_TIMING_CONFIG,
          delays: { ...DEFAULT_TIMING_CONFIG.delays },
          pauseDelays: DEFAULT_TIMING_CONFIG.pauseDelays
            ? {
                flashyMs: DEFAULT_TIMING_CONFIG.pauseDelays.flashyMs,
                calmMs: DEFAULT_TIMING_CONFIG.pauseDelays.calmMs,
              }
            : undefined,
        },
      };
    }
    // Portable code overrides portable fields only (never timing/mode/speed)
    if (initialCodeSettings) {
      base = {
        ...base,
        accessoryRange: { ...initialCodeSettings.accessoryRange },
        scarRange: { ...initialCodeSettings.scarRange },
        tortieRange: { ...initialCodeSettings.tortieRange },
        exactLayerCounts: initialCodeSettings.exactLayerCounts,
        afterlifeMode: initialCodeSettings.afterlifeMode,
        includeBaseColours: initialCodeSettings.includeBaseColours,
        includeNewSprites: initialCodeSettings.includeNewSprites,
        extendedModes: [...initialCodeSettings.extendedModes],
      };
    }
    return base;
  }, [
    defaultAccessoryRange,
    defaultAfterlife,
    defaultMode,
    defaultScarRange,
    defaultTortieRange,
    initialVariantSettings,
    initialCodeSettings,
  ]);

  const [mode, setMode] = useState<"flashy" | "calm">(initialSettings.mode);
  const [accessoryRange, setAccessoryRange] = useState<LayerRange>(
    initialSettings.accessoryRange,
  );
  const [scarRange, setScarRange] = useState<LayerRange>(
    initialSettings.scarRange,
  );
  const [tortieRange, setTortieRange] = useState<LayerRange>(
    initialSettings.tortieRange,
  );
  const [exactLayerCounts, setExactLayerCounts] = useState(
    initialSettings.exactLayerCounts,
  );
  const [timingConfig, setTimingConfig] = useState<SpinTimingConfig>(
    initialSettings.timing,
  );

  // Page variant management
  const variants = useVariants<SingleCatSettings>({
    storageKey: "singleCatPlus.variants",
    toolKey: "singleCatPlus",
  });
  const [timingModalOpen, setTimingModalOpen] = useState(false);
  const [lastTimingSnapshot, setLastTimingSnapshot] =
    useState<TimingSnapshot | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(
    initialSettings.speedMultiplier,
  );
  const speedMultiplierRef = useRef(1.0);
  const defaultFlashyPauseMs =
    DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ?? 520;
  const defaultCalmPauseMs = DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ?? 420;
  const flashyPauseMs =
    timingConfig.pauseDelays?.flashyMs ?? defaultFlashyPauseMs;
  const calmPauseMs = timingConfig.pauseDelays?.calmMs ?? defaultCalmPauseMs;
  const flashyPauseSeconds = flashyPauseMs / 1000;
  const calmPauseSeconds = calmPauseMs / 1000;
  const activeTimingRef = useRef<SpinTimingConfig>(DEFAULT_TIMING_CONFIG);
  const timingConfigRef = useRef<SpinTimingConfig>(timingConfig);

  // Sync activeTimingRef and timingConfigRef when timingConfig changes for live updates
  useEffect(() => {
    const timingProfile: SpinTimingConfig = {
      allowFastFlips: timingConfig.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays, ...timingConfig.delays },
      pauseDelays: timingConfig.pauseDelays,
    };
    activeTimingRef.current = timingProfile;
    timingConfigRef.current = timingConfig;
  }, [timingConfig]);

  // Sync speedMultiplierRef when speedMultiplier changes
  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);
  const optionCountsRef = useRef<Record<ParamTimingKey, number>>(
    Object.fromEntries(
      PARAM_TIMING_ORDER.map((key) => [
        key,
        PARAM_DEFAULT_STEP_COUNTS[key] ?? 0,
      ]),
    ) as Record<ParamTimingKey, number>,
  );
  const actualDurationsRef = useRef<Partial<Record<ParamTimingKey, number>>>(
    {},
  );
  const totalActualRef = useRef(0);
  const modeRef = useRef(mode);
  const [optionCounts, setOptionCounts] = useState<
    Record<ParamTimingKey, number>
  >(optionCountsRef.current);
  useEffect(() => {
    optionCountsRef.current = optionCounts;
  }, [optionCounts]);

  // Helper function to get delay with speed multiplier applied
  // Uses refs to always get the latest timing config and speed multiplier
  const getDelayWithMultiplier = useCallback((key: ParamTimingKey): number => {
    const config = timingConfigRef.current;
    const baseDelay = getDelayForKey(config, key);
    return Math.max(MIN_SAFE_STEP_MS, baseDelay / speedMultiplierRef.current);
  }, []);

  const resetActualDurations = useCallback(() => {
    actualDurationsRef.current = {};
    totalActualRef.current = 0;
  }, []);

  const addActualDuration = useCallback(
    (key: ParamTimingKey | null, deltaMs: number) => {
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
      totalActualRef.current += deltaMs;
      if (!key) return;
      actualDurationsRef.current = {
        ...actualDurationsRef.current,
        [key]: (actualDurationsRef.current[key] ?? 0) + deltaMs,
      };
    },
    [],
  );
  const [afterlifeMode, setAfterlifeMode] = useState<AfterlifeOption>(
    initialSettings.afterlifeMode,
  );
  const [includeBaseColours, setIncludeBaseColours] = useState(
    initialSettings.includeBaseColours,
  );
  const [includeNewSprites, setIncludeNewSprites] = useState(
    initialSettings.includeNewSprites,
  );
  const [extendedModes, setExtendedModes] = useState<Set<ExtendedMode>>(
    () => new Set(initialSettings.extendedModes),
  );

  const [rollerLabel, setRollerLabel] = useState<string | null>(null);
  const [rollerActiveValue, setRollerActiveValue] = useState<string | null>(
    null,
  );
  const [rollerHighlight, setRollerHighlight] = useState(false);
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [activeParamId, setActiveParamId] = useState<string | null>(null);
  const [layerRows, setLayerRows] = useState<Record<string, LayerRowState[]>>(
    () =>
      Object.fromEntries(
        Object.keys(layerGroupLabels).map((group) => [group, []]),
      ),
  );
  const [rollSummary, setRollSummary] = useState<string | null>(null);
  const [spriteVariations, setSpriteVariations] = useState<SpriteVariation[]>(
    [],
  );
  const [spritePreviewLoading, setSpritePreviewLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [hasTint, setHasTint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rollerExpanded, setRollerExpanded] = useState(false);
  const [spriteGalleryOpen, setSpriteGalleryOpen] = useState(false);
  const spriteGalleryCloseRef = useRef<HTMLButtonElement | null>(null);
  const spritePreviewTokenRef = useRef(0);
  const timingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const timingCloseRef = useRef<HTMLButtonElement | null>(null);
  const defaultCreatorName = useDefaultCreatorName();
  const [catNameDraft, setCatNameDraft] = useState(initialSettings.catName);
  const [creatorNameDraft, setCreatorNameDraft] = useState(
    initialSettings.creatorName,
  );
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);

  // Auto-fill creator name when username loads and field is still empty
  const creatorFilledRef = useRef(false);
  useEffect(() => {
    if (defaultCreatorName && !creatorFilledRef.current && !creatorNameDraft) {
      setCreatorNameDraft(defaultCreatorName);
      creatorFilledRef.current = true;
    }
  }, [defaultCreatorName, creatorNameDraft]);

  useEffect(() => {
    if (!spriteGalleryOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTimer = window.setTimeout(() => {
      spriteGalleryCloseRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      previousFocus?.focus();
    };
  }, [spriteGalleryOpen]);

  useEffect(() => {
    if (!timingModalOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTimer = window.setTimeout(() => {
      timingCloseRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      previousFocus?.focus();
    };
  }, [timingModalOpen]);

  const rollerValueClass = useMemo(() => {
    if (!rollerActiveValue) {
      return "text-3xl tracking-[0.35em]";
    }
    const length = rollerActiveValue.length;
    if (length > 36) return "text-lg tracking-[0.18em]";
    if (length > 26) return "text-xl tracking-[0.22em]";
    if (length > 18) return "text-2xl tracking-[0.28em]";
    return "text-3xl tracking-[0.32em]";
  }, [rollerActiveValue]);

  const createMapper = useMutation(api.mapper.create);
  const updateMapperMeta = useMutation(api.mapper.updateMeta);

  const extendedModesArray = useMemo(
    () => Array.from(extendedModes),
    [extendedModes],
  );

  const resetMetaDrafts = useCallback(
    (catName?: string | null, creatorName?: string | null) => {
      setCatNameDraft(catName ?? "");
      setCreatorNameDraft(creatorName || defaultCreatorName);
      setMetaDirty(false);
    },
    [defaultCreatorName],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // ---------------------------------------------------------------------------
  // Variant snapshot / apply / dirty detection
  // ---------------------------------------------------------------------------

  const snapshotConfig = useMemo(
    (): SingleCatSettings => ({
      v: 2,
      mode,
      timing: timingConfig,
      speedMultiplier,
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      extendedModes: [...extendedModes].sort(compareCodeUnits),
      includeBaseColours,
      includeNewSprites,
      catName: catNameDraft,
      creatorName: creatorNameDraft,
    }),
    [
      mode,
      timingConfig,
      speedMultiplier,
      accessoryRange,
      scarRange,
      tortieRange,
      exactLayerCounts,
      afterlifeMode,
      extendedModes,
      includeBaseColours,
      includeNewSprites,
      catNameDraft,
      creatorNameDraft,
    ],
  );

  const applyVariantConfig = useCallback(
    (settings: SingleCatSettings) => {
      setMode(settings.mode);
      setTimingConfig(settings.timing);
      setSpeedMultiplier(settings.speedMultiplier);
      setAccessoryRange(settings.accessoryRange);
      setScarRange(settings.scarRange);
      setTortieRange(settings.tortieRange);
      setExactLayerCounts(settings.exactLayerCounts ?? true);
      setAfterlifeMode(settings.afterlifeMode);
      setExtendedModes(new Set(settings.extendedModes));
      setIncludeBaseColours(settings.includeBaseColours);
      setIncludeNewSprites(settings.includeNewSprites ?? false);
      setCatNameDraft(settings.catName);
      setCreatorNameDraft(settings.creatorName || defaultCreatorName);
    },
    [defaultCreatorName],
  );

  const variantDirty = useMemo(() => {
    if (!variants.activeVariant) return false;
    return !singleCatSettingsEqual(
      snapshotConfig,
      variants.activeVariant.settings,
    );
  }, [snapshotConfig, variants.activeVariant]);

  // Apply active variant settings after hydration from localStorage
  // (skip when URL slug or portable code settings take priority)
  const variantRestoredRef = useRef(false);
  useEffect(() => {
    if (variantRestoredRef.current) return;
    if (variantSlug) return;
    if (initialCodeSettings) return;
    if (!variants.activeVariant) return;
    variantRestoredRef.current = true;
    applyVariantConfig(variants.activeVariant.settings);
  }, [
    variantSlug,
    initialCodeSettings,
    variants.activeVariant,
    applyVariantConfig,
  ]);

  // Warn before unload when dirty
  useEffect(() => {
    if (!variantDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [variantDirty]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const adjustedOptionCounts = useMemo(() => {
    const adjusted: Record<ParamTimingKey, number> = {} as Record<
      ParamTimingKey,
      number
    >;
    PARAM_TIMING_ORDER.forEach((key) => {
      const baseCount =
        optionCounts[key] ?? PARAM_DEFAULT_STEP_COUNTS[key] ?? 0;
      adjusted[key] = baseCount;
    });
    return adjusted;
  }, [optionCounts]);

  const estimatedTotals = useMemo(() => {
    const metrics = stepCountsToMetrics(adjustedOptionCounts);
    return computeTimingTotals(timingConfig, metrics);
  }, [timingConfig, adjustedOptionCounts]);

  const effectiveTotalMs = useMemo(
    () => estimatedTotals.total || computeDefaultTotal(timingConfig),
    [estimatedTotals.total, timingConfig],
  );

  const readSpinState = useCallback(() => {
    const durationMs = Math.max(1000, effectiveTotalMs);
    const baseSpeed = getSpeedSettings(durationMs);
    const currentConfig = timingConfigRef.current;
    const currentFlashyPause =
      currentConfig.pauseDelays?.flashyMs ?? defaultFlashyPauseMs;
    const currentCalmPause =
      currentConfig.pauseDelays?.calmMs ?? defaultCalmPauseMs;
    return {
      mode: modeRef.current,
      spinny: modeRef.current === "flashy",
      speed: {
        ...baseSpeed,
        paramPause: currentFlashyPause,
        calmParamPause: currentCalmPause,
      },
    };
  }, [defaultCalmPauseMs, defaultFlashyPauseMs, effectiveTotalMs]);

  const clearMirror = useCallback(() => {}, []);

  const activeGlobalPreset = useMemo(() => {
    for (const presetKey of GLOBAL_PRESETS) {
      const matches = PARAM_TIMING_ORDER.every((param) => {
        const target = PARAM_TIMING_PRESETS[param]?.[presetKey];
        if (typeof target !== "number") return false;
        const current =
          timingConfig.delays[param] ?? getPresetValues(param).normal;
        return current === target;
      });
      if (matches) return presetKey;
    }
    return "custom" as const;
  }, [timingConfig.delays]);

  const handleGlobalPreset = useCallback(
    (preset: keyof TimingPresetSet) => {
      const nextDelays: SpinTimingConfig["delays"] = { ...timingConfig.delays };
      PARAM_TIMING_ORDER.forEach((key) => {
        const value = PARAM_TIMING_PRESETS[key]?.[preset];
        if (typeof value === "number") {
          nextDelays[key] = clampDelay(value, timingConfig.allowFastFlips);
        }
      });
      setTimingConfig({
        ...timingConfig,
        delays: nextDelays,
      });
    },
    [timingConfig],
  );

  const handleTimingStepChange = useCallback(
    (key: ParamTimingKey, value: number) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const nextValue = Math.max(value, 0);
      setTimingConfig({
        ...timingConfig,
        delays: {
          ...timingConfig.delays,
          [key]: nextValue,
        },
      });
    },
    [timingConfig],
  );

  const handlePauseChange = useCallback(
    (kind: "flashyMs" | "calmMs", seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      const clampedSeconds = Math.min(10, Math.max(1, seconds));
      const nextMs = Math.round(clampedSeconds * 1000);
      setTimingConfig({
        ...timingConfig,
        pauseDelays: {
          flashyMs:
            timingConfig.pauseDelays?.flashyMs ??
            DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ??
            1000,
          calmMs:
            timingConfig.pauseDelays?.calmMs ??
            DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ??
            1000,
          [kind]: nextMs,
        },
      });
    },
    [timingConfig],
  );

  const handleResetTimings = useCallback(() => {
    setTimingConfig({
      ...timingConfig,
      allowFastFlips: DEFAULT_TIMING_CONFIG.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays },
      pauseDelays: {
        flashyMs: DEFAULT_TIMING_CONFIG.pauseDelays?.flashyMs ?? 1000,
        calmMs: DEFAULT_TIMING_CONFIG.pauseDelays?.calmMs ?? 1000,
      },
    });
  }, [timingConfig]);

  const _copyText = useCallback(
    async (text: string, successMessage: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          showToast(successMessage);
          return;
        }
      } catch (error) {
        console.warn("copyText", error);
      }
      window.prompt("Copy to clipboard", text);
    },
    [showToast],
  );

  useEffect(() => {
    if (!variantSlug) return;
    if (initialVariantLoadHandledRef.current) return;
    initialVariantLoadHandledRef.current = true;
    if (initialVariantLoadError) {
      showToast(initialVariantLoadError);
      return;
    }
    if (initialVariantSettings) {
      showToast("Settings loaded from URL");
    }
  }, [initialVariantLoadError, initialVariantSettings, showToast, variantSlug]);

  // Notify when portable code settings were applied from URL
  const codeToastShownRef = useRef(false);
  useEffect(() => {
    if (!initialCodeSettings) return;
    if (codeToastShownRef.current) return;
    codeToastShownRef.current = true;
    showToast("Settings applied from code");
  }, [initialCodeSettings, showToast]);

  const settleRoller = useCallback(
    async (
      token: number,
      options?: {
        keepLabel?: boolean;
        keepValue?: boolean;
        skipHighlight?: boolean;
      },
    ) => {
      if (!options?.skipHighlight) {
        setRollerHighlight(true);
      }
      await wait(ROLLER_REVEAL_HOLD);
      if (generationIdRef.current !== token) {
        return;
      }
      if (!options?.skipHighlight) {
        setRollerHighlight(false);
      }
      if (!options?.keepValue) {
        setRollerActiveValue(null);
      }
      if (!options?.keepLabel) {
        setRollerLabel(null);
      }
    },
    [],
  );

  const playFlip = useCallback(async (draw: () => void, duration: number) => {
    draw();
    await wait(Math.max(duration, 30));
  }, []);

  const resetLayerRows = useCallback(
    (
      accessoriesInput: string[] | null | undefined,
      scarsInput: string[] | null | undefined,
      tortiesInput: (TortieSlot | null)[] | null | undefined,
      traitsInput?: Readonly<Record<string, unknown>>,
    ) => {
      const accessories = Array.isArray(accessoriesInput)
        ? accessoriesInput
        : [];
      const scars = Array.isArray(scarsInput) ? scarsInput : [];
      const torties = Array.isArray(tortiesInput) ? tortiesInput : [];

      const genericRows = Object.fromEntries(
        PARAM_SEQUENCE.filter(
          (definition) =>
            definition.strategy === "slots" &&
            definition.traitId !== "accessories" &&
            definition.traitId !== "scars",
        ).map((definition) => {
          const values = Array.isArray(traitsInput?.[definition.traitId])
            ? (traitsInput?.[definition.traitId] as unknown[])
            : [];
          return [
            definition.layerKey,
            values.map((_, index) => ({
              label: `${definition.label} ${index + 1}`,
              value: "—",
              status: "idle" as const,
            })),
          ];
        }),
      );
      setLayerRows({
        ...genericRows,
        accessories: accessories.map((_, idx) => ({
          label: `Accessory ${idx + 1}`,
          value: "—",
          status: "idle",
        })),
        scars: scars.map((_, idx) => ({
          label: `Scar ${idx + 1}`,
          value: "—",
          status: "idle",
        })),
        tortie: torties.map((_, idx) => ({
          label: `Tortie ${idx + 1}`,
          value: "—",
          status: "idle",
        })),
      });
    },
    [],
  );

  const updateLayerRow = useCallback(
    (group: string, index: number, updates: Partial<LayerRowState>) => {
      setLayerRows((prev) => {
        const groupRows = prev[group];
        if (!groupRows || index < 0 || index >= groupRows.length) {
          return prev;
        }
        const nextGroup = groupRows.map((row, idx) =>
          idx === index ? { ...row, ...updates } : row,
        );
        return { ...prev, [group]: nextGroup };
      });
    },
    [],
  );

  const updateParamRow = useCallback(
    (rowIndex: number, updates: Partial<ParamRow>) => {
      setParamRows((prev) =>
        prev.map((row, idx) =>
          idx === rowIndex ? { ...row, ...updates } : row,
        ),
      );
    },
    [],
  );

  const drawPlaceholder = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "20px var(--font-geist-sans, sans-serif)";
    ctx.textAlign = "center";
    ctx.fillText("Roll a cat to begin", DISPLAY_SIZE / 2, DISPLAY_SIZE / 2);
  }, []);

  const drawCanvas = useCallback(
    (source?: HTMLCanvasElement | OffscreenCanvas) => {
      if (!source) return;
      const target = canvasRef.current;
      if (!target) return;
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
      try {
        ctx.drawImage(
          source as HTMLCanvasElement,
          0,
          0,
          DISPLAY_SIZE,
          DISPLAY_SIZE,
        );
      } catch (error) {
        console.warn("drawImage failed, creating fallback canvas", error);
        const fallback = document.createElement("canvas");
        const fallbackWidth =
          "width" in source && typeof source.width === "number"
            ? source.width
            : DISPLAY_SIZE;
        const fallbackHeight =
          "height" in source && typeof source.height === "number"
            ? source.height
            : DISPLAY_SIZE;
        fallback.width = fallbackWidth;
        fallback.height = fallbackHeight;
        const fallbackCtx = fallback.getContext("2d");
        if (fallbackCtx) {
          fallbackCtx.drawImage(source as HTMLCanvasElement, 0, 0);
          ctx.drawImage(fallback, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
        }
      }
    },
    [],
  );

  /** A slot group with nothing to spin: show the cat as it stands. */
  const revealEmptySlots = useCallback(
    async (
      phase: EmptySlotsPhase,
      loader: SpinFrameLoader,
      rowIndex: number,
      pauseDuration: number,
      currentToken: number,
    ) => {
      updateParamRow(rowIndex, { value: "None", status: "revealed" });

      const spinState = readSpinState();
      const canvas = await loader.single(phase.params);
      if (spinState.spinny) {
        await playFlip(
          () => drawCanvas(canvas),
          Math.max(getBaseFrameDuration(spinState.speed), 90),
        );
        if (generationIdRef.current !== currentToken) return;
        await settleRoller(currentToken);
      } else {
        drawCanvas(canvas);
        setRollerLabel(null);
        setRollerActiveValue(null);
      }

      await wait(pauseDuration);
      clearMirror();
    },
    [
      clearMirror,
      drawCanvas,
      playFlip,
      readSpinState,
      settleRoller,
      updateParamRow,
    ],
  );

  /** Flip one registry slot's frames; false once a newer spin takes over. */
  const flipRegistrySlot = useCallback(
    async (
      definition: ParamDefinition,
      slot: StringSlotPhase,
      loader: SpinFrameLoader,
      currentToken: number,
    ): Promise<boolean> => {
      const frames = await loader.frames(slot.before, slot.descriptors);
      const sequence = buildFlipSequence(frames);
      for (const step of sequence) {
        if (generationIdRef.current !== currentToken) return false;
        const display = step.frame.option.display;
        updateLayerRow(definition.layerKey, slot.index, {
          value: display,
          status: flipStepStatus(step.isFinal),
        });
        setRollerActiveValue(display);
        await playFlip(
          () => drawCanvas(step.frame.canvas),
          getDelayWithMultiplier(definition.timingKey),
        );
      }
      return true;
    },
    [drawCanvas, getDelayWithMultiplier, playFlip, updateLayerRow],
  );

  const spinRegistryStringSlots = useCallback(
    async (
      definition: ParamDefinition,
      rowIndex: number,
      plan: SpinPlan,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const summary: string[] = [];

      clearMirror();
      setRollerLabel(definition.label);
      const empty = plan.phase("empty", definition.traitId);
      if (empty) {
        updateParamRow(rowIndex, { value: "None", status: "revealed" });
        drawCanvas(await loader.single(empty.params));
        await wait(pauseDuration);
        setRollerLabel(null);
        setRollerActiveValue(null);
        return;
      }
      const slots = plan.phases.filter(
        (phase): phase is StringSlotPhase =>
          phase.kind === "registry" &&
          phase.definition.traitId === definition.traitId,
      );
      for (const slot of slots) {
        if (generationIdRef.current !== currentToken) return;
        const index = slot.index;
        const spinState = readSpinState();

        if (spinState.spinny) {
          const flipped = await flipRegistrySlot(
            definition,
            slot,
            loader,
            currentToken,
          );
          if (!flipped) return;
        }

        const display = slotDisplay(slot.value);
        summary.push(display);
        updateLayerRow(definition.layerKey, index, {
          value: display,
          status: "revealed",
        });
        drawCanvas(await loader.single(slot.after));
        await wait(pauseDuration);
      }

      updateParamRow(rowIndex, {
        value: joinSummary(summary, ", "),
        status: "revealed",
      });
      setRollerLabel(null);
      setRollerActiveValue(null);
      clearMirror();
    },
    [
      clearMirror,
      drawCanvas,
      flipRegistrySlot,
      readSpinState,
      updateLayerRow,
      updateParamRow,
    ],
  );

  /** Flip one accessory/scar slot; false once a newer spin takes over. */
  const flipStringLayerSlot = useCallback(
    async (
      kind: "accessory" | "scar",
      slot: StringSlotPhase,
      loader: SpinFrameLoader,
      currentToken: number,
    ): Promise<boolean> => {
      const rows = STRING_LAYER_LABELS[kind].rows;
      const i = slot.index;
      updateLayerRow(rows, i, { status: "active", value: "—" });

      // Every frame is a complete cat, prefetched right after the roll.
      const frames = await loader.frames(slot.before, slot.descriptors);
      const sequence = buildFlipSequence(frames);

      for (let idx = 0; idx < sequence.length; idx += 1) {
        const step = sequence[idx];
        if (generationIdRef.current !== currentToken) return false;

        // Recalculate delay on each step to get live updates
        const layerDelay = getDelayWithMultiplier(kind);
        const currentConfig = timingConfigRef.current;
        const stepDuration = currentStepDuration(
          sequence,
          idx,
          layerDelay,
          currentConfig.allowFastFlips,
        );

        const frameDisplay = step.frame.option.display;
        setRollerActiveValue(frameDisplay);
        updateLayerRow(rows, i, {
          value: frameDisplay,
          status: flipStepStatus(step.isFinal),
        });

        const drawStep = () => drawCanvas(step.frame.canvas);
        const stepState = readSpinState();
        await playFlip(drawStep, stepDuration);
        if (!stepState.spinny) {
          break;
        }
      }

      const finalFrame = frames.at(-1);
      if (finalFrame) {
        drawCanvas(finalFrame.canvas);
      }
      return true;
    },
    [
      drawCanvas,
      getDelayWithMultiplier,
      playFlip,
      readSpinState,
      updateLayerRow,
    ],
  );

  const spinStringLayerSlots = useCallback(
    async (
      kind: "accessory" | "scar",
      rowIndex: number,
      plan: SpinPlan,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ) => {
      const labels = STRING_LAYER_LABELS[kind];

      clearMirror();
      setRollerLabel(labels.group);
      setRollerActiveValue("—");

      const empty = plan.phase("empty", kind);
      if (empty) {
        await revealEmptySlots(
          empty,
          loader,
          rowIndex,
          pauseDuration,
          currentToken,
        );
        return;
      }

      const slots = plan.phases.filter(
        (phase): phase is StringSlotPhase => phase.kind === kind,
      );
      const summary: string[] = [];

      for (const slot of slots) {
        if (generationIdRef.current !== currentToken) return;
        const i = slot.index;
        const display = slotDisplay(slot.value);
        const spinState = readSpinState();
        setRollerLabel(`${labels.slot} ${i + 1}`);

        if (spinState.spinny) {
          const flipped = await flipStringLayerSlot(
            kind,
            slot,
            loader,
            currentToken,
          );
          if (!flipped) return;
        } else {
          updateLayerRow(labels.rows, i, {
            value: display,
            status: "revealed",
          });
          setRollerActiveValue(display);
        }

        summary.push(display);
        drawCanvas(await loader.single(slot.after));
        await wait(pauseDuration);
      }

      const summaryText = joinSummary(summary, ", ");
      updateParamRow(rowIndex, { value: "—", status: "revealed" });
      setRollerActiveValue(summaryText);
      if (generationIdRef.current !== currentToken) return;
      await settleRoller(currentToken);
      setRollerLabel(null);
      setRollerActiveValue(null);
      await wait(pauseDuration);
      clearMirror();
    },
    [
      clearMirror,
      drawCanvas,
      flipStringLayerSlot,
      readSpinState,
      revealEmptySlots,
      settleRoller,
      updateLayerRow,
      updateParamRow,
    ],
  );

  /** Spin one tortie stage; false once a newer spin takes over. */
  const flipTortieStage = useCallback(
    async (
      slot: TortieSlotPhase,
      spin: TortieSlotSpin,
      stage: TortieStageSpin,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ): Promise<boolean> => {
      const i = slot.index;
      const stageStart = nowMs();
      setRollerLabel(`Tortie Layer ${i + 1} – ${stage.label}`);

      const frames = await loader.frames(slot.before, stage.descriptors);
      const sequence = buildFlipSequence(frames);

      for (let idx = 0; idx < sequence.length; idx += 1) {
        const step = sequence[idx];
        if (generationIdRef.current !== currentToken) return false;

        // Recalculate delay on each step to get live updates
        const stageDelay = getDelayWithMultiplier(stage.timingKey);
        const currentConfig = timingConfigRef.current;
        const stepDuration = currentStepDuration(
          sequence,
          idx,
          stageDelay,
          currentConfig.allowFastFlips,
        );

        const candidateLayer = tortieStageCandidate(
          stage.kind,
          step.frame.option.raw,
          stage.working,
          spin.maskPatternColour,
        );

        const drawStep = () => drawCanvas(step.frame.canvas);
        await playFlip(drawStep, stepDuration);
        setRollerActiveValue(formatTortieLayer(candidateLayer));
        updateLayerRow("tortie", i, {
          value: formatTortieLayer(candidateLayer),
          status: flipStepStatus(step.isFinal),
        });
      }

      await wait(pauseDuration);
      const stageEnd = nowMs();
      addActualDuration(stage.timingKey, stageEnd - stageStart);
      return true;
    },
    [
      addActualDuration,
      drawCanvas,
      getDelayWithMultiplier,
      playFlip,
      updateLayerRow,
    ],
  );

  /** Reveal one tortie layer; its summary text, or null once superseded. */
  const revealTortieSlot = useCallback(
    async (
      slot: TortieSlotPhase,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ): Promise<string | null> => {
      const i = slot.index;
      const spinState = readSpinState();
      const { spin } = slot;

      if (!spin) {
        updateLayerRow("tortie", i, { value: "None", status: "revealed" });
        if (!spinState.spinny) {
          await wait(pauseDuration);
        }
        return "None";
      }

      const layer = slot.value ?? spin.result;
      if (spinState.spinny) {
        updateLayerRow("tortie", i, { value: "—", status: "active" });

        for (const stage of spin.stages) {
          const flipped = await flipTortieStage(
            slot,
            spin,
            stage,
            loader,
            pauseDuration,
            currentToken,
          );
          if (!flipped) return null;
        }

        setRollerLabel(`Tortie Layer ${i + 1}`);
        setRollerActiveValue(formatTortieLayer(layer));
      } else {
        const display = formatTortieLayer(layer);
        updateLayerRow("tortie", i, { value: display, status: "revealed" });
        setRollerActiveValue(display);
      }

      drawCanvas(await loader.single(slot.after));
      await wait(pauseDuration);
      return formatTortieLayer(layer);
    },
    [drawCanvas, flipTortieStage, readSpinState, updateLayerRow],
  );

  const spinTortieSlots = useCallback(
    async (
      rowIndex: number,
      plan: SpinPlan,
      loader: SpinFrameLoader,
      pauseDuration: number,
      currentToken: number,
    ) => {
      clearMirror();
      setRollerLabel("Tortie Layers");
      setRollerActiveValue("—");

      const empty = plan.phase("empty", "tortie");
      if (empty) {
        await revealEmptySlots(
          empty,
          loader,
          rowIndex,
          pauseDuration,
          currentToken,
        );
        return;
      }

      const slots = plan.phases.filter(
        (phase): phase is TortieSlotPhase => phase.kind === "tortie",
      );
      const summary: string[] = [];

      for (const slot of slots) {
        if (generationIdRef.current !== currentToken) return;
        const display = await revealTortieSlot(
          slot,
          loader,
          pauseDuration,
          currentToken,
        );
        if (display === null) return;
        summary.push(display);
      }

      const summaryText = joinSummary(summary, " • ");
      updateParamRow(rowIndex, { value: "—", status: "revealed" });
      setRollerActiveValue(summaryText);
      if (generationIdRef.current !== currentToken) return;
      await settleRoller(currentToken);
      await wait(pauseDuration);
      clearMirror();
    },
    [
      clearMirror,
      revealEmptySlots,
      revealTortieSlot,
      settleRoller,
      updateParamRow,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!generatorRef.current || !mapperRef.current) {
          const [{ default: catGenerator }, { default: spriteMapper }] =
            await Promise.all([
              import("@/lib/single-cat/catGeneratorV3"),
              import("@/lib/single-cat/spriteMapper"),
            ]);
          if (cancelled) return;
          generatorRef.current = catGenerator as CatGeneratorApi;
          mapperRef.current = spriteMapper as unknown as SpriteMapperApi;
          if (mapperRef.current.init) {
            await mapperRef.current.init();
          }
        }

        if (!mapperRef.current) return;

        if (!parameterOptionsRef.current) {
          parameterOptionsRef.current = await buildParameterOptions(
            mapperRef.current,
            includeBaseColours,
            extendedModesArray,
            includeNewSprites,
          );
          const counts = deriveOptionCounts(parameterOptionsRef.current);
          optionCountsRef.current = counts;
          setOptionCounts(counts);
        }

        if (!catStateRef.current) {
          drawPlaceholder();
        }
        setInitializing(false);
      } catch (err) {
        console.error("Failed to load Single Cat modules", err);
        if (!cancelled) {
          setInitialError("Unable to load cat generator modules.");
          setInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    drawPlaceholder,
    includeBaseColours,
    extendedModesArray,
    includeNewSprites,
  ]);

  useEffect(() => {
    const mapper = mapperRef.current;
    if (!mapper?.loaded) return;
    let cancelled = false;
    (async () => {
      const options = await buildParameterOptions(
        mapper,
        includeBaseColours,
        extendedModesArray,
        includeNewSprites,
      );
      if (!cancelled) {
        parameterOptionsRef.current = options;
        const counts = deriveOptionCounts(options);
        optionCountsRef.current = counts;
        setOptionCounts(counts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [includeBaseColours, extendedModesArray, includeNewSprites]);

  useEffect(() => {
    return () => {
      generationIdRef.current += 1; // cancel ongoing work
      spinLoaderRef.current?.dispose();
      spinLoaderRef.current = null;
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const _handleToggleExtended = useCallback((modeToToggle: ExtendedMode) => {
    if (modeToToggle === "base") {
      setIncludeBaseColours((prev) => !prev);
      return;
    }
    setExtendedModes((prev) => {
      const next = new Set(prev);
      if (next.has(modeToToggle)) {
        next.delete(modeToToggle);
      } else {
        next.add(modeToToggle);
      }
      return next;
    });
  }, []);

  const ensureMapperReady =
    useCallback(async (): Promise<SpriteMapperApi | null> => {
      if (!mapperRef.current) return null;
      if (!mapperRef.current.loaded && mapperRef.current.init) {
        await mapperRef.current.init();
      }
      if (!parameterOptionsRef.current) {
        parameterOptionsRef.current = await buildParameterOptions(
          mapperRef.current,
          includeBaseColours,
          extendedModesArray,
          includeNewSprites,
        );
        const counts = deriveOptionCounts(parameterOptionsRef.current);
        optionCountsRef.current = counts;
        setOptionCounts(counts);
      }
      return mapperRef.current;
    }, [includeBaseColours, extendedModesArray, includeNewSprites]);

  // -------------------------------------------------------------------
  // Layer count spinner — reveals accessory/scar/tortie counts visually
  // -------------------------------------------------------------------

  /** Flip a count group's frames; false once a newer spin takes over. */
  const flipCountFrames = useCallback(
    async (
      group: CountRevealGroup,
      frames: VariationFrame[],
      token: number,
    ): Promise<boolean> => {
      const sequence = buildFlipSequence(frames);

      for (let idx = 0; idx < sequence.length; idx++) {
        const step = sequence[idx];
        if (generationIdRef.current !== token) return false;

        const baseDelay = getDelayWithMultiplier(group.key) * 2; // slower for count reveal
        const stepDuration = currentStepDuration(
          sequence,
          idx,
          baseDelay,
          false, // never fast-flip the count reveal
        );

        setRollerActiveValue(step.frame.option.display);
        drawCanvas(step.frame.canvas);
        await playFlip(() => {}, stepDuration);
        const stepState = readSpinState();
        if (!stepState.spinny) break;
      }
      return true;
    },
    [drawCanvas, getDelayWithMultiplier, playFlip, readSpinState],
  );

  /** Reveal one count group; false once a newer spin takes over. */
  const revealCountGroup = useCallback(
    async (
      loader: SpinFrameLoader,
      group: CountRevealGroup,
      token: number,
    ): Promise<boolean> => {
      const { minCount, maxCount } = group;

      // Show what we're about to roll
      setRollerLabel(`Rolling: ${group.label}`);
      setRollerActiveValue(`${minCount}–${maxCount}`);
      setParamRows((prev) => [
        ...prev,
        {
          id: group.key,
          label: group.label,
          value: "?",
          status: "active" as const,
        },
      ]);
      await wait(800); // let the viewer read what's being rolled
      if (generationIdRef.current !== token) return false;

      // One batch for every count; prefetched before the reveal started.
      const rendered = await loadCountFrames(loader, group);
      if (rendered === null) return true;
      if (generationIdRef.current !== token) return false;

      const frames = countRevealFrames(rendered, group.count);
      if (frames.length === 0) return true;

      if (!(await flipCountFrames(group, frames, token))) return false;

      // Land on rolled count
      const finalFrame = frames.find((f) => f.option.raw === group.count);
      if (finalFrame) drawCanvas(finalFrame.canvas);
      setRollerActiveValue(String(group.count));
      setParamRows((prev) =>
        revealParamRowById(prev, group.key, String(group.count)),
      );
      await settleRoller(token);
      await wait(600); // hold the result so viewer can see it
      return generationIdRef.current === token;
    },
    [drawCanvas, flipCountFrames, settleRoller],
  );

  const revealLayerCounts = useCallback(
    async (
      loader: SpinFrameLoader,
      groups: CountRevealGroup[],
      token: number,
    ) => {
      for (const group of groups) {
        if (generationIdRef.current !== token) return;
        if (!(await revealCountGroup(loader, group, token))) return;
      }

      setRollerLabel(null);
      setRollerActiveValue(null);
      setParamRows([]); // clear count rows before main param spin
      clearMirror();
    },
    [clearMirror, revealCountGroup],
  );

  /** Flip an animated param's frames; false once a newer spin takes over. */
  const flipParamFrames = useCallback(
    async (
      definition: ParamDefinition,
      frames: VariationFrame[],
      paramKey: ParamTimingKey | null,
      token: number,
    ): Promise<boolean> => {
      const sequence = buildFlipSequence(frames);

      for (let idx = 0; idx < sequence.length; idx += 1) {
        const step = sequence[idx];
        if (generationIdRef.current !== token) return false;

        // Recalculate delay on each step to get live updates
        const currentConfig = timingConfigRef.current;
        const configuredDelay = paramKey
          ? getDelayWithMultiplier(paramKey)
          : MIN_SAFE_STEP_MS;
        const stepDuration = currentStepDuration(
          sequence,
          idx,
          configuredDelay,
          currentConfig.allowFastFlips,
        );

        const frameDisplay = step.frame.option.display;
        setRollerActiveValue(frameDisplay);
        setParamRows((prev) =>
          flipParamRowById(prev, definition.id, frameDisplay, step.isFinal),
        );
        const drawStep = () => {
          drawCanvas(step.frame.canvas);
        };
        const stepState = readSpinState();
        await playFlip(drawStep, stepDuration);
        if (!stepState.spinny) {
          break;
        }
      }
      return true;
    },
    [drawCanvas, getDelayWithMultiplier, playFlip, readSpinState],
  );

  /** Spin a param through its options; false once a newer spin takes over. */
  const animateParamPhase = useCallback(
    async (
      definition: ParamDefinition,
      phase: ParamPhase,
      displayValue: string,
      paramKey: ParamTimingKey | null,
      speed: { baseFrameDuration: number },
      loader: SpinFrameLoader,
      token: number,
    ): Promise<boolean> => {
      clearMirror();
      setRollerLabel(definition.label);
      setRollerActiveValue("—");
      await wait(Math.max(getBaseFrameDuration(speed) * 0.25, PRE_SPIN_DELAY));

      const frames = await loader.frames(phase.before, phase.descriptors);
      if (!(await flipParamFrames(definition, frames, paramKey, token))) {
        return false;
      }

      const finalFrame = frames.at(-1);
      if (finalFrame) {
        drawCanvas(finalFrame.canvas);
      }
      setParamRows((prev) =>
        revealParamRowById(prev, definition.id, displayValue),
      );
      if (generationIdRef.current !== token) return false;
      await settleRoller(token);
      setRollerLabel(null);
      setRollerActiveValue(null);
      return true;
    },
    [clearMirror, drawCanvas, flipParamFrames, settleRoller],
  );

  /** Show a param's value without spinning; false once superseded. */
  const revealParamPhase = useCallback(
    async (
      definition: ParamDefinition,
      phase: ParamPhase,
      displayValue: string,
      loader: SpinFrameLoader,
      token: number,
    ): Promise<boolean> => {
      clearMirror();
      setParamRows((prev) =>
        revealParamRowById(prev, definition.id, displayValue),
      );
      drawCanvas(await loader.single(phase.after));
      if (generationIdRef.current !== token) return false;
      setRollerLabel(null);
      setRollerActiveValue(displayValue);
      await settleRoller(token, { keepLabel: false, skipHighlight: true });
      return true;
    },
    [clearMirror, drawCanvas, settleRoller],
  );

  /** Drop a slot group's summary row; the index is read when React applies it. */
  const removeParamRow = useCallback((paramRow: ParamRowIndex) => {
    if (paramRow.index >= 0) {
      setParamRows((prev) => prev.filter((_, idx) => idx !== paramRow.index));
    }
  }, []);

  const spinSlotParam = useCallback(
    async (
      route: Exclude<SpinParamRoute, "skip" | "param">,
      definition: ParamDefinition,
      paramRow: ParamRowIndex,
      pauseDuration: number,
      spin: ParamSpinContext,
    ) => {
      if (route === "registrySlots") {
        await spinRegistryStringSlots(
          definition,
          paramRow.index,
          spin.plan,
          spin.loader,
          pauseDuration,
          spin.token,
        );
        removeParamRow(paramRow);
        return;
      }

      const slotsStart = nowMs();
      await spinStringLayerSlots(
        route,
        paramRow.index,
        spin.plan,
        spin.loader,
        pauseDuration,
        spin.token,
      );
      const slotsEnd = nowMs();
      addActualDuration(route, slotsEnd - slotsStart);
      removeParamRow(paramRow);
      clearMirror();
    },
    [
      addActualDuration,
      clearMirror,
      removeParamRow,
      spinRegistryStringSlots,
      spinStringLayerSlots,
    ],
  );

  /** Reveal one param of the sequence; false once a newer spin takes over. */
  const spinParamDefinition = useCallback(
    async (
      definition: ParamDefinition,
      route: Exclude<SpinParamRoute, "skip">,
      spin: ParamSpinContext,
    ): Promise<boolean> => {
      const paramKeyCandidate = definition.id;
      const paramKey = isParamTimingKey(paramKeyCandidate)
        ? paramKeyCandidate
        : null;
      const paramStart = nowMs();

      setActiveParamId(definition.id);
      const paramRow: ParamRowIndex = { index: -1 };
      setParamRows((prev) => {
        const nextIndex = prev.length;
        paramRow.index = nextIndex;
        return [
          ...prev,
          {
            id: definition.id,
            label: definition.label,
            value: "—",
            status: "active",
          },
        ];
      });

      const spinState = readSpinState();
      const pauseDuration = paramPauseDuration(
        spinState.speed,
        modeRef.current,
        speedMultiplierRef.current,
      );

      if (route !== "param") {
        await spinSlotParam(route, definition, paramRow, pauseDuration, spin);
        return true;
      }

      const phase = spin.plan.phase("param", definition.id);
      if (!phase) {
        throw new Error(`Spin plan has no phase for ${definition.id}`);
      }
      const displayValue = getParameterValueForDisplay(
        definition.id,
        spin.params,
      );
      const shouldAnimate =
        spinState.spinny && isAnimatableParam(definition, spin.rollerOptions);
      const revealed = shouldAnimate
        ? await animateParamPhase(
            definition,
            phase,
            displayValue,
            paramKey,
            spinState.speed,
            spin.loader,
            spin.token,
          )
        : await revealParamPhase(
            definition,
            phase,
            displayValue,
            spin.loader,
            spin.token,
          );
      if (!revealed) return false;

      if (definition.compoundMode === "tortieParts") {
        await spinTortieSlots(
          paramRow.index,
          spin.plan,
          spin.loader,
          pauseDuration,
          spin.token,
        );
      }

      await wait(pauseDuration);
      const paramEnd = nowMs();
      addActualDuration(paramKey, paramEnd - paramStart);
      return true;
    },
    [
      addActualDuration,
      animateParamPhase,
      readSpinState,
      revealParamPhase,
      spinSlotParam,
      spinTortieSlots,
    ],
  );

  /** Reveal every param in order; false once a newer spin takes over. */
  const spinParamSequence = useCallback(
    async (spin: ParamSpinContext): Promise<boolean> => {
      for (const definition of PARAM_SEQUENCE) {
        const route = spinParamRoute(definition);
        if (route === "skip") {
          continue;
        }
        if (generationIdRef.current !== spin.token) return false;
        if (!(await spinParamDefinition(definition, route, spin))) {
          return false;
        }
      }
      return true;
    },
    [spinParamDefinition],
  );

  /** Without a mapper record, share through the cat share or the encoding. */
  const applyShareFallback = useCallback(
    (shareSlug: string | null, legacyEncoded: string | null) => {
      const origin = appOrigin();
      if (!catStateRef.current) return;
      if (shareSlug) {
        const fallbackUrl = withOrigin(
          origin,
          `/visual-builder?share=${shareSlug}`,
        );
        catStateRef.current = {
          ...catStateRef.current,
          catShareSlug: shareSlug,
          shareUrl: fallbackUrl,
        };
        setShareLink(fallbackUrl);
      } else if (legacyEncoded) {
        const fallbackUrl = withOrigin(origin, `/view?cat=${legacyEncoded}`);
        catStateRef.current = {
          ...catStateRef.current,
          legacyEncoded,
          shareUrl: fallbackUrl,
        };
        setShareLink(fallbackUrl);
      }
    },
    [],
  );

  const persistMapperRecord = useCallback(
    async (
      state: CatState,
      payload: ReturnType<typeof buildSharePayload>,
      shareSlug: string | null,
      legacyEncoded: string | null,
      persistToken: number,
    ) => {
      const mapperPayload = shareSlug ? { ...payload, shareSlug } : payload;

      try {
        const result = await createMapper({
          catData: catDataToLegacyPersistence(mapperPayload),
          catName: state.catName ?? undefined,
          creatorName: state.creatorName ?? undefined,
        });
        if (generationIdRef.current !== persistToken) return;
        if (result && catStateRef.current) {
          const shareToken =
            (result as { shareToken?: string }).shareToken ??
            result.slug ??
            result.id;
          const url = withOrigin(appOrigin(), `/view/${shareToken}`);
          catStateRef.current = {
            ...catStateRef.current,
            profileId: result.id,
            mapperSlug: shareToken,
            legacyEncoded,
            shareUrl: url,
            catShareSlug: shareSlug ?? catStateRef.current.catShareSlug ?? null,
          };
          setShareLink(url);
        }
      } catch (err) {
        console.warn("Failed to persist mapper record", err);
        applyShareFallback(shareSlug, legacyEncoded);
      }
    },
    [applyShareFallback, createMapper],
  );

  /** Save the rolled cat's share records in the background. */
  const persistGeneratedCat = useCallback(
    async (persistToken: number) => {
      if (generationIdRef.current !== persistToken) return;
      const state = catStateRef.current;
      if (!state) return;
      const payload = buildSharePayload(state);
      const shareSeed = {
        params: payload.params,
        accessorySlots: payload.accessorySlots,
        scarSlots: payload.scarSlots,
        tortieSlots: payload.tortieSlots,
        counts: payload.counts,
      } as const;

      let shareSlug: string | null = state.catShareSlug ?? null;
      const shareRecord = await createCatShare(shareSeed);
      if (generationIdRef.current !== persistToken) return;
      if (shareRecord?.slug) {
        shareSlug = shareRecord.slug;
      }
      if (shareSlug && catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catShareSlug: shareSlug,
        };
      }

      const legacyEncoded = encodeLegacyShare(
        payload,
        state.legacyEncoded ?? null,
      );
      if (generationIdRef.current !== persistToken) return;
      if (legacyEncoded && catStateRef.current) {
        catStateRef.current = { ...catStateRef.current, legacyEncoded };
      }

      await persistMapperRecord(
        state,
        payload,
        shareSlug,
        legacyEncoded,
        persistToken,
      );
    },
    [persistMapperRecord],
  );

  /** Store the finished cat, report timing, and start persisting it. */
  const commitGeneratedCat = useCallback(
    (
      generator: CatGeneratorApi,
      params: Partial<CatParams>,
      slots: SpinPlan["slots"],
      countsResult: GenerationCounts,
      token: number,
    ) => {
      const { accessorySlots, scarSlots, tortieSlots } = slots;
      const builderParams = buildBuilderParams(params, slots);
      const catUrl = generator.buildCatURL?.(builderParams) ?? "";

      // Persist refs/state for actions
      const nextState: CatState = {
        params,
        accessorySlots,
        scarSlots,
        tortieSlots,
        counts: countsResult,
        catUrl,
        builderParams,
        shareUrl: null,
        profileId: null,
        mapperSlug: null,
        legacyEncoded: catStateRef.current?.legacyEncoded ?? null,
        catShareSlug: catStateRef.current?.catShareSlug ?? null,
        catName: null,
        creatorName: null,
      };

      catStateRef.current = nextState;
      resetMetaDrafts();
      setShareLink(null);
      setMetaSaving(false);

      logTimingReport(
        "post-roll",
        activeTimingRef.current,
        adjustedOptionCounts,
        estimatedTotals,
        actualDurationsRef.current,
        totalActualRef.current,
      );
      setLastTimingSnapshot({
        counts: { ...adjustedOptionCounts },
        estimated: { ...estimatedTotals.perKey },
        estimatedTotal: estimatedTotals.total,
        actual: { ...actualDurationsRef.current },
        actualTotal: totalActualRef.current,
        timestamp: nowMs(),
      });
      setIsGenerating(false);
      track("single_cat_generated", {
        mode: modeRef.current,
        accessories: countsResult.accessories > 0,
        scars: countsResult.scars > 0,
        torties: countsResult.tortie > 0,
        afterlife: afterlifeMode !== "off",
        speed: speedMultiplierRef.current,
        layer_count_mode: exactLayerCounts ? "exact" : "chance",
      });
      window.setTimeout(() => {
        if (generationIdRef.current === token) {
          setRollerExpanded(false);
        }
      }, 500);

      void persistGeneratedCat(token);
    },
    [
      adjustedOptionCounts,
      afterlifeMode,
      estimatedTotals,
      exactLayerCounts,
      persistGeneratedCat,
      resetMetaDrafts,
    ],
  );

  /** Roll a cat and play its whole spin; returns early once superseded. */
  const runCatPlusSpin = useCallback(
    async (
      generator: CatGeneratorApi,
      mapper: SpriteMapperApi,
      loader: SpinFrameLoader,
      token: number,
    ) => {
      const accessoryCount = computeLayerCount(accessoryRange);
      const scarCount = computeLayerCount(scarRange);
      const tortieCount = computeLayerCount(tortieRange);
      const experimentalMode =
        extendedModesArray.length === 0 ? "off" : extendedModesArray;

      if (!generator.generateRandomCat) {
        throw new Error("Random cat generation not available");
      }
      const randomResult = await generator.generateRandomCat({
        accessoryCount,
        scarCount,
        tortieCount,
        exactLayerCounts,
        experimentalColourMode: experimentalMode,
        whitePatchColourMode: "default",
        includeBaseColours,
        includeNewSprites,
      });

      if (generationIdRef.current !== token) return;

      const { params, tinted } = applyRolledAfterlife(
        randomResult.params,
        afterlifeMode,
      );

      // The whole spin, simulated up front so every frame can be preloaded.
      const rollerOptions = parameterOptionsRef.current;
      const plan = buildSpinPlan({
        params,
        slotSelections: randomResult.slotSelections,
        parameterOptions: rollerOptions,
        pools: readSpinPools(mapper, rollerOptions),
        spinny: readSpinState().spinny,
        sequence: PARAM_SEQUENCE,
      });
      const { accessorySlots, scarSlots, tortieSlots } = plan.slots;

      resetLayerRows(accessorySlots, scarSlots, tortieSlots, {
        ...params.traits,
        ...randomResult.slotSelections,
      });

      const countsResult: GenerationCounts = {
        accessories: accessorySlots.length,
        scars: scarSlots.length,
        tortie: tortieSlots.length,
      };

      setRollSummary(
        `Rolled → Accessories: ${countsResult.accessories} • Scars: ${countsResult.scars} • Tortie layers: ${countsResult.tortie}`,
      );
      setHasTint(tinted);
      setSpriteGalleryOpen(false);

      setParamRows([]);

      const countReveal = exactLayerCounts
        ? await prepareCountReveal(
            generator,
            [
              {
                label: "Accessories",
                key: "accessory",
                range: accessoryRange,
                count: accessoryCount,
              },
              {
                label: "Scars",
                key: "scar",
                range: scarRange,
                count: scarCount,
              },
              {
                label: "Tortie Layers",
                key: "tortieMask",
                range: tortieRange,
                count: tortieCount,
              },
            ],
            {
              experimentalColourMode: experimentalMode,
              includeBaseColours,
              includeNewSprites,
            },
          )
        : [];
      if (generationIdRef.current !== token) return;

      // Queue in play order: the count reveal, then every render of the spin.
      prefetchCountReveal(loader, countReveal);
      prefetchSpin(loader, plan);

      // Count reveal phase — spin the accessory/scar/tortie counts before params
      if (exactLayerCounts) {
        await revealLayerCounts(loader, countReveal, token);
        if (generationIdRef.current !== token) return;
      }

      const spun = await spinParamSequence({
        plan,
        params,
        rollerOptions,
        loader,
        token,
      });
      if (!spun) return;

      setActiveParamId(null);
      setRollerActiveValue(null);
      setRollerLabel(null);

      drawCanvas(await loader.single(plan.phase("final").params));
      if (generationIdRef.current !== token) return;

      commitGeneratedCat(generator, params, plan.slots, countsResult, token);
    },
    [
      accessoryRange,
      afterlifeMode,
      commitGeneratedCat,
      drawCanvas,
      exactLayerCounts,
      extendedModesArray,
      includeBaseColours,
      includeNewSprites,
      readSpinState,
      resetLayerRows,
      revealLayerCounts,
      scarRange,
      spinParamSequence,
      tortieRange,
    ],
  );

  const generateCatPlus = useCallback(async () => {
    const generator = generatorRef.current;
    if (!generator) return;
    const mapper = await ensureMapperReady();
    if (!mapper) {
      setRollerExpanded(false);
      return;
    }

    resetActualDurations();
    const timingProfile: SpinTimingConfig = {
      allowFastFlips: timingConfig.allowFastFlips,
      delays: { ...DEFAULT_TIMING_CONFIG.delays, ...timingConfig.delays },
    };
    activeTimingRef.current = timingProfile;

    setError(null);
    setShareLink(null);
    spritePreviewTokenRef.current += 1;
    setSpriteVariations([]);
    setSpritePreviewLoading(false);
    setParamRows([]);
    setRollerLabel(null);
    setRollerActiveValue(null);
    setRollerHighlight(false);
    setRollSummary(null);
    setActiveParamId(null);
    setHasTint(false);
    clearMirror();
    drawPlaceholder();
    setRollerExpanded(true);

    const token = ++generationIdRef.current;
    // A fresh loader per spin; disposing the old one cancels its renders.
    spinLoaderRef.current?.dispose();
    const loader = createSpinFrameLoader(generator);
    spinLoaderRef.current = loader;
    setIsGenerating(true);

    try {
      await runCatPlusSpin(generator, mapper, loader, token);
    } catch (err) {
      // A newer spin or unmount disposed this spin's loader: not an error.
      if (
        err instanceof SpinLoaderDisposedError ||
        generationIdRef.current !== token
      ) {
        return;
      }
      console.error("Failed to generate cat", err);
      setError("Failed to generate cat. Please try again.");
      setRollerActiveValue(null);
      setRollerLabel(null);
      setRollerHighlight(false);
      setIsGenerating(false);
      window.setTimeout(() => {
        setRollerExpanded(false);
      }, 300);
    } finally {
      // Drops cached frames and any prefetch the spin no longer needs.
      loader.dispose();
      if (spinLoaderRef.current === loader) {
        spinLoaderRef.current = null;
      }
    }
  }, [
    ensureMapperReady,
    runCatPlusSpin,
    clearMirror,
    drawPlaceholder,
    timingConfig.allowFastFlips,
    timingConfig.delays,
    resetActualDurations,
  ]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cat.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Downloaded PNG");
      track("single_cat_exported", { format: "download-png" });
    }, "image/png");
  }, [showToast]);

  const exportCat = useCallback(
    async (options?: { noTint?: boolean }) => {
      const state = catStateRef.current;
      const generator = generatorRef.current;
      if (!state || !generator) return;
      const params = { ...state.params } as Record<string, unknown>;
      if (options?.noTint) {
        params.darkForest = false;
        params.darkMode = false;
        params.dead = false;
        syncChangedRegistryTraitsFromLegacy(params, ["darkForest", "dead"]);
      }
      const result = await generator.generateCat(params);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = FULL_EXPORT_SIZE;
      exportCanvas.height = FULL_EXPORT_SIZE;
      const ctx = exportCanvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          result.canvas as HTMLCanvasElement,
          0,
          0,
          FULL_EXPORT_SIZE,
          FULL_EXPORT_SIZE,
        );
      }
      await copyCanvasToClipboard(
        exportCanvas,
        options?.noTint
          ? `Copied cat (no tint) (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`
          : `Copied cat (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`,
        options?.noTint ? "cat-no-tint" : "cat",
        showToast,
        (message) => setError(message),
      );
    },
    [showToast],
  );

  const handleCopySprite = useCallback(
    async (
      spriteNumber: number,
      size: 120 | typeof FULL_EXPORT_SIZE,
      poseName?: string | null,
      displayName?: string,
    ) => {
      const state = catStateRef.current;
      const generator = generatorRef.current;
      if (!state || !generator) return;
      const spriteName =
        displayName ??
        (poseName
          ? formatPoseName(poseName)
          : getPoseDisplayName({
              spriteNumber,
              poseName: state.params.poseName,
            }));
      const params = {
        ...state.params,
        spriteNumber,
        poseName: poseName ?? undefined,
      };
      syncChangedRegistryTraitsFromLegacy(params, ["pose"]);
      const result = await generator.generateCat(params);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = size;
      exportCanvas.height = size;
      const ctx = exportCanvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(result.canvas as HTMLCanvasElement, 0, 0, size, size);
      }
      await copyCanvasToClipboard(
        exportCanvas,
        size === 120
          ? `Copied ${spriteName} (120×120)!`
          : `Copied ${spriteName} (${FULL_EXPORT_SIZE}×${FULL_EXPORT_SIZE})!`,
        size === 120
          ? `${spriteName.toLowerCase()}-120`
          : `${spriteName.toLowerCase()}-700`,
        showToast,
        (message) => setError(message),
      );
      track("single_cat_exported", { format: `copy-${size}px` });
    },
    [showToast],
  );

  const closeSpriteGallery = useCallback(() => {
    spritePreviewTokenRef.current += 1;
    setSpritePreviewLoading(false);
    setSpriteGalleryOpen(false);
  }, []);

  const generateSpritePreviews = useCallback(async () => {
    const state = catStateRef.current;
    const generator = generatorRef.current;
    if (!state || !generator) return;

    const mapper = await ensureMapperReady();
    if (!mapper) return;

    const previewToken = ++spritePreviewTokenRef.current;
    setSpritePreviewLoading(true);
    setSpriteVariations([]);

    try {
      const poseChoices = getAvailablePoseNames(mapper).map((poseName) => ({
        id: `pose-${poseName}`,
        poseName,
        spriteNumber: state.params.spriteNumber ?? DEFAULT_SPRITE_NUMBER,
        name: formatPoseName(poseName),
      }));
      const nextPreviews: SpriteVariation[] = [];

      for (const poseChoice of poseChoices) {
        if (spritePreviewTokenRef.current !== previewToken) return;
        const spriteParams = {
          ...state.params,
          spriteNumber: poseChoice.spriteNumber,
          poseName: poseChoice.poseName,
        };
        syncChangedRegistryTraitsFromLegacy(spriteParams, ["pose"]);
        const result = await generator.generateCat(spriteParams);
        if (spritePreviewTokenRef.current !== previewToken) return;
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 120;
        previewCanvas.height = 120;
        const previewCtx = previewCanvas.getContext("2d");
        if (previewCtx) {
          previewCtx.imageSmoothingEnabled = false;
          previewCtx.drawImage(
            result.canvas as HTMLCanvasElement,
            0,
            0,
            120,
            120,
          );
        }
        nextPreviews.push({
          id: poseChoice.id,
          spriteNumber: poseChoice.spriteNumber,
          poseName: poseChoice.poseName,
          name: poseChoice.name,
          dataUrl: previewCanvas.toDataURL("image/png"),
        });
      }

      if (spritePreviewTokenRef.current === previewToken) {
        setSpriteVariations(nextPreviews);
      }
    } catch (error) {
      console.error("Failed to generate sprite previews", error);
      if (spritePreviewTokenRef.current === previewToken) {
        setError("Failed to generate sprite previews. Please try again.");
      }
    } finally {
      if (spritePreviewTokenRef.current === previewToken) {
        setSpritePreviewLoading(false);
      }
    }
  }, [ensureMapperReady]);

  const handleOpenSpriteGallery = useCallback(() => {
    setSpriteGalleryOpen(true);
    if (spriteVariations.length === 0 && !spritePreviewLoading) {
      void generateSpritePreviews();
    }
  }, [generateSpritePreviews, spritePreviewLoading, spriteVariations.length]);

  const buildShareUrl = useCallback(async () => {
    const state = catStateRef.current;
    if (!state) return null;
    if (state.shareUrl) return state.shareUrl;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    let shareSlug: string | null = state.catShareSlug ?? null;

    const slugCandidate = state.mapperSlug ?? state.profileId ?? null;
    if (slugCandidate) {
      const url = origin
        ? `${origin}/view/${slugCandidate}`
        : `/view/${slugCandidate}`;
      catStateRef.current = { ...state, shareUrl: url };
      setShareLink(url);
      return url;
    }

    const payload = buildSharePayload(state);
    let legacyEncoded = state.legacyEncoded ?? null;
    if (!legacyEncoded) {
      try {
        legacyEncoded = encodeCatShare(payload);
      } catch (err) {
        console.warn("Failed to encode share payload", err);
      }
    }

    try {
      const result = await createMapper({
        catData: catDataToLegacyPersistence(
          shareSlug ? { ...payload, shareSlug } : payload,
        ),
        catName: state.catName ?? undefined,
        creatorName: state.creatorName ?? undefined,
      });
      if (result) {
        const shareToken =
          (result as { shareToken?: string }).shareToken ??
          result.slug ??
          result.id;
        const url = origin
          ? `${origin}/view/${shareToken}`
          : `/view/${shareToken}`;
        catStateRef.current = {
          ...state,
          profileId: result.id,
          mapperSlug: shareToken,
          legacyEncoded,
          shareUrl: url,
          catShareSlug: shareSlug ?? state.catShareSlug ?? null,
        };
        setShareLink(url);
        return url;
      }
    } catch (err) {
      console.warn("Failed to persist share payload to Convex", err);
    }

    if (!shareSlug) {
      const shareRecord = await createCatShare({
        params: payload.params,
        accessorySlots: payload.accessorySlots,
        scarSlots: payload.scarSlots,
        tortieSlots: payload.tortieSlots,
        counts: payload.counts,
      });
      if (shareRecord?.slug) {
        shareSlug = shareRecord.slug;
        if (catStateRef.current) {
          catStateRef.current = {
            ...catStateRef.current,
            catShareSlug: shareSlug,
          };
        }
      }
    }

    if (shareSlug) {
      const url = origin
        ? `${origin}/visual-builder?share=${shareSlug}`
        : `/visual-builder?share=${shareSlug}`;
      if (catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catShareSlug: shareSlug,
          shareUrl: url,
          legacyEncoded:
            catStateRef.current.legacyEncoded ?? legacyEncoded ?? null,
        };
      }
      setShareLink(url);
      return url;
    }

    if (legacyEncoded) {
      const url = origin
        ? `${origin}/view?cat=${legacyEncoded}`
        : `/view?cat=${legacyEncoded}`;
      catStateRef.current = { ...state, legacyEncoded, shareUrl: url };
      setShareLink(url);
      return url;
    }

    setError("Unable to build share link right now.");
    return null;
  }, [createMapper]);

  const handleCopyShareLink = useCallback(async () => {
    const url = await buildShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied!");
      track("single_cat_shared", {});
    } catch (err) {
      console.warn("Clipboard failed, showing prompt", err);
      window.prompt("Copy this link", url);
    }
  }, [buildShareUrl, showToast]);

  const handleOpenShareViewer = useCallback(async () => {
    const url = await buildShareUrl();
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener=yes");
    if (!opened) {
      showToast("Enable popups to open the share viewer.");
    }
  }, [buildShareUrl, showToast]);

  const handleSaveMeta = useCallback(async () => {
    const state = catStateRef.current;
    if (!state?.profileId) {
      showToast("Roll a cat before saving.");
      return;
    }
    const trimmedCat = catNameDraft.trim();
    const trimmedCreator = creatorNameDraft.trim();
    setMetaSaving(true);
    try {
      const result = await updateMapperMeta({
        id: state.profileId as Id<"cat_profile">,
        catName: trimmedCat || undefined,
        creatorName: trimmedCreator || undefined,
      });
      if (result && catStateRef.current) {
        catStateRef.current = {
          ...catStateRef.current,
          catName: result.catName ?? null,
          creatorName: result.creatorName ?? null,
          profileId: result.id ?? catStateRef.current.profileId,
          mapperSlug:
            (result as { shareToken?: string }).shareToken ??
            result.slug ??
            result.id ??
            catStateRef.current.mapperSlug,
        };
        resetMetaDrafts(result.catName, result.creatorName);
      } else {
        resetMetaDrafts(trimmedCat || null, trimmedCreator || null);
      }
      setMetaDirty(false);
      showToast("Saved to history!");
    } catch (err) {
      console.error("Failed to update mapper meta", err);
      setError("Unable to save history entry. Please try again.");
    } finally {
      setMetaSaving(false);
    }
  }, [
    catNameDraft,
    creatorNameDraft,
    updateMapperMeta,
    resetMetaDrafts,
    showToast,
  ]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (event.shiftKey) {
        event.preventDefault();
        exportCat({ noTint: true }).catch((err) => console.error(err));
      }
    },
    [exportCat],
  );

  const currentState = catStateRef.current;
  const currentSpriteNumber =
    typeof currentState?.params?.spriteNumber === "number"
      ? Number(currentState.params.spriteNumber)
      : DEFAULT_SPRITE_NUMBER;
  const currentPoseLabel = currentState
    ? getPoseDisplayName(currentState.params)
    : null;
  const canCopySprite = Boolean(currentState && generatorRef.current);
  const spriteToolsSubtitle = canCopySprite
    ? `Current pose: ${currentPoseLabel}`
    : "Roll a cat to unlock sprite tools";
  const existingCatName = (currentState?.catName ?? "").trim();
  const existingCreatorName = (currentState?.creatorName ?? "").trim();
  const trimmedCatDraft = catNameDraft.trim();
  const trimmedCreatorDraft = creatorNameDraft.trim();
  const historyReady = Boolean(currentState?.profileId);
  const metaChanged =
    trimmedCatDraft !== existingCatName ||
    trimmedCreatorDraft !== existingCreatorName;
  const saveHistoryDisabled =
    !historyReady || metaSaving || (!metaDirty && !metaChanged);
  const viewerSlug = currentState?.mapperSlug ?? null;

  const generationDisabled = initializing || !!initialError;

  return (
    <div className="grid gap-10">
      <VariantBar<SingleCatSettings>
        variants={variants}
        snapshotConfig={snapshotConfig}
        applyConfig={applyVariantConfig}
        isDirty={variantDirty}
        showToast={showToast}
      />
      <div className="glass-card px-6 py-8">
        <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)] xl:items-start">
          <div className="flex flex-col gap-6">
            <div className="relative flex flex-col items-center gap-4">
              <div className="flip-container w-full max-w-[700px]">
                <div className="rounded-3xl border border-border/50 bg-background/90 p-6 shadow-inner">
                  <canvas
                    ref={canvasRef}
                    width={DISPLAY_SIZE}
                    height={DISPLAY_SIZE}
                    onClick={handleCanvasClick}
                    className="w-full"
                  />
                </div>
              </div>
              {initializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-background/70">
                  <Loader2 className="mb-2 size-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Loading renderer
                  </p>
                </div>
              )}
            </div>

            <div className="mx-auto w-full max-w-[700px] rounded-2xl border border-border/40 bg-background/70 p-4 shadow-inner">
              <div className="text-center text-xs uppercase tracking-[0.32em] text-muted-foreground/80">
                {rollerLabel ?? "Ready"}
              </div>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  rollerExpanded
                    ? "mt-3 max-h-40 opacity-100"
                    : "max-h-0 opacity-0",
                )}
              >
                <div
                  className={cn(
                    "relative h-24 overflow-hidden rounded-xl bg-gradient-to-b from-background/40 via-background/20 to-background/5 transition",
                    rollerHighlight && "roller-flash ring-2 ring-primary/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-full items-center justify-center font-semibold transition",
                      rollerActiveValue
                        ? "text-primary"
                        : "text-muted-foreground/40",
                      rollerHighlight && "text-primary",
                      rollerValueClass,
                    )}
                  >
                    {rollerActiveValue ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:translate-y-0.5 hover:opacity-90"
                onClick={generateCatPlus}
                disabled={generationDisabled || isGenerating}
              >
                <RefreshIcon size={16} />
                {getGenerateButtonLabel(initializing, isGenerating)}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                onClick={handleDownload}
                disabled={initializing}
              >
                <Download className="size-4" />
                Download PNG
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                onClick={() => exportCat()}
                disabled={initializing}
              >
                <CopyIcon size={16} />
                Copy 700×700
              </button>
              {hasTint && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
                  onClick={() => exportCat({ noTint: true })}
                  disabled={initializing}
                  title="Shift+click the canvas for a shortcut"
                >
                  <CopyIcon size={16} />
                  Copy (No Tint)
                </button>
              )}
            </div>

            {rollSummary && (
              <div className="rounded-2xl border border-border/40 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                {rollSummary}
              </div>
            )}

            <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Parameter Reveal
                </h3>
                <div className="flex min-h-[1.5rem] items-center gap-2 text-xs text-muted-foreground">
                  {rollerActiveValue ? (
                    <>
                      <SparklesIcon size={12} />
                      <span className="font-mono uppercase tracking-wide text-primary">
                        {rollerActiveValue}
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-muted-foreground/60">
                      Ready
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {paramRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Roll a cat to reveal traits one by one.
                  </p>
                )}
                {paramRows.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between rounded-xl border border-border/30 px-3 py-2 text-sm transition ${
                      row.status === "active" || activeParamId === row.id
                        ? "bg-primary/10 text-foreground"
                        : "bg-background/70 text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium text-foreground/90">
                      {row.label}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-wide text-foreground">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/60 p-4 text-sm text-muted-foreground">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Layered Details
              </h3>
              <div className="grid gap-3 md:grid-cols-3">
                {Object.keys(layerGroupLabels).map((group) => {
                  const rows = layerRows[group];
                  return (
                    <div key={group} className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                        {layerGroupLabels[group]}
                      </p>
                      {rows.length ? (
                        <ul className="space-y-2">
                          {rows.map((row) => (
                            <li
                              key={`${group}-${row.label}`}
                              className={cn(
                                "rounded-xl border px-3 py-2 transition",
                                LAYER_ROW_STATUS_CLASSES[row.status],
                              )}
                            >
                              <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
                                {row.label}
                              </span>
                              <span className="block font-mono text-sm text-foreground">
                                {row.value}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground/60">
                          None rolled
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Links & Actions
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                  onClick={handleCopyShareLink}
                  disabled={!catStateRef.current}
                >
                  <SendHorizontalIcon size={16} /> Copy Share Link
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                  onClick={handleOpenShareViewer}
                  disabled={!catStateRef.current}
                >
                  <SparklesIcon size={16} /> Open Share Viewer
                </button>
              </div>
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
                      onChange={(event) => {
                        setCatNameDraft(event.target.value);
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
                      onChange={(event) => {
                        setCreatorNameDraft(event.target.value);
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
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:opacity-50"
                    onClick={handleSaveMeta}
                    disabled={saveHistoryDisabled}
                  >
                    <SparklesIcon size={16} /> Save to History
                  </button>
                  <Link
                    href="/history"
                    className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                  >
                    Browse History
                  </Link>
                  {viewerSlug && (
                    <Link
                      href={`/view/${viewerSlug}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                    >
                      <ArrowUpRight className="size-4" /> View Entry
                    </Link>
                  )}
                </div>
              </div>
              {shareLink && (
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  Latest share:{" "}
                  <span className="text-foreground">{shareLink}</span>
                </p>
              )}
            </div>
          </div>

          <aside className="rounded-2xl border border-border/40 bg-background/60 p-5">
            <h3 className="text-sm font-semibold text-foreground">Controls</h3>
            <div className="mt-4 space-y-6 text-sm text-muted-foreground">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                  Generation Mode
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("flashy");
                      track("single_cat_mode_changed", { mode: "flashy" });
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      mode === "flashy"
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border/60 bg-background/70"
                    }`}
                  >
                    Flashy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("calm");
                      track("single_cat_mode_changed", { mode: "calm" });
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      mode === "calm"
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border/60 bg-background/70"
                    }`}
                  >
                    Calm
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Timing
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        ref={timingTriggerRef}
                        type="button"
                        onClick={() => setTimingModalOpen(true)}
                        className="flex-1 inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                      >
                        Adjust Timing Settings
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSpeedMultiplier((prev) =>
                            Math.max(0.25, Math.min(4.0, prev - 0.25)),
                          )
                        }
                        className="inline-flex items-center justify-center rounded-full border border-border/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Slow down (decrease speed multiplier)"
                        disabled={speedMultiplier <= 0.25}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSpeedMultiplier((prev) =>
                            Math.max(0.25, Math.min(4.0, prev + 0.25)),
                          )
                        }
                        className="inline-flex items-center justify-center rounded-full border border-border/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Speed up (increase speed multiplier)"
                        disabled={speedMultiplier >= 4.0}
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground/70">
                        Estimated total:{" "}
                        {formatMs(effectiveTotalMs / speedMultiplier)}
                      </span>
                      {speedMultiplier !== 1.0 && (
                        <span className="text-muted-foreground/70">
                          {speedMultiplier > 1 ? "×" : "÷"}{" "}
                          {Math.abs(speedMultiplier).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                  Layer Counts
                </p>
                <LayerRangeSelector
                  label="Accessories"
                  value={accessoryRange}
                  onChange={setAccessoryRange}
                />
                <LayerRangeSelector
                  label="Scars"
                  value={scarRange}
                  onChange={setScarRange}
                />
                <LayerRangeSelector
                  label="Tortie Layers"
                  value={tortieRange}
                  onChange={setTortieRange}
                />
                <LayerCountModeSelector
                  value={exactLayerCounts}
                  onChange={setExactLayerCounts}
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                  Afterlife Effects
                </p>
                <label className="flex flex-col gap-1 text-xs">
                  <span>Dark Forest / StarClan chance</span>
                  <select
                    value={afterlifeMode}
                    onChange={(event) =>
                      setAfterlifeMode(event.target.value as AfterlifeOption)
                    }
                    className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    {AFTERLIFE_OPTIONS.map((option) => (
                      <option
                        key={`afterlife-${option.value}`}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground/80">
                  <PaintIcon size={12} /> Colour Palettes
                  <Link
                    href="/cat-color-palettes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-muted-foreground/60 transition-colors hover:text-amber-400"
                    title="View all colour palettes"
                  >
                    <ExternalLinkIcon size={12} />
                  </Link>
                </p>
                <PaletteMultiSelect
                  selected={extendedModes as Set<PaletteId>}
                  onChange={(newSet) =>
                    setExtendedModes(newSet as Set<ExtendedMode>)
                  }
                  includeClassic={includeBaseColours}
                  onClassicChange={setIncludeBaseColours}
                />
              </div>

              {/* Settings Code */}
              <SettingsCodeSection
                accessoryRange={accessoryRange}
                scarRange={scarRange}
                tortieRange={tortieRange}
                exactLayerCounts={exactLayerCounts}
                afterlifeMode={afterlifeMode}
                includeBaseColours={includeBaseColours}
                includeNewSprites={includeNewSprites}
                extendedModes={extendedModes}
                onApply={(portable) => {
                  setAccessoryRange(portable.accessoryRange);
                  setScarRange(portable.scarRange);
                  setTortieRange(portable.tortieRange);
                  setExactLayerCounts(portable.exactLayerCounts);
                  setAfterlifeMode(portable.afterlifeMode);
                  setIncludeBaseColours(portable.includeBaseColours);
                  setIncludeNewSprites(portable.includeNewSprites);
                  setExtendedModes(new Set(portable.extendedModes));
                }}
              />
            </div>
          </aside>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {initialError && (
          <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {initialError}
          </p>
        )}
      </div>

      <div className="glass-card px-6 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Sprite Tools
            </h3>
            <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
              {spriteToolsSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => handleCopySprite(currentSpriteNumber, 120)}
              disabled={!canCopySprite}
            >
              Copy 120×120
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() =>
                handleCopySprite(currentSpriteNumber, FULL_EXPORT_SIZE)
              }
              disabled={!canCopySprite}
            >
              Copy 700×700
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleOpenSpriteGallery}
              disabled={!canCopySprite}
            >
              View Sprite Gallery
            </button>
          </div>
        </div>
      </div>

      {spriteGalleryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 py-10"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeSpriteGallery();
            }
          }}
          onKeyDown={(event) =>
            handleManagedDialogKeyDown(event, closeSpriteGallery)
          }
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-labelledby="sprite-gallery-title"
        >
          <div className="relative flex max-h-[85vh] w-full max-w-5xl flex-col rounded-3xl border border-border/40 bg-background/95 p-8 shadow-2xl">
            <button
              ref={spriteGalleryCloseRef}
              type="button"
              onClick={closeSpriteGallery}
              aria-label="Close sprite gallery"
              className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              <XIcon size={16} />
            </button>
            <div className="flex min-h-0 flex-col gap-6">
              <div>
                <h2
                  id="sprite-gallery-title"
                  className="text-xl font-semibold text-foreground"
                >
                  Sprite Gallery
                </h2>
                <p className="text-sm text-muted-foreground">
                  Browse every sprite rendered for this cat and copy quick
                  exports.
                </p>
              </div>
              {spritePreviewLoading && (
                <div className="rounded-2xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
                  Generating sprite previews...
                </div>
              )}
              {!spritePreviewLoading && spriteVariations.length === 0 && (
                <div className="rounded-2xl border border-border/40 bg-background/70 p-6 text-sm text-muted-foreground">
                  No sprite previews available.
                </div>
              )}
              {!spritePreviewLoading && spriteVariations.length > 0 && (
                <div className="min-h-0 overflow-y-auto pr-1">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {spriteVariations.map((variation) => (
                      <div
                        key={variation.id}
                        className="rounded-2xl border border-border/40 bg-background/70 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">
                            {variation.name}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            Named pose
                          </span>
                        </div>
                        <div className="mt-3 overflow-hidden rounded-xl border border-border/30 bg-background/80">
                          <Image
                            src={variation.dataUrl}
                            alt={variation.name}
                            width={120}
                            height={120}
                            unoptimized
                            className="mx-auto block h-28 w-28 image-render-pixel"
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            aria-label={`Copy ${variation.name} at 120 by 120 pixels`}
                            className="flex-1 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                            onClick={() =>
                              handleCopySprite(
                                variation.spriteNumber,
                                120,
                                variation.poseName ?? null,
                                variation.name,
                              )
                            }
                          >
                            Copy 120×120
                          </button>
                          <button
                            type="button"
                            aria-label={`Copy ${variation.name} at ${FULL_EXPORT_SIZE} by ${FULL_EXPORT_SIZE} pixels`}
                            className="flex-1 rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-foreground hover:text-background"
                            onClick={() =>
                              handleCopySprite(
                                variation.spriteNumber,
                                FULL_EXPORT_SIZE,
                                variation.poseName ?? null,
                                variation.name,
                              )
                            }
                          >
                            Copy 700×700
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {timingModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-10"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setTimingModalOpen(false);
            }
          }}
          onKeyDown={(event) =>
            handleManagedDialogKeyDown(event, () => setTimingModalOpen(false))
          }
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-labelledby="spin-timing-title"
        >
          <div className="relative w-full max-w-5xl rounded-3xl border border-border/40 bg-background/95 shadow-2xl">
            <button
              ref={timingCloseRef}
              type="button"
              onClick={() => setTimingModalOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-border/50 bg-background/80 p-1.5 text-muted-foreground transition hover:bg-foreground hover:text-background"
              aria-label="Close timing settings"
            >
              <XIcon size={16} />
            </button>
            <div className="max-h-[80vh] overflow-y-auto px-6 pb-8 pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    id="spin-timing-title"
                    className="text-lg font-semibold text-foreground"
                  >
                    Spin Timing
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Tune per-parameter delays for flashy rolls. Estimated totals
                    update instantly; actuals are logged after each roll.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground/80">
                  <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 font-mono text-foreground">
                    Estimated total: {formatMs(estimatedTotals.total)}
                  </span>
                  {lastTimingSnapshot && (
                    <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 font-mono text-muted-foreground">
                      Last roll: {formatMs(lastTimingSnapshot.actualTotal)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {GLOBAL_PRESETS.map((preset) => {
                  const label = getGlobalPresetLabel(preset);
                  const active = activeGlobalPreset === preset;
                  return (
                    <button
                      key={`preset-${preset}`}
                      type="button"
                      onClick={() => handleGlobalPreset(preset)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-primary/60 bg-primary/20 text-foreground"
                          : "border-border/60 bg-background/70 text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleResetTimings}
                  className="ml-auto rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                >
                  Reset to Default
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  <span>Flashy pause</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.1}
                      value={flashyPauseSeconds}
                      onChange={(event) =>
                        handlePauseChange(
                          "flashyMs",
                          Number.parseFloat(event.target.value),
                        )
                      }
                      className="h-2 flex-1 rounded-full bg-border/60 accent-primary"
                    />
                    <span className="w-12 text-right font-mono text-sm text-foreground">
                      {flashyPauseSeconds.toFixed(1)} s
                    </span>
                  </div>
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  <span>Calm pause</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={0.1}
                      value={calmPauseSeconds}
                      onChange={(event) =>
                        handlePauseChange(
                          "calmMs",
                          Number.parseFloat(event.target.value),
                        )
                      }
                      className="h-2 flex-1 rounded-full bg-border/60 accent-primary"
                    />
                    <span className="w-12 text-right font-mono text-sm text-foreground">
                      {calmPauseSeconds.toFixed(1)} s
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-muted-foreground/80 sm:grid-cols-2">
                <span className="rounded-xl border border-border/40 bg-background/70 px-3 py-2">
                  Flashy pause:{" "}
                  <strong className="ml-1 font-mono text-foreground">
                    {formatMs(flashyPauseMs)}
                  </strong>
                </span>
                <span className="rounded-xl border border-border/40 bg-background/70 px-3 py-2">
                  Calm pause:{" "}
                  <strong className="ml-1 font-mono text-foreground">
                    {formatMs(calmPauseMs)}
                  </strong>
                </span>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-border/40">
                <div className="grid grid-cols-[minmax(0,1.6fr)_100px_80px_110px_110px] gap-3 border-b border-border/40 bg-background/70 px-4 py-3 text-[0.65rem] uppercase tracking-wide text-muted-foreground/70">
                  <span>Parameter</span>
                  <span className="text-right">Delay (ms)</span>
                  <span className="text-right">Options</span>
                  <span className="text-right">Estimated</span>
                  <span className="text-right">Last Actual</span>
                </div>
                {PARAM_TIMING_ORDER.map((key) => {
                  const label = PARAM_TIMING_LABELS[key] ?? key;
                  const storedDelay = timingConfig.delays[key];
                  const delayInputValue = Number.isFinite(storedDelay)
                    ? (storedDelay as number)
                    : getPresetValues(key).normal;
                  const rawOptions =
                    optionCounts[key] ?? PARAM_DEFAULT_STEP_COUNTS[key] ?? 0;
                  const effectiveOptions =
                    adjustedOptionCounts[key] ?? rawOptions;
                  const delayForEstimate = delayInputValue;
                  const estimatedDuration =
                    estimatedTotals.perKey[key] ??
                    delayForEstimate * effectiveOptions;
                  const actualDuration = lastTimingSnapshot?.actual?.[key] ?? 0;
                  const hasActual = actualDuration > 0;
                  return (
                    <div
                      key={`timing-row-${key}`}
                      className="grid grid-cols-[minmax(0,1.6fr)_100px_80px_110px_110px] items-center gap-3 border-b border-border/30 px-4 py-3 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {label}
                        </p>
                      </div>
                      <div className="text-right">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={delayInputValue}
                          onChange={(event) => {
                            const next = Number.parseFloat(event.target.value);
                            if (Number.isFinite(next)) {
                              handleTimingStepChange(key, next);
                            }
                          }}
                          className="w-full rounded-lg border border-border/50 bg-background/80 px-2 py-1 text-right font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="text-right font-mono text-sm text-foreground">
                        {effectiveOptions}
                      </div>
                      <div className="text-right font-mono text-sm text-muted-foreground">
                        {formatMs(estimatedDuration)}
                      </div>
                      <div className="text-right font-mono text-sm text-muted-foreground">
                        {hasActual ? formatMs(actualDuration) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-muted-foreground/70">
                Minimum delay is {MIN_SAFE_STEP_MS}ms. Console logs include a
                full breakdown after each roll.
              </p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-full border border-border/40 bg-background/90 px-4 py-2 text-sm text-foreground shadow-lg shadow-primary/10">
          {toast}
        </div>
      )}
    </div>
  );
}
