"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AllegiancesBatch } from "@/components/stream-control/obs/looks/allegiances/AllegiancesBatch";
import {
  type BatchBeatKind,
  type BatchBoardModel,
  type BatchPhase,
  buildBatchBoardModel,
} from "@/components/stream-control/obs/looks/batchModel";
import { useLineageCeremony } from "@/components/stream-control/obs/looks/ceremony";
import { ContactBatch } from "@/components/stream-control/obs/looks/contact/ContactBatch";
import { HandheldBatch } from "@/components/stream-control/obs/looks/handheld/HandheldBatch";
import {
  type BatchBoardProps,
  LOOK_ERUPTS_IN_MATERIAL,
} from "@/components/stream-control/obs/looks/LookBoardProps";
import { buildLineageModel } from "@/components/stream-control/obs/looks/lineageModel";
import {
  isShowLookId,
  SHOW_LOOK_IDS,
  type ShowLookId,
} from "@/components/stream-control/obs/looks/lookMeta";
import { SHOW_LOOKS } from "@/components/stream-control/obs/looks/registry";
import { TrenchBatch } from "@/components/stream-control/obs/looks/strata/TrenchBatch";
import { EvolutionShowFrame } from "@/components/stream-control/obs/scenes/EvolutionScene";
import type { BatchStreamCat } from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";
import type {
  EvolutionAddition,
  EvolutionArchetype,
  EvolutionCatData,
} from "@/lib/evolution/evolutionGenerator";
import {
  buildCeremonySchedule,
  rollLandMs,
  scheduleCatsFromCommand,
} from "@/lib/evolution/rollSchedule";
import type {
  EvolutionLiveState,
  EvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";

type Scene = "evolution" | "ceremony" | "batch";

/**
 * Batch boards that live in the looks folder (the rest of the batch looks
 * are full scenes under obs/scenes/batch with their own harness,
 * /dev/obs-batch-preview). Keyed by the evolution look they pair with.
 */
const BATCH_BOARDS: Partial<
  Record<ShowLookId, React.ComponentType<BatchBoardProps>>
> = {
  allegiances: AllegiancesBatch,
  handheld: HandheldBatch,
  strata: TrenchBatch,
  contact: ContactBatch,
};

function resolveScene(value: string | null): Scene {
  if (value === "batch" || value === "ceremony") return value;
  return "evolution";
}

const ARCHETYPES: EvolutionArchetype[] = [
  "leaf",
  "flare",
  "rose",
  "aqua",
  "volt",
  "moon",
];
const BRANCH_NAMES = ["Moss", "Ember", "Petal", "Ripple", "Storm", "Silver"];
const RANK_SUFFIX = ["kit", "paw", "heart", "star"];
const KIT_NAMES = [
  "Bright",
  "Dove",
  "Thorn",
  "Soot",
  "Fern",
  "Pebble",
  "Holly",
  "Rowan",
  "Mist",
  "Sparrow",
  "Lark",
  "Cinder",
  "Owl",
  "Heather",
  "Sage",
  "Finch",
  "Hazel",
  "Jay",
  "Brook",
  "Ivy",
  "Tansy",
  "Ash",
  "Bramble",
  "Cloud",
  "Dusk",
  "Echo",
  "Frost",
  "Gorse",
  "Honey",
  "Juniper",
];
const COLOURS = [
  "SILVER",
  "GINGER",
  "BLACK",
  "CREAM",
  "BROWN",
  "WHITE",
  "GREY",
];
const PELTS = ["Tabby", "single", "Classic", "Speckled", "Smoke", "Rosette"];
const EYES = ["GREEN", "AMBER", "BLUE", "YELLOW", "COPPER", "HAZEL"];
const SHEETS = [
  "colours_tabby.png",
  "colours_single.png",
  "colours_classic.png",
  "colours_speckled.png",
  "colours_mackerel.png",
  "colours_rosette.png",
];
const WHITES = [
  null,
  "patches_white_little.png",
  "patches_white_mid.png",
  "patches_white_high.png",
];
const POSES = ["adult_short0", "adult_short1", "adult_short2", "adult_long1"];
const KIT_POSES = ["kitten0", "kitten1", "kitten2"];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function mockParams(seed: number): CatParams {
  const r = rng(seed);
  return {
    spriteNumber: 0,
    peltName: PELTS[Math.floor(r() * PELTS.length)],
    colour: COLOURS[Math.floor(r() * COLOURS.length)],
    isTortie: r() < 0.25,
    eyeColour: EYES[Math.floor(r() * EYES.length)],
    skinColour: "PINK",
    whitePatches: r() < 0.5 ? "LITTLE" : undefined,
    accessory: r() < 0.3 ? "RED_COLLAR" : undefined,
    shading: false,
    reverse: false,
  };
}

/** Composite a random ClanGen cat from the public sprite sheets. */
async function composeCat(seed: number, kit: boolean): Promise<string> {
  const r = rng(seed * 7919 + 13);
  const poseData = (await fetch("/sprite-data/poseData.json").then((res) =>
    res.json(),
  )) as { poseNameToOffset: Record<string, { x: number; y: number }> };
  const poses = kit ? KIT_POSES : POSES;
  const pose = poses[Math.floor(r() * poses.length)];
  const off = poseData.poseNameToOffset[pose] ?? { x: 2, y: 4 };
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  const sheet = SHEETS[Math.floor(r() * SHEETS.length)];
  const white = WHITES[Math.floor(r() * WHITES.length)];
  const [colour, patches, eyes, lineart] = await Promise.all([
    load(`/sprites/${sheet}`),
    white ? load(`/sprites/${white}`) : Promise.resolve(null),
    load("/sprites/eyes.png"),
    load("/sprites/lineart.png"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 50;
  canvas.height = 50;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const draw = (img: HTMLImageElement, bx: number, by: number) =>
    ctx.drawImage(
      img,
      bx * 150 + off.x * 50,
      by * 450 + off.y * 50,
      50,
      50,
      0,
      0,
      50,
      50,
    );
  draw(colour, Math.floor(r() * 7), Math.floor(r() * 3));
  if (patches) draw(patches, Math.floor(r() * 14), Math.floor(r() * 2));
  draw(eyes, Math.floor(r() * 12), Math.floor(r() * 3));
  draw(lineart, 0, 0);
  return canvas.toDataURL("image/png");
}

function useMockSprites(count: number, kit: boolean): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(Array.from({ length: count }, (_, i) => composeCat(i + 1, kit)))
      .then((result) => {
        if (!cancelled) setUrls(result);
      })
      .catch((error) => console.error("[look-preview] sprites failed", error));
    return () => {
      cancelled = true;
    };
  }, [count, kit]);
  return urls;
}

function addition(seed: number): EvolutionAddition {
  const r = rng(seed);
  const pick = r();
  if (pick < 0.4) {
    return {
      kind: "accessory",
      traitId: "accessories",
      label: "Accessory",
      value: ["LAVENDER", "RED_COLLAR", "MONARCH", "VIOLET_CROWN"][
        Math.floor(r() * 4)
      ],
      traitValue: "",
    };
  }
  if (pick < 0.7) {
    return {
      kind: "scar",
      traitId: "scars",
      label: "Scar",
      value: ["NICKED_EAR", "BRIDGE", "LEFTEAR"][Math.floor(r() * 3)],
      traitValue: "",
    };
  }
  return {
    kind: "tortie",
    traitId: "tortie",
    label: "Tortie",
    value: { mask: "ONE", pattern: "Rosette", colour: "GINGER" },
    traitValue: { mask: "ONE", pattern: "Rosette", colour: "GINGER" },
    parts: [],
  };
}

function mockEvolutionCommand(
  branches: number,
  levels: number,
  adds: number,
): EvolutionStreamCommand {
  const cats: EvolutionStreamCommand["cats"] = [
    {
      key: "starter",
      label: "Ashfern",
      level: 0,
      branchLabel: null,
      archetype: null,
      additions: [],
      catData: { params: mockParams(1) } as unknown as EvolutionCatData,
    },
  ];
  for (let b = 0; b < branches; b++) {
    const archetype = ARCHETYPES[b % ARCHETYPES.length];
    const branchLabel = archetype.charAt(0).toUpperCase() + archetype.slice(1);
    for (let level = 1; level <= levels; level++) {
      cats.push({
        key: `b${b.toString()}-l${level.toString()}`,
        label: `${BRANCH_NAMES[b % BRANCH_NAMES.length]}${RANK_SUFFIX[Math.min(level, 3)]}`,
        level,
        branchLabel,
        archetype,
        additions: Array.from({ length: adds }, (_, k) =>
          addition(b * 10 + level + k * 100),
        ),
        catData: {
          params: mockParams(100 + b * 10 + level),
        } as unknown as EvolutionCatData,
      });
    }
  }
  return {
    slug: "ashfern-preview",
    totalCount: cats.length,
    cats,
  };
}

function mockPool(count: number): BatchStreamCat[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `kit-${i.toString()}`,
    label: `${KIT_NAMES[i % KIT_NAMES.length]}kit`,
    catData: {
      params: mockParams(500 + i),
      accessorySlots: [],
      scarSlots: [],
      tortieSlots: [],
      counts: { accessories: 0, scars: 0, tortie: 0 },
    },
  }));
}

const STAGES = ["Pelt", "Eyes", "White", "Tortie", "Accessory", "Scar"].map(
  (label) => ({ id: label.toLowerCase(), label }),
);
/** Value words a changed kit shows per stage (cycled). */
const STAGE_VALUES: Record<string, string[]> = {
  pelt: ["Tabby", "Marbled", "Speckled"],
  eyes: ["Amber", "Copper", "Blue"],
  white: ["Little", "Tuxedo", "Mask"],
  tortie: ["Ginger", "Cream"],
  accessory: ["Maple Leaf", "Holly", "Red Collar"],
  scar: ["Nicked Ear", "Bridge"],
};

const BEAT_KINDS: readonly BatchBeatKind[] = [
  "loading",
  "windup",
  "deal",
  "hold",
  "awaiting",
  "verdict",
  "depart",
  "repack",
  "done",
];

function resolveBeat(value: string | null): BatchBeatKind | null {
  return BEAT_KINDS.find((kind) => kind === value) ?? null;
}

interface BatchSim {
  phase: BatchPhase;
  stageIndex: number;
  eliminatedIds: string[];
  fadingId: string | null;
  markedId: string | null;
  potentialIds: string[];
  spotlightId: string | null;
  beat: BatchBeatKind;
  landedIds: string[];
  changedIds: string[];
  valueLabels: Record<string, string | null>;
  pendingCullId: string | null;
  verdictAt: number | null;
}

const SIM_IDLE: BatchSim = {
  phase: "revealing",
  stageIndex: 0,
  eliminatedIds: [],
  fadingId: null,
  markedId: null,
  potentialIds: [],
  spotlightId: null,
  beat: "windup",
  landedIds: [],
  changedIds: [],
  valueLabels: {},
  pendingCullId: null,
  verdictAt: null,
};

/** Every other surviving kit changes on a stage; the rest deal first. */
function stageChanges(
  alive: BatchStreamCat[],
  stageId: string,
): { changedIds: string[]; valueLabels: Record<string, string | null> } {
  const words = STAGE_VALUES[stageId] ?? ["Changed"];
  const changedIds: string[] = [];
  const valueLabels: Record<string, string | null> = {};
  alive.forEach((cat, i) => {
    if (i % 2 === 0) {
      changedIds.push(cat.id);
      valueLabels[cat.id] = words[i % words.length];
    } else {
      valueLabels[cat.id] = null;
    }
  });
  return { changedIds, valueLabels };
}

/**
 * Drives a fake elimination show on a timer through the real beats: windup
 * → deal (landed ids 120 ms apart, unchanged first) → hold → awaiting (a
 * marked + a potential kit) → verdict (3 s) → depart → repack; once enough
 * kits left the stages roll on to the finale. A spotlight pops up on every
 * third stage.
 */
function useBatchSimulation(
  enabled: boolean,
  cats: BatchStreamCat[],
  finalCount: number,
): BatchSim {
  const [sim, setSim] = useState<BatchSim>(SIM_IDLE);
  useEffect(() => {
    if (!enabled) return;
    const culls = Math.max(0, cats.length - finalCount);
    let cancelled = false;
    let state: BatchSim = SIM_IDLE;
    const push = (next: Partial<BatchSim>) => {
      state = { ...state, ...next };
      if (!cancelled) setSim(state);
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    (async () => {
      while (!cancelled && state.stageIndex < STAGES.length) {
        const alive = cats.filter((c) => !state.eliminatedIds.includes(c.id));
        const { changedIds, valueLabels } = stageChanges(
          alive,
          STAGES[state.stageIndex].id,
        );
        push({
          phase: "revealing",
          beat: "windup",
          landedIds: [],
          changedIds,
          valueLabels,
          markedId: null,
          potentialIds: [],
          pendingCullId: null,
          verdictAt: null,
          fadingId: null,
        });
        await wait(600);
        if (cancelled) return;
        const order = [
          ...alive.filter((c) => !changedIds.includes(c.id)),
          ...alive.filter((c) => changedIds.includes(c.id)),
        ].map((c) => c.id);
        push({ beat: "deal" });
        for (const id of order) {
          push({ landedIds: [...state.landedIds, id] });
          await wait(120);
          if (cancelled) return;
        }
        push({ beat: "hold" });
        await wait(900);
        if (cancelled) return;
        push({
          spotlightId:
            state.stageIndex % 3 === 1 ? (alive[2]?.id ?? null) : null,
        });
        if (state.eliminatedIds.length < culls) {
          const victim = alive[alive.length - 1 - (state.stageIndex % 3)];
          push({
            phase: "awaitingCull",
            beat: "awaiting",
            markedId: victim?.id ?? null,
            potentialIds: [alive[1]?.id ?? ""],
          });
          await wait(1500);
          if (cancelled || !victim) return;
          push({
            beat: "verdict",
            pendingCullId: victim.id,
            verdictAt: Date.now() + 3000,
          });
          await wait(3000);
          if (cancelled) return;
          push({
            phase: "revealing",
            beat: "depart",
            eliminatedIds: [...state.eliminatedIds, victim.id],
            fadingId: victim.id,
            markedId: null,
            potentialIds: [],
            verdictAt: null,
          });
          await wait(1600);
          if (cancelled) return;
          push({ beat: "repack", fadingId: null, pendingCullId: null });
          await wait(400);
          if (cancelled) return;
        } else {
          await wait(800);
        }
        push({ stageIndex: state.stageIndex + 1 });
      }
      push({ phase: "done", beat: "done", spotlightId: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, cats, finalCount]);
  return sim;
}

function resolvePhase(value: string | null): BatchPhase {
  if (value === "revealing" || value === "awaitingCull" || value === "loading")
    return value;
  return "done";
}

const PREVIEW_URL = "https://beastyrabbit.com/evolution/ashfern-preview";
const LITTER_URL = "https://beastyrabbit.com/adoption/preview-litter";

interface HarnessParams {
  look: ShowLookId;
  scene: Scene;
  branches: number;
  levels: number;
  pool: number;
  finalCount: number;
  phase: BatchPhase;
  spot: boolean;
  scale: number;
  /** still=1 freezes every animation at its end state (for screenshots). */
  still: boolean;
  /** auto=1 runs a fake batch show: windup, deal, hold, wait, verdict, cull … until done. */
  auto: boolean;
  /** charge=<ms> sets the ceremony's spin length (default 5s). */
  chargeMs: number;
  /** t=<ms> freezes the ceremony clock at an elapsed ms. */
  clockMs: number | null;
  /** hold=1 marks the ceremony held (liveState.holdStartedAt). */
  hold: boolean;
  /** offset=<ms> → liveState.offsetMs. */
  offsetMs: number;
  /** skip=1 → the streamer skipped to the board. */
  skip: boolean;
  /** rm=1 forces the reduced-motion path. */
  reducedMotion: boolean;
  /** adds=<n> additions per mock cat (0 exercises the no-roll reveal). */
  adds: number;
  /** Static batch boards: beat kind, landed count, verdict seconds. */
  beat: BatchBeatKind | null;
  landed: number | null;
  verdictSeconds: number | null;
}

function useHarnessParams(): HarnessParams {
  const params = useSearchParams();
  const lookParam = params.get("look");
  const number = (key: string, fallback: string) =>
    Number(params.get(key) ?? fallback);
  const optional = (key: string) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    look: isShowLookId(lookParam) ? lookParam : "allegiances",
    scene: resolveScene(params.get("scene")),
    branches: number("branches", "3"),
    levels: number("levels", "2"),
    pool: number("pool", "16"),
    finalCount: number("final", "10"),
    phase: resolvePhase(params.get("phase")),
    spot: params.get("spot") === "1",
    scale: number("scale", "0.6"),
    still: params.get("still") === "1",
    auto: params.get("auto") === "1",
    chargeMs: number("charge", "5000"),
    clockMs: optional("t"),
    hold: params.get("hold") === "1",
    offsetMs: number("offset", "0"),
    skip: params.get("skip") === "1",
    reducedMotion: params.get("rm") === "1",
    adds: Math.max(0, Math.floor(number("adds", "1"))),
    beat: resolveBeat(params.get("beat")),
    landed: optional("landed"),
    verdictSeconds: optional("verdict"),
  };
}

type Sprites = readonly (string | null)[];

function previewsFor(
  cats: BatchStreamCat[],
  urlFor: (index: number) => string | null,
): Record<string, { url: string } | undefined> {
  return Object.fromEntries(
    cats.map((cat, i) => {
      const url = urlFor(i);
      return [cat.id, url ? { url } : undefined];
    }),
  );
}

/** The board model while the simulated show runs. */
function simulatedBoard(
  poolCats: BatchStreamCat[],
  sprites: Sprites,
  finalCount: number,
  sim: BatchSim,
): BatchBoardModel {
  // Alternate the sprite set per stage so every reveal visibly changes.
  const shifted = (i: number) =>
    sim.stageIndex % 2 ? i : (i + 1) % Math.max(1, sprites.length);
  return buildBatchBoardModel({
    title: "Adoption Elimination",
    cats: poolCats,
    finalCount,
    saved: sim.phase === "done",
    stages: STAGES,
    phase: sim.phase,
    stageIndex: sim.stageIndex,
    previews: previewsFor(poolCats, (i) =>
      sprites[i] ? (sprites[shifted(i)] ?? null) : null,
    ),
    eliminatedIds: sim.eliminatedIds,
    fadingId: sim.fadingId,
    markedId: sim.markedId,
    potentialIds: sim.potentialIds,
    favoriteIds: [poolCats[4]?.id ?? ""],
    spotlightId: sim.spotlightId,
    qrUrl: sim.phase === "done" ? LITTER_URL : null,
    beat: sim.beat,
    landedIds: sim.landedIds,
    changedIds: sim.changedIds,
    valueLabels: sim.valueLabels,
    pendingCullId: sim.pendingCullId,
    verdictAt: sim.verdictAt,
  });
}

/** A frozen board for one phase: every odd kit up to the cull count has left. */
function staticBoard(
  poolCats: BatchStreamCat[],
  sprites: Sprites,
  p: HarnessParams,
  verdictAt: number | null,
): BatchBoardModel {
  const { finalCount, phase, spot } = p;
  const culls = Math.max(0, poolCats.length - finalCount);
  const stageIndex =
    phase === "done" ? STAGES.length : Math.min(culls, STAGES.length - 1) - 1;
  const eliminatedCount =
    phase === "done" ? culls : Math.max(0, Math.min(culls, stageIndex));
  const eliminatedIds = poolCats
    .filter((_, i) => i % 2 === 1)
    .slice(0, eliminatedCount)
    .map((cat) => cat.id);
  const alive = poolCats.filter((cat) => !eliminatedIds.includes(cat.id));
  const culling = phase === "awaitingCull";
  const stage = STAGES[Math.max(0, Math.min(stageIndex, STAGES.length - 1))];
  const { changedIds, valueLabels } = stageChanges(alive, stage.id);
  const order = [
    ...alive.filter((c) => !changedIds.includes(c.id)),
    ...alive.filter((c) => changedIds.includes(c.id)),
  ].map((c) => c.id);
  const markedId = culling ? (alive[3]?.id ?? null) : null;
  const beat = p.beat ?? (p.verdictSeconds !== null ? "verdict" : undefined);
  return buildBatchBoardModel({
    title: "Adoption Elimination",
    cats: poolCats,
    finalCount,
    saved: phase === "done",
    stages: STAGES,
    phase,
    stageIndex: Math.max(0, stageIndex),
    previews: previewsFor(poolCats, (i) => sprites[i] ?? null),
    eliminatedIds,
    fadingId: null,
    markedId,
    potentialIds: culling ? [alive[1]?.id ?? ""] : [],
    favoriteIds: [alive[4]?.id ?? ""],
    spotlightId: spot ? (alive[4]?.id ?? null) : null,
    qrUrl: phase === "done" ? LITTER_URL : null,
    ...(beat ? { beat } : {}),
    changedIds,
    valueLabels,
    landedIds: p.landed === null ? order : order.slice(0, p.landed),
    ...(verdictAt !== null
      ? { pendingCullId: markedId ?? alive[3]?.id ?? null, verdictAt }
      : {}),
  });
}

function BatchBoardFor({
  look,
  model,
}: Readonly<{ look: ShowLookId; model: BatchBoardModel }>) {
  const Batch = BATCH_BOARDS[look];
  if (!Batch) {
    return (
      <p className="p-8 font-mono text-sm text-white/70">
        {look} has no batch board here; its batch look is a full scene under
        /dev/obs-batch-preview.
      </p>
    );
  }
  return <Batch model={model} />;
}

function Toolbar({
  params: p,
  href,
}: Readonly<{
  params: HarnessParams;
  href: (overrides: Record<string, string>) => string;
}>) {
  const link = (key: string, value: string, active: boolean) => (
    <a
      key={value}
      href={href({ [key]: value })}
      className={active ? "underline" : "opacity-60"}
    >
      {value}
    </a>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-xs">
      <span className="opacity-60">look:</span>
      {SHOW_LOOK_IDS.map((id) => link("look", id, id === p.look))}
      <span className="ml-4 opacity-60">scene:</span>
      {(["evolution", "ceremony", "batch"] as const).map((s) =>
        link("scene", s, s === p.scene),
      )}
      {p.scene === "batch" ? (
        <>
          <span className="ml-4 opacity-60">phase:</span>
          {(["revealing", "awaitingCull", "done"] as const).map((phase) =>
            link("phase", phase, phase === p.phase),
          )}
          <a
            href={href({ spot: p.spot ? "0" : "1" })}
            className="ml-4 opacity-60"
          >
            spotlight: {p.spot ? "on" : "off"}
          </a>
          <span className="ml-4 opacity-60">pool={p.pool}</span>
        </>
      ) : (
        <span className="ml-4 opacity-60">
          branches={p.branches} levels={p.levels} adds={p.adds}
          {p.clockMs !== null ? ` t=${p.clockMs.toString()}` : ""}
          {p.hold ? " held" : ""}
          {p.reducedMotion ? " rm" : ""}
        </span>
      )}
    </div>
  );
}

export function LookPreviewClient() {
  const searchParams = useSearchParams();
  const p = useHarnessParams();
  const { look, scene, phase } = p;
  const evolutionCommand = useMemo(
    () => mockEvolutionCommand(p.branches, p.levels, p.adds),
    [p.branches, p.levels, p.adds],
  );
  const poolCats = useMemo(() => mockPool(p.pool), [p.pool]);
  const spriteCount = scene === "batch" ? p.pool : evolutionCommand.cats.length;
  const sprites = useMockSprites(
    spriteCount,
    scene === "batch" && phase !== "done",
  );
  const sim = useBatchSimulation(p.auto, poolCats, p.finalCount);

  // The ceremony clock runs from mount; `t=` freezes it, `hold=1` holds it.
  const [mountTime] = useState(() => Date.now());
  const liveState: EvolutionLiveState | null = useMemo(
    () =>
      p.hold || p.offsetMs || p.skip
        ? {
            seq: 1,
            offsetMs: p.offsetMs,
            ...(p.hold ? { holdStartedAt: mountTime + 1 } : {}),
            ...(p.skip ? { skipToBoard: true } : {}),
          }
        : null,
    [p.hold, p.offsetMs, p.skip, mountTime],
  );
  const [finished, setFinished] = useState(p.skip);
  const finish = useCallback(() => setFinished(true), []);
  const ceremonyRunning = scene === "ceremony" && !finished;

  // Roll frames without a renderer: 12 random composites + a landed one.
  const landedRef = useRef(new Map<string, string>());
  const [, bumpLanded] = useState(0);
  const requestRollFrames = useCallback(
    async (catIndex: number, addition: number, seed: number) => {
      const candidates = await Promise.all(
        Array.from({ length: 12 }, (_, k) => composeCat(seed + k, false)),
      );
      const landed = await composeCat(seed + 99, false);
      const key = `${evolutionCommand.cats[catIndex]?.key ?? catIndex.toString()}:${addition.toString()}`;
      landedRef.current.set(key, landed);
      bumpLanded((v) => v + 1);
      return { candidates, landed };
    },
    [evolutionCommand],
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const reveal = useLineageCeremony({
    cats: evolutionCommand.cats.map((cat, i) => ({
      key: cat.key,
      label: cat.label,
      level: cat.level,
      branchLabel: cat.branchLabel,
      archetype: cat.archetype,
      previewUrl: sprites[i] ?? null,
      additions: cat.additions,
    })),
    totalCount: evolutionCommand.totalCount,
    chargeDurationMs: p.chargeMs,
    startedAt: mountTime,
    seq: 1,
    liveState,
    requestRollFrames,
    onFinish: finish,
    confetti: !LOOK_ERUPTS_IN_MATERIAL.has(look),
    containerRef: rootRef,
    enabled: ceremonyRunning,
    clockOverrideMs: scene === "ceremony" ? p.clockMs : null,
    reducedMotionOverride: p.reducedMotion ? true : undefined,
  });

  // Verification hooks: the schedule, the current roll's land ms and the
  // landed frame the active sprite must never show before it.
  const schedule = useMemo(
    () =>
      buildCeremonySchedule(
        scheduleCatsFromCommand(evolutionCommand),
        evolutionCommand.totalCount,
        p.chargeMs,
      ),
    [evolutionCommand, p.chargeMs],
  );
  const activeIndex =
    "index" in reveal.step
      ? reveal.step.index
      : reveal.step.kind === "summon"
        ? 0
        : -1;
  const landMs =
    reveal.roll && activeIndex >= 0
      ? rollLandMs(schedule, activeIndex, reveal.roll.index)
      : null;
  const landedSrc =
    reveal.roll && reveal.activeKey
      ? (landedRef.current.get(
          `${reveal.activeKey}:${reveal.roll.index.toString()}`,
        ) ?? null)
      : null;

  let board: React.ReactNode;
  if (scene === "batch") {
    const model = p.auto
      ? simulatedBoard(poolCats, sprites, p.finalCount, sim)
      : staticBoard(
          poolCats,
          sprites,
          p,
          p.verdictSeconds !== null
            ? mountTime + p.verdictSeconds * 1000
            : null,
        );
    board = <BatchBoardFor look={look} model={model} />;
  } else {
    const Look = SHOW_LOOKS[look];
    const model = buildLineageModel(
      evolutionCommand,
      evolutionCommand.cats.map((cat, i) => ({
        key: cat.key,
        previewUrl: sprites[i] ?? null,
      })),
      PREVIEW_URL,
    );
    board = (
      <EvolutionShowFrame
        look={look}
        reveal={reveal}
        cats={evolutionCommand.cats}
        totalCount={evolutionCommand.totalCount}
        rootRef={rootRef}
      >
        <Look.Lineage model={model} reveal={reveal} />
      </EvolutionShowFrame>
    );
  }

  const href = (overrides: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) next.set(key, value);
    return `?${next.toString()}`;
  };

  return (
    <div
      className="min-h-screen bg-[#141820] p-4 text-sm text-white"
      data-harness-root=""
      data-schedule={scene === "batch" ? undefined : JSON.stringify(schedule)}
      data-land-ms={landMs ?? undefined}
      data-landed-src={
        p.clockMs !== null ? (landedSrc ?? undefined) : undefined
      }
    >
      {p.still ? (
        <style>{`[data-look] *, [data-look] { animation-duration: 0s !important; animation-delay: 0s !important; }`}</style>
      ) : null}
      <Toolbar params={p} href={href} />
      <div
        style={{
          width: `${(1920 * p.scale).toString()}px`,
          height: `${(1080 * p.scale).toString()}px`,
          overflow: "hidden",
          position: "relative",
          borderRadius: "6px",
          background:
            "radial-gradient(1150px 770px at 30% 70%, #2f4a3a 0%, transparent 60%), radial-gradient(960px 960px at 80% 20%, #3b2f4d 0%, transparent 60%), linear-gradient(180deg,#202633 0%,#141820 100%)",
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${p.scale.toString()})`,
            transformOrigin: "top left",
          }}
        >
          {board}
        </div>
      </div>
    </div>
  );
}
