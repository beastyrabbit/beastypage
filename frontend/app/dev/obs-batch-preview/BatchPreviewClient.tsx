"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { BatchShowFrame } from "@/components/stream-control/obs/scenes/BatchScene";
import {
  type BatchBeat,
  type BatchBeatKind,
  batchPhaseForBeat,
  buildStageBeats,
  landedAt,
  type StageCatInput,
  type StageTimeline,
  timelineBeatAt,
} from "@/components/stream-control/obs/scenes/batch/batchBeats";
import { BATCH_SCENES } from "@/components/stream-control/obs/scenes/batch/batchRegistry";
import {
  type BatchShowView,
  type BatchViewCat,
  batchStatusLabel,
} from "@/components/stream-control/obs/scenes/batch/batchView";
import {
  BATCH_THEME_IDS,
  type BatchThemeId,
  isBatchThemeId,
} from "@/components/stream-control/obs/themes/batchThemeMeta";
import {
  OVERLAY_THEME_META,
  themeTokensToCssVars,
} from "@/components/stream-control/obs/themes/themeMeta";
import { type BatchStage, formatBatchNumber } from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";

/** Params for every mock cat — the prose looks describe these. */
const MOCK_PARAMS: CatParams = {
  spriteNumber: 0,
  peltName: "Tabby",
  colour: "SILVER",
  isTortie: false,
  eyeColour: "GREEN",
  skinColour: "PINK",
  shading: false,
  reverse: false,
};

type PreviewState = "loading" | "revealing" | "awaiting" | "done";
const STATES: readonly PreviewState[] = [
  "loading",
  "revealing",
  "awaiting",
  "done",
];
const BEATS: readonly BatchBeatKind[] = [
  "windup",
  "deal",
  "hold",
  "awaiting",
  "verdict",
  "depart",
  "repack",
  "done",
];

const STAGES: readonly { label: string; param: string }[] = [
  { label: "Colour", param: "colour" },
  { label: "Pelt", param: "peltName" },
  { label: "Eyes", param: "eyeColour" },
  { label: "Eye Colour 2", param: "eyeColour2" },
  { label: "Tint", param: "tint" },
  { label: "Skin", param: "skinColour" },
  { label: "White Patches", param: "whitePatches" },
  { label: "Points", param: "points" },
  { label: "Patches Tint", param: "whitePatchesTint" },
  { label: "Vitiligo", param: "vitiligo" },
  { label: "Accessory 1", param: "accessory" },
  { label: "Scar 1", param: "scar" },
  { label: "Shading", param: "shading" },
  { label: "Reverse", param: "reverse" },
  { label: "Pose", param: "poseName" },
];
const MOCK_STAGES: BatchStage[] = STAGES.map(({ label, param }, i) => ({
  id: `s${i.toString()}`,
  label,
  type: "simple",
  param,
}));
const MOCK_STAGE_INDEX = 6;
const GROUP_LABELS = ["Little", "Tuxedo", "Mask", "Van"] as const;
/** The round-2 scenario's culls, in order. */
const DEFAULT_CULLS = [8, 9, 15, 17, 19, 24, 14];
const PENDING_NUMBER = 16;
const AUTO_STAGES = 6;
const AUTO_AWAIT_MS = 3000;
const AUTO_VERDICT_MS = 3000;
const AUTO_DEPART_MS = 1600;
const AUTO_REPACK_MS = 400;

function catId(number: number): string {
  return `mock-${number.toString()}`;
}

/** Stage input per survivor: every third cat unchanged, the rest grouped by `i % 4`. */
function mockInputs(survivorNumbers: readonly number[]): StageCatInput[] {
  return survivorNumbers.map((number) => {
    const i = number - 1;
    if (i % 3 === 0) return { id: catId(number), value: null, changed: false };
    const label = GROUP_LABELS[i % 4];
    return {
      id: catId(number),
      value: { value: label.toUpperCase(), label },
      changed: true,
    };
  });
}

/** One frozen moment of the mock show. */
interface MockFrame {
  stageIndex: number;
  beat: BatchBeatKind;
  /** How many of the deal order have landed; "all" after the deal. */
  landedCount: number | "all";
  culled: readonly number[];
  pending: number | null;
  departing: number | null;
  verdictEndsAt: number | null;
  /** Landed changed cats show the alternate sprite set so the flash has pixels. */
  shifted: boolean;
}

function buildView(
  frame: MockFrame,
  urls: readonly (string | null)[],
  finalCount: number,
  origin: string,
  reducedMotion: boolean,
): BatchShowView {
  const pool = urls.length;
  const maxEliminations = Math.max(0, pool - finalCount);
  const culled = new Set(frame.culled);
  const survivorNumbers = Array.from({ length: pool }, (_, i) => i + 1).filter(
    (n) => !culled.has(n) || n === frame.departing,
  );
  const stage = MOCK_STAGES[Math.min(frame.stageIndex, MOCK_STAGES.length - 1)];
  const timeline = buildStageBeats(mockInputs(survivorNumbers), stage, {
    reducedMotion,
  });
  const landedIds =
    frame.beat === "loading" || frame.beat === "windup"
      ? []
      : frame.landedCount === "all"
        ? timeline.order
        : timeline.order.slice(0, frame.landedCount);
  const landed = new Set(landedIds);
  const changed = new Set(timeline.changedIds);
  const labelById = new Map(
    timeline.groups.flatMap((group) =>
      group.catIds.map((id) => [id, group.label] as const),
    ),
  );
  const beat: BatchBeat = {
    kind: frame.beat,
    stageId: stage.id,
    startedAt: 0,
    durationMs: 0,
    anchor: "server",
    order: timeline.order,
    landedIds,
    changedIds: timeline.changedIds,
    unchangedIds: timeline.unchangedIds,
    rareIds: timeline.rareIds,
    groups: timeline.groups,
    ...(frame.pending !== null ? { pendingCullId: catId(frame.pending) } : {}),
    ...(frame.verdictEndsAt !== null
      ? { verdictEndsAt: frame.verdictEndsAt }
      : {}),
  };
  const awaiting = frame.beat === "awaiting" || frame.beat === "verdict";
  const cats: BatchViewCat[] = urls.map((url, i) => {
    const number = i + 1;
    const id = catId(number);
    const isChanged = changed.has(id);
    const isLanded = landed.has(id);
    const shifted = frame.shifted !== (isChanged && isLanded);
    const sprite = shifted ? (urls[(i + 1) % pool] ?? url) : url;
    const departing = number === frame.departing;
    return {
      id,
      number,
      numberLabel: formatBatchNumber(number),
      label: `Cat ${number.toString()}`,
      previewUrl: frame.beat === "loading" ? null : sprite,
      params: MOCK_PARAMS,
      marked: awaiting && number === PENDING_NUMBER,
      potential: awaiting && (number === 3 || number === 23),
      favorite: number === 6 || number === 12,
      spotlight:
        frame.beat !== "done" &&
        frame.beat !== "windup" &&
        frame.beat !== "deal" &&
        number === 6,
      eliminated: culled.has(number),
      fading: departing,
      departing,
      changed: isChanged,
      landed: isLanded,
      valueLabel: isChanged ? (labelById.get(id) ?? null) : null,
    };
  });
  const survivors = cats.filter((cat) => !cat.eliminated || cat.fading);
  const eliminated = frame.culled
    .map((n) => cats[n - 1])
    .filter((cat): cat is BatchViewCat => Boolean(cat));
  const stageIndex = Math.min(frame.stageIndex, MOCK_STAGES.length - 1);
  const spotlight = cats.find((cat) => cat.spotlight) ?? null;
  const qrUrl = frame.beat === "done" ? `${origin}/adoption/mock-litter` : null;
  const pendingNumber =
    frame.pending !== null ? formatBatchNumber(frame.pending) : null;
  return {
    title: "Stream Litter",
    phase: batchPhaseForBeat(frame.beat),
    beat,
    stages: MOCK_STAGES,
    stageIndex,
    stageNumber: stageIndex + 1,
    stageLabel: stage.label,
    traitLabel: stage.label,
    cats,
    survivors,
    eliminated,
    poolSize: pool,
    remaining: pool - frame.culled.length,
    finalCount,
    maxEliminations,
    cullNumber: frame.culled.length + 1,
    spotlight,
    qrUrl,
    statusLabel: batchStatusLabel(frame.beat, true, stage.label, pendingNumber),
    reducedMotion,
  };
}

function useMockSprites(count: number): (string | null)[] {
  const { generator } = useCatGenerator();
  const [urls, setUrls] = useState<(string | null)[]>(() =>
    Array.from({ length: count }, () => null),
  );
  useEffect(() => {
    if (!generator?.generateRandomCat) return;
    // Bound call: the generator is a class instance and `generateRandomCat`
    // reads `this`.
    const generateRandomCat = (
      options: Parameters<NonNullable<typeof generator.generateRandomCat>>[0],
    ) => generator.generateRandomCat?.(options);
    let cancelled = false;
    const next: (string | null)[] = Array.from({ length: count }, () => null);
    const renderOne = async (i: number) => {
      try {
        const result = await generateRandomCat({
          exactLayerCounts: true,
          accessoryCount: i % 3 === 0 ? 1 : 0,
          scarCount: i % 5 === 0 ? 1 : 0,
          tortieCount: i % 4 === 0 ? 1 : 0,
        });
        if (!result) return;
        const canvas = result.canvas as HTMLCanvasElement;
        next[i] = "toDataURL" in canvas ? canvas.toDataURL("image/png") : null;
        if (!cancelled) setUrls([...next]);
      } catch (error) {
        console.warn("[batch-preview] mock cat failed", error);
      }
    };
    (async () => {
      // Six at a time, like the real show's reveal driver.
      for (let start = 0; start < count && !cancelled; start += 6) {
        await Promise.all(
          Array.from({ length: Math.min(6, count - start) }, (_, k) =>
            renderOne(start + k),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generator, count]);
  return urls;
}

/** The static frame the URL asks for. */
function staticFrame(
  state: PreviewState,
  beatParam: string | null,
  landedParam: number | null,
  verdictSeconds: number | null,
  shorthand: "depart" | "repack" | null,
  pool: number,
  maxEliminations: number,
  readyAt: number,
): MockFrame {
  const beat: BatchBeatKind =
    shorthand ??
    ((BEATS as readonly string[]).includes(beatParam ?? "")
      ? (beatParam as BatchBeatKind)
      : state === "loading"
        ? "loading"
        : state === "revealing"
          ? "deal"
          : state === "done"
            ? "done"
            : "awaiting");
  const defaultCulls = DEFAULT_CULLS.filter((n) => n <= pool).slice(
    0,
    maxEliminations,
  );
  const culled =
    beat === "done"
      ? Array.from({ length: maxEliminations }, (_, i) => pool - i)
      : beat === "repack"
        ? [...defaultCulls, PENDING_NUMBER]
        : defaultCulls;
  const verdict = beat === "verdict" || beat === "depart";
  return {
    stageIndex: beat === "done" ? MOCK_STAGES.length - 1 : MOCK_STAGE_INDEX,
    beat,
    landedCount:
      beat === "deal"
        ? (landedParam ?? (state === "revealing" ? "all" : 0))
        : "all",
    culled,
    pending: verdict ? PENDING_NUMBER : null,
    departing: beat === "depart" ? PENDING_NUMBER : null,
    verdictEndsAt:
      beat === "verdict" && readyAt > 0
        ? readyAt + (verdictSeconds ?? 3) * 1000
        : null,
    shifted: false,
  };
}

/** Local simulation on the pure timeline: six stages with a cull each until `pool − finalCount`. */
interface AutoSim {
  stageIndex: number;
  stageStartedAt: number;
  timeline: StageTimeline;
  culled: number[];
  pending: number | null;
  cullAt: number | null;
  done: boolean;
}

function survivorsOf(pool: number, culled: readonly number[]): number[] {
  const gone = new Set(culled);
  return Array.from({ length: pool }, (_, i) => i + 1).filter(
    (n) => !gone.has(n),
  );
}

function startStage(
  stageIndex: number,
  culled: number[],
  pool: number,
  now: number,
  reducedMotion: boolean,
): AutoSim {
  const stage = MOCK_STAGES[Math.min(stageIndex, MOCK_STAGES.length - 1)];
  return {
    stageIndex,
    stageStartedAt: now,
    timeline: buildStageBeats(mockInputs(survivorsOf(pool, culled)), stage, {
      reducedMotion,
    }),
    culled,
    pending: null,
    cullAt: null,
    done: false,
  };
}

function autoFrame(
  sim: AutoSim,
  now: number,
  pool: number,
  finalCount: number,
  reducedMotion: boolean,
): { frame: MockFrame; next: AutoSim } {
  const shifted = sim.stageIndex % 2 === 1;
  if (sim.done) {
    return {
      frame: {
        stageIndex: MOCK_STAGES.length - 1,
        beat: "done",
        landedCount: "all",
        culled: sim.culled,
        pending: null,
        departing: null,
        verdictEndsAt: null,
        shifted,
      },
      next: sim,
    };
  }
  const base = {
    stageIndex: sim.stageIndex,
    culled: sim.culled,
    pending: null,
    departing: null,
    verdictEndsAt: null,
    shifted,
  };
  const elapsed = now - sim.stageStartedAt;
  const { timeline } = sim;
  if (elapsed < timeline.totalMs) {
    return {
      frame: {
        ...base,
        beat: timelineBeatAt(timeline, elapsed),
        landedCount: landedAt(timeline, elapsed).length,
      },
      next: sim,
    };
  }
  const needsCull = pool - sim.culled.length > finalCount;
  const stagesLeft = sim.stageIndex < MOCK_STAGE_INDEX + AUTO_STAGES - 1;
  if (!needsCull) {
    const nextIndex = sim.stageIndex + 1;
    return {
      frame: { ...base, beat: "hold", landedCount: "all" },
      next: stagesLeft
        ? startStage(nextIndex, sim.culled, pool, now, reducedMotion)
        : { ...sim, done: true },
    };
  }
  const awaitingFrom = sim.stageStartedAt + timeline.totalMs;
  if (elapsed < timeline.totalMs + AUTO_AWAIT_MS) {
    return {
      frame: { ...base, beat: "awaiting", landedCount: "all" },
      next: sim,
    };
  }
  // Verdict: the pending cat is #16 while it is in, else the last changed survivor.
  const survivors = survivorsOf(pool, sim.culled);
  const pending =
    sim.pending ??
    (survivors.includes(PENDING_NUMBER)
      ? PENDING_NUMBER
      : (survivors
          .filter((n) => (n - 1) % 3 !== 0 && n !== 6 && n !== 12)
          .at(-1) ??
        survivors.at(-1) ??
        1));
  const verdictEndsAt = awaitingFrom + AUTO_AWAIT_MS + AUTO_VERDICT_MS;
  if (now < verdictEndsAt) {
    return {
      frame: {
        ...base,
        beat: "verdict",
        landedCount: "all",
        pending,
        verdictEndsAt,
      },
      next: { ...sim, pending },
    };
  }
  const cullAt = sim.cullAt ?? verdictEndsAt;
  const departMs = reducedMotion ? 200 : AUTO_DEPART_MS;
  const repackMs = reducedMotion ? 0 : AUTO_REPACK_MS;
  const culled = sim.culled.includes(pending)
    ? sim.culled
    : [...sim.culled, pending];
  if (now - cullAt < departMs) {
    return {
      frame: {
        ...base,
        beat: "depart",
        landedCount: "all",
        culled,
        pending,
        departing: pending,
      },
      next: { ...sim, pending, cullAt, culled },
    };
  }
  if (now - cullAt < departMs + repackMs) {
    return {
      frame: { ...base, beat: "repack", landedCount: "all", culled },
      next: { ...sim, pending, cullAt, culled },
    };
  }
  return {
    frame: { ...base, beat: "repack", landedCount: "all", culled },
    next: stagesLeft
      ? startStage(sim.stageIndex + 1, culled, pool, now, reducedMotion)
      : { ...sim, culled, done: true },
  };
}

function useAutoFrame(
  enabled: boolean,
  pool: number,
  finalCount: number,
  reducedMotion: boolean,
): MockFrame | null {
  const [frame, setFrame] = useState<MockFrame | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let sim = startStage(MOCK_STAGE_INDEX, [], pool, Date.now(), reducedMotion);
    const tick = () => {
      const result = autoFrame(
        sim,
        Date.now(),
        pool,
        finalCount,
        reducedMotion,
      );
      sim = result.next;
      setFrame(result.frame);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [enabled, pool, finalCount, reducedMotion]);
  return enabled ? frame : null;
}

function href(theme: string, state: string, count: number, scale: number) {
  return `?theme=${theme}&state=${state}&count=${count.toString()}&scale=${scale.toString()}`;
}

function intParam(value: string | null): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function BatchPreviewClient() {
  const params = useSearchParams();
  const themeParam = params.get("theme");
  const theme: BatchThemeId = isBatchThemeId(themeParam)
    ? themeParam
    : "simple";
  const stateParam = params.get("state");
  const state: PreviewState = (STATES as readonly string[]).includes(
    stateParam ?? "",
  )
    ? (stateParam as PreviewState)
    : "awaiting";
  const count = Math.min(40, Math.max(10, Number(params.get("count") ?? "25")));
  const scale = Number(params.get("scale") ?? "0.6");
  const beatParam = params.get("beat");
  const landedParam = intParam(params.get("landed"));
  const verdictSeconds = intParam(params.get("verdict"));
  const shorthand =
    params.get("depart") === "1"
      ? "depart"
      : params.get("repack") === "1"
        ? "repack"
        : null;
  const reducedMotion = params.get("rm") === "1";
  const auto = params.get("auto") === "1";
  const chrome = params.get("chrome") !== "0";
  const finalCount = 10;
  const urls = useMockSprites(count);
  // Read after mount so server and client markup match (no QR until then).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  // The verdict clock starts once every mock sprite is rendered, so a
  // capture that waits for `data-batch-preview-ready` sees the countdown.
  const ready = urls.every(Boolean);
  const [readyAt, setReadyAt] = useState(0);
  useEffect(() => {
    if (ready) setReadyAt(Date.now());
  }, [ready]);
  const autoFrameState = useAutoFrame(auto, count, finalCount, reducedMotion);
  const frame = useMemo(
    () =>
      autoFrameState ??
      staticFrame(
        state,
        beatParam,
        landedParam,
        verdictSeconds,
        shorthand,
        count,
        Math.max(0, count - finalCount),
        readyAt,
      ),
    [
      autoFrameState,
      state,
      beatParam,
      landedParam,
      verdictSeconds,
      shorthand,
      count,
      readyAt,
    ],
  );
  const view = useMemo(
    () => buildView(frame, urls, finalCount, origin, reducedMotion),
    [frame, urls, origin, reducedMotion],
  );
  const Scene = BATCH_SCENES[theme];
  const vars = themeTokensToCssVars(OVERLAY_THEME_META.plate.tokens);

  return (
    <div className="min-h-screen bg-neutral-900 p-4 font-mono text-xs text-white">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {BATCH_THEME_IDS.map((id) => (
          <a
            key={id}
            href={href(id, state, count, scale)}
            className={`rounded border px-2 py-1 ${id === theme ? "border-amber-400 text-amber-300" : "border-neutral-700"}`}
          >
            {id}
          </a>
        ))}
        <span className="mx-2 opacity-40">|</span>
        {STATES.map((s) => (
          <a
            key={s}
            href={href(theme, s, count, scale)}
            className={`rounded border px-2 py-1 ${s === state ? "border-amber-400 text-amber-300" : "border-neutral-700"}`}
          >
            {s}
          </a>
        ))}
        <span className="mx-2 opacity-40">|</span>
        {BEATS.map((b) => (
          <a
            key={b}
            href={`${href(theme, state, count, scale)}&beat=${b}`}
            className={`rounded border px-2 py-1 ${b === frame.beat ? "border-amber-400 text-amber-300" : "border-neutral-700"}`}
          >
            {b}
          </a>
        ))}
        <span className="mx-2 opacity-40">|</span>
        {[21, 25, 30].map((n) => (
          <a
            key={n}
            href={href(theme, state, n, scale)}
            className={`rounded border px-2 py-1 ${n === count ? "border-amber-400 text-amber-300" : "border-neutral-700"}`}
          >
            {n} cats
          </a>
        ))}
        <span className="ml-4 opacity-60">
          rendered {urls.filter(Boolean).length}/{count} · beat {frame.beat}
        </span>
      </div>
      <div
        data-batch-preview-ready={ready ? "1" : "0"}
        style={{
          width: 1280 * scale,
          height: 1080 * scale,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            ...vars,
            position: "absolute",
            left: 0,
            top: 0,
            width: 1280,
            height: 1080,
            transform: `scale(${scale.toString()})`,
            transformOrigin: "top left",
          }}
        >
          {chrome ? (
            <BatchShowFrame view={view} theme={theme} />
          ) : (
            <div
              data-batch-theme={theme}
              data-batch-phase={view.phase}
              data-batch-beat={view.beat.kind}
              data-reduced-motion={reducedMotion ? "1" : "0"}
              style={{ position: "relative", width: 1280, height: 1080 }}
            >
              <Scene view={view} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
