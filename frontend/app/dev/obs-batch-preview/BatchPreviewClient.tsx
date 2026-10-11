"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCatGenerator } from "@/components/cat-builder/hooks";
import { BATCH_SCENES } from "@/components/stream-control/obs/scenes/batch/batchRegistry";
import {
  type BatchScenePhase,
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

const STAGE_LABELS = [
  "Colour",
  "Pelt",
  "Eyes",
  "Eye Colour 2",
  "Tint",
  "Skin",
  "White Patches",
  "Points",
  "Patches Tint",
  "Vitiligo",
  "Accessory 1",
  "Scar 1",
  "Shading",
  "Reverse",
  "Pose",
];

function mockStages(): BatchStage[] {
  return STAGE_LABELS.map((label, i) => ({
    id: `s${i.toString()}`,
    label,
    type: "simple",
    param: label.toLowerCase(),
  }));
}

function phaseFor(state: PreviewState): BatchScenePhase {
  if (state === "awaiting") return "awaitingCull";
  return state;
}

/** The round-2 mock scenario: 7 culled, 16 marked, 03+23 potential, 06+12 favourites, 06 spotlighted. */
function buildView(
  state: PreviewState,
  urls: readonly (string | null)[],
  finalCount: number,
  origin: string,
): BatchShowView {
  const stages = mockStages();
  const pool = urls.length;
  const maxEliminations = Math.max(0, pool - finalCount);
  const phase = phaseFor(state);
  const culledNumbers =
    state === "done"
      ? Array.from({ length: maxEliminations }, (_, i) => pool - i)
      : [8, 9, 15, 17, 19, 24, 14]
          .filter((n) => n <= pool)
          .slice(0, maxEliminations);
  const culled = new Set(culledNumbers);
  const awaiting = phase === "awaitingCull";
  const cats: BatchViewCat[] = urls.map((url, i) => {
    const number = i + 1;
    return {
      id: `mock-${number.toString()}`,
      number,
      numberLabel: formatBatchNumber(number),
      label: `Cat ${number.toString()}`,
      previewUrl: state === "loading" ? null : url,
      params: MOCK_PARAMS,
      marked: awaiting && number === 16,
      potential: awaiting && (number === 3 || number === 23),
      favorite: number === 6 || number === 12,
      spotlight: state !== "done" && number === 6,
      eliminated: culled.has(number),
      fading: false,
    };
  });
  const survivors = cats.filter((cat) => !cat.eliminated);
  const eliminated = culledNumbers
    .map((n) => cats[n - 1])
    .filter((cat): cat is BatchViewCat => Boolean(cat));
  const stageIndex = state === "done" ? stages.length - 1 : 6;
  const spotlight = cats.find((cat) => cat.spotlight) ?? null;
  const qrUrl = state === "done" ? `${origin}/adoption/mock-litter` : null;
  return {
    title: "Stream Litter",
    phase,
    stages,
    stageIndex,
    stageNumber: stageIndex + 1,
    stageLabel: stages[stageIndex]?.label ?? "",
    cats,
    survivors,
    eliminated,
    poolSize: pool,
    remaining: survivors.length,
    finalCount,
    maxEliminations,
    cullNumber: eliminated.length + 1,
    spotlight,
    qrUrl,
    statusLabel: batchStatusLabel(phase, true, stages[stageIndex]?.label ?? ""),
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

function href(theme: string, state: string, count: number, scale: number) {
  return `?theme=${theme}&state=${state}&count=${count.toString()}&scale=${scale.toString()}`;
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
  const urls = useMockSprites(count);
  // Read after mount so server and client markup match (no QR until then).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const view = useMemo(
    () => buildView(state, urls, 10, origin),
    [state, urls, origin],
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
          rendered {urls.filter(Boolean).length}/{count}
        </span>
      </div>
      <div
        data-batch-preview-ready={urls.every(Boolean) ? "1" : "0"}
        style={{
          width: 1280 * scale,
          height: 1080 * scale,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          data-batch-theme={theme}
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
          <Scene view={view} />
        </div>
      </div>
    </div>
  );
}
