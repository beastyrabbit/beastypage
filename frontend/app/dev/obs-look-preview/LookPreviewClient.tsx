"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AllegiancesBatch } from "@/components/stream-control/obs/looks/allegiances/AllegiancesBatch";
import {
  type BatchPhase,
  buildBatchBoardModel,
} from "@/components/stream-control/obs/looks/batchModel";
import { useLineageCeremony } from "@/components/stream-control/obs/looks/ceremony";
import { ContactBatch } from "@/components/stream-control/obs/looks/contact/ContactBatch";
import { HandheldBatch } from "@/components/stream-control/obs/looks/handheld/HandheldBatch";
import type { BatchBoardProps } from "@/components/stream-control/obs/looks/LookBoardProps";
import { buildLineageModel } from "@/components/stream-control/obs/looks/lineageModel";
import {
  isShowLookId,
  SHOW_LOOK_IDS,
  type ShowLookId,
} from "@/components/stream-control/obs/looks/lookMeta";
import { SHOW_LOOKS } from "@/components/stream-control/obs/looks/registry";
import { TrenchBatch } from "@/components/stream-control/obs/looks/strata/TrenchBatch";
import type { BatchStreamCat } from "@/lib/adoption/streamBatch";
import type { CatParams } from "@/lib/cat-v3/types";
import type {
  EvolutionAddition,
  EvolutionArchetype,
  EvolutionCatData,
} from "@/lib/evolution/evolutionGenerator";
import type { EvolutionStreamCommand } from "@/lib/evolution/streamEvolution";

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
        additions: [addition(b * 10 + level)],
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

interface BatchSim {
  phase: BatchPhase;
  stageIndex: number;
  eliminatedIds: string[];
  fadingId: string | null;
  markedId: string | null;
  potentialIds: string[];
  spotlightId: string | null;
}

/**
 * Drives a fake elimination show on a timer: every stage reveals (2.4s),
 * waits for a cull (2.6s, with a marked + a potential kit), fades the marked
 * kit out (1.1s), advances; once enough kits left the stages roll on to the
 * finale. A spotlight pops up on every third stage.
 */
function useBatchSimulation(
  enabled: boolean,
  cats: BatchStreamCat[],
  finalCount: number,
): BatchSim {
  const [sim, setSim] = useState<BatchSim>({
    phase: "revealing",
    stageIndex: 0,
    eliminatedIds: [],
    fadingId: null,
    markedId: null,
    potentialIds: [],
    spotlightId: null,
  });
  useEffect(() => {
    if (!enabled) return;
    const culls = Math.max(0, cats.length - finalCount);
    let cancelled = false;
    let state: BatchSim = {
      phase: "revealing",
      stageIndex: 0,
      eliminatedIds: [],
      fadingId: null,
      markedId: null,
      potentialIds: [],
      spotlightId: null,
    };
    const push = (next: Partial<BatchSim>) => {
      state = { ...state, ...next };
      if (!cancelled) setSim(state);
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    (async () => {
      while (!cancelled && state.stageIndex < STAGES.length) {
        push({ phase: "revealing", markedId: null, potentialIds: [] });
        await wait(2400);
        if (cancelled) return;
        const alive = cats.filter((c) => !state.eliminatedIds.includes(c.id));
        push({
          spotlightId:
            state.stageIndex % 3 === 1 ? (alive[2]?.id ?? null) : null,
        });
        if (state.eliminatedIds.length < culls) {
          const victim = alive[alive.length - 1 - (state.stageIndex % 3)];
          push({
            phase: "awaitingCull",
            markedId: victim?.id ?? null,
            potentialIds: [alive[1]?.id ?? ""],
          });
          await wait(2600);
          if (cancelled || !victim) return;
          push({
            eliminatedIds: [...state.eliminatedIds, victim.id],
            fadingId: victim.id,
            markedId: null,
            potentialIds: [],
          });
          await wait(1100);
          if (cancelled) return;
          push({ fadingId: null });
        } else {
          await wait(800);
        }
        push({ stageIndex: state.stageIndex + 1 });
      }
      push({ phase: "done", spotlightId: null });
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

export function LookPreviewClient() {
  const params = useSearchParams();
  const lookParam = params.get("look");
  const look: ShowLookId = isShowLookId(lookParam) ? lookParam : "allegiances";
  const scene = resolveScene(params.get("scene"));
  const branches = Number(params.get("branches") ?? "3");
  const levels = Number(params.get("levels") ?? "2");
  const pool = Number(params.get("pool") ?? "16");
  const finalCount = Number(params.get("final") ?? "10");
  const phase = resolvePhase(params.get("phase"));
  const spot = params.get("spot") === "1";
  const scale = Number(params.get("scale") ?? "0.6");

  const evolutionCommand = useMemo(
    () => mockEvolutionCommand(branches, levels),
    [branches, levels],
  );
  const poolCats = useMemo(() => mockPool(pool), [pool]);
  const spriteCount = scene === "batch" ? pool : evolutionCommand.cats.length;
  const sprites = useMockSprites(
    spriteCount,
    scene === "batch" && phase !== "done",
  );

  // still=1 freezes every animation at its end state (for screenshots).
  const still = params.get("still") === "1";

  // auto=1 runs a fake batch show: reveal, wait, mark, cull … until done.
  const auto = params.get("auto") === "1";
  const sim = useBatchSimulation(auto, poolCats, finalCount);

  // scene=ceremony plays the look's themed ceremony with mock teaser frames
  // (charge=<ms> sets the spin length, default 5s).
  const [finished, setFinished] = useState(false);
  const chargeMs = Number(params.get("charge") ?? "5000");
  const teaser = useCallback(
    () => composeCat(Math.floor(Math.random() * 100000), false),
    [],
  );
  const finish = useCallback(() => setFinished(true), []);
  const reveal = useLineageCeremony({
    cats: evolutionCommand.cats.map((cat, i) => ({
      key: cat.key,
      label: cat.label,
      level: cat.level,
      branchLabel: cat.branchLabel,
      archetype: cat.archetype,
      previewUrl: sprites[i] ?? null,
    })),
    totalCount: evolutionCommand.totalCount,
    chargeDurationMs: chargeMs,
    requestTeaserFrame: teaser,
    onFinish: finish,
    enabled: scene === "ceremony" && !finished && sprites.length > 0,
  });

  const Look = SHOW_LOOKS[look];
  const Batch = BATCH_BOARDS[look];
  let board: React.ReactNode;
  if (scene !== "batch") {
    const model = buildLineageModel(
      evolutionCommand,
      evolutionCommand.cats.map((cat, i) => ({
        key: cat.key,
        previewUrl: sprites[i] ?? null,
      })),
      "https://beastyrabbit.com/evolution/ashfern-preview",
    );
    board = (
      <Look.Lineage
        model={model}
        reveal={scene === "ceremony" && !finished ? reveal : undefined}
      />
    );
  } else if (!Batch) {
    board = (
      <p className="p-8 font-mono text-sm text-white/70">
        {look} has no batch board here; its batch look is a full scene under
        /dev/obs-batch-preview.
      </p>
    );
  } else if (auto) {
    board = (
      <Batch
        model={buildBatchBoardModel({
          title: "Adoption Elimination",
          cats: poolCats,
          finalCount,
          saved: sim.phase === "done",
          stages: STAGES,
          phase: sim.phase,
          stageIndex: sim.stageIndex,
          previews: Object.fromEntries(
            poolCats.map((cat, i) => [
              cat.id,
              sprites[i]
                ? {
                    url:
                      sim.stageIndex % 2
                        ? (sprites[i] as string)
                        : (sprites[(i + 1) % sprites.length] as string),
                  }
                : undefined,
            ]),
          ),
          eliminatedIds: sim.eliminatedIds,
          fadingId: sim.fadingId,
          markedId: sim.markedId,
          potentialIds: sim.potentialIds,
          favoriteIds: [poolCats[4]?.id ?? ""],
          spotlightId: sim.spotlightId,
          qrUrl:
            sim.phase === "done"
              ? "https://beastyrabbit.com/adoption/preview-litter"
              : null,
        })}
      />
    );
  } else {
    const culls = Math.max(0, pool - finalCount);
    const stageIndex =
      phase === "done" ? STAGES.length : Math.min(culls, STAGES.length - 1) - 1;
    const eliminatedCount =
      phase === "done" ? culls : Math.max(0, Math.min(culls, stageIndex));
    const eliminatedIds = poolCats
      .filter((_, i) => i % 2 === 1)
      .slice(0, eliminatedCount)
      .map((cat) => cat.id);
    const alive = poolCats.filter((cat) => !eliminatedIds.includes(cat.id));
    const model = buildBatchBoardModel({
      title: "Adoption Elimination",
      cats: poolCats,
      finalCount,
      saved: phase === "done",
      stages: STAGES,
      phase,
      stageIndex: Math.max(0, stageIndex),
      previews: Object.fromEntries(
        poolCats.map((cat, i) => [
          cat.id,
          sprites[i] ? { url: sprites[i] as string } : undefined,
        ]),
      ),
      eliminatedIds,
      fadingId: null,
      markedId: phase === "awaitingCull" ? (alive[3]?.id ?? null) : null,
      potentialIds: phase === "awaitingCull" ? [alive[1]?.id ?? ""] : [],
      favoriteIds: [alive[4]?.id ?? ""],
      spotlightId: spot ? (alive[4]?.id ?? null) : null,
      qrUrl:
        phase === "done"
          ? "https://beastyrabbit.com/adoption/preview-litter"
          : null,
    });
    board = <Batch model={model} />;
  }

  const href = (overrides: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(overrides)) next.set(key, value);
    return `?${next.toString()}`;
  };

  return (
    <div className="min-h-screen bg-[#141820] p-4 text-sm text-white">
      {still ? (
        <style>{`[data-look] *, [data-look] { animation-duration: 0s !important; animation-delay: 0s !important; }`}</style>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="opacity-60">look:</span>
        {SHOW_LOOK_IDS.map((id) => (
          <a
            key={id}
            href={href({ look: id })}
            className={id === look ? "underline" : "opacity-60"}
          >
            {id}
          </a>
        ))}
        <span className="ml-4 opacity-60">scene:</span>
        {(["evolution", "ceremony", "batch"] as const).map((s) => (
          <a
            key={s}
            href={href({ scene: s })}
            className={s === scene ? "underline" : "opacity-60"}
          >
            {s}
          </a>
        ))}
        {scene === "batch" ? (
          <>
            <span className="ml-4 opacity-60">phase:</span>
            {(["revealing", "awaitingCull", "done"] as const).map((p) => (
              <a
                key={p}
                href={href({ phase: p })}
                className={p === phase ? "underline" : "opacity-60"}
              >
                {p}
              </a>
            ))}
            <a
              href={href({ spot: spot ? "0" : "1" })}
              className="ml-4 opacity-60"
            >
              spotlight: {spot ? "on" : "off"}
            </a>
            <span className="ml-4 opacity-60">pool={pool}</span>
          </>
        ) : (
          <span className="ml-4 opacity-60">
            branches={branches} levels={levels}
          </span>
        )}
      </div>
      <div
        style={{
          width: `${(1920 * scale).toString()}px`,
          height: `${(1080 * scale).toString()}px`,
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
            transform: `scale(${scale.toString()})`,
            transformOrigin: "top left",
          }}
        >
          {board}
        </div>
      </div>
    </div>
  );
}
