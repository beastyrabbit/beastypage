"use client";

import {
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import {
  type CeremonyCat,
  EvolutionCeremony,
} from "@/components/evolution/EvolutionCeremony";
import { stageRank } from "@/components/evolution/evolutionDisplay";
import { DEFAULT_POSE_NAME } from "@/lib/cat-v3/poseOptions";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  applyAdditionsParams,
  rollBaseParams,
  rollCandidates,
  rollParentFor,
} from "@/lib/evolution/additionApply";
import {
  type EvolutionAddition,
  type EvolutionPools,
  generateTeaserVariant,
} from "@/lib/evolution/evolutionGenerator";
import { buildEvolutionPools } from "@/lib/evolution/evolutionPools";
import { CEREMONY_MS, seededRandom } from "@/lib/evolution/rollSchedule";
import type {
  EvolutionLiveState,
  EvolutionStreamCat,
  EvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";
import { type LineageReveal, useLineageCeremony } from "../looks/ceremony";
import { LOOK_CHROME, LOOK_ERUPTS_IN_MATERIAL } from "../looks/LookBoardProps";
import { buildLineageModel } from "../looks/lineageModel";
import type { ShowLookId } from "../looks/lookMeta";
import { SHOW_LOOKS } from "../looks/registry";
import { QrBadge } from "../QrBadge";
import { renderVariantFrames } from "../spinSupport";
import { anchorForParam } from "../themes/traitAnchorMap";
import { useSpriteAnchors } from "../themes/useSpriteAnchors";
import { LeaderLines, type LeaderTarget } from "./shared/LeaderLines";
import { Plaque, readPlaqueVars } from "./shared/Plaque";
import type { PlaqueModel, Point, Rect } from "./shared/plaqueModel";
import { OBS_CANVAS_WIDTH, useElementRects } from "./shared/useElementRects";

interface EvolutionSceneProps {
  command: EvolutionStreamCommand & { seq: number; timestamp: number };
  /**
   * "ceremony" plays the full ceremony then shows the lineage; "tree" jumps
   * straight to the lineage + QR (used when the overlay reloads after the
   * ceremony would already have finished).
   */
  initialPhase: "ceremony" | "tree";
  /** Design of the lineage finale (session setting `showLook`). */
  look: ShowLookId;
  /** session.evolutionState, null when absent. */
  liveState: EvolutionLiveState | null;
}

type RenderedCat = EvolutionStreamCat & { previewUrl: string | null };

/** Which sprite feature a landed addition points at (ParamIds of themes/traitAnchorMap). */
const ADDITION_ANCHOR: Record<EvolutionAddition["kind"], string> = {
  accessory: "accessory",
  scar: "scar",
  tortie: "tortie",
  coat: "sprite",
  // replacement uses `addition.slot` as the ParamId (see additionAnchorId).
  replacement: "pelt",
  trait: "pelt",
};

function additionAnchorId(addition: EvolutionAddition): string {
  return addition.kind === "replacement"
    ? addition.slot
    : ADDITION_ANCHOR[addition.kind];
}

const CANVAS_MID_X = OBS_CANVAS_WIDTH / 2;

/** Reduced motion: every look animation inside the wrapper collapses to its end state. */
const FRAME_STYLES = `
@media (prefers-reduced-motion: reduce) {
  [data-evolution-look], [data-evolution-look] * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; }
}
`;

function lineageUrl(slug: string): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/evolution/${slug}`
    : `/evolution/${slug}`;
}

function canvasDataUrl(result: {
  imageDataUrl?: string | null;
  canvas: unknown;
}): string | null {
  if (result.imageDataUrl) return result.imageDataUrl;
  const canvas = result.canvas as { toDataURL?: (type: string) => string };
  return typeof canvas.toDataURL === "function"
    ? canvas.toDataURL("image/png")
    : null;
}

export interface EvolutionShowFrameProps {
  look: ShowLookId;
  reveal: LineageReveal;
  /** Command cats (params): the landed pose/feature the leader line points at. */
  cats: readonly EvolutionStreamCat[];
  totalCount: number;
  /** Receives the root element (the hook measures confetti origins in it). */
  rootRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * Root of the themed evolution show: the look, the plaque (title/status from
 * the reveal, never numerals) and one leader line from the plaque to the
 * active cat from the land phase through its reveal. Gated by LOOK_CHROME.
 */
export function EvolutionShowFrame({
  look,
  reveal,
  cats,
  totalCount,
  rootRef,
  children,
}: Readonly<EvolutionShowFrameProps>): ReactElement {
  const chrome = LOOK_CHROME[look];
  const localRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
      if (rootRef) rootRef.current = el;
      setContainer(el);
    },
    [rootRef],
  );

  const step = reveal.step;
  const roll = reveal.roll;
  const activeIndex =
    step.kind === "summon" ? 0 : "index" in step ? step.index : -1;
  const activeCat = activeIndex >= 0 ? (cats[activeIndex] ?? null) : null;
  // Measure per frame only while something lands or enters (land phase,
  // reveal): that is when the leader line and the confetti origin need the
  // moving rect. A whole-lineage measurement on every frame of a roll is
  // layout work the strobe does not need.
  const rects = useElementRects(
    localRef,
    "data-lineage-key",
    [step.kind, reveal.activeKey, roll?.phase ?? null],
    roll?.phase === "land" || step.kind === "reveal",
  );
  const [plaqueRect, setPlaqueRect] = useState<Rect | null>(null);
  // The leader line mounts at canvas level, outside the look's plaque slot,
  // so the slot's accent never reaches it by inheritance; read it off the
  // slot (re-read per step: looks may swap the slot element per phase).
  const [accent, setAccent] = useState<string | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: look/step.kind are the re-read triggers
  useLayoutEffect(() => {
    if (!container) return;
    setAccent(readPlaqueVars(container).accent);
  }, [container, look, step.kind]);

  // The landed frame's pose decides where the line ends on the sprite.
  const rollKey =
    roll && activeCat ? `${activeCat.key}:${roll.index.toString()}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: rollKey identifies (cat, addition)
  const landedParams = useMemo<CatParams | null>(() => {
    if (!roll || !activeCat) return null;
    try {
      return applyAdditionsParams(
        rollParentFor(cats, activeIndex),
        activeCat.additions.slice(0, roll.index + 1),
      );
    } catch {
      return null;
    }
  }, [rollKey]);
  const anchors = useSpriteAnchors(
    landedParams?.poseName ?? DEFAULT_POSE_NAME,
    Boolean(landedParams?.reverse),
  );
  const addition = roll && activeCat ? activeCat.additions[roll.index] : null;
  const anchor =
    anchors && addition
      ? (anchors.points[anchorForParam(additionAnchorId(addition))] ?? null)
      : null;

  const plaqueModel = useMemo<PlaqueModel>(() => {
    let title = "";
    let status = "";
    switch (step.kind) {
      case "summon":
        title = "THE KIT";
        status = "StarClan has plans for this one…";
        break;
      case "banner":
        title = reveal.activeBranch ?? "";
        status = "a new line begins";
        break;
      case "roll":
        if (roll?.phase === "land" && roll.valueLabel) {
          // Name the value the moment it lands, with the confetti and the line.
          title = roll.valueLabel;
          status = "landed";
        } else {
          title = roll?.traitLabel ?? "";
          status =
            roll && roll.count > 1
              ? `rolling · ${(roll.index + 1).toString()} of ${roll.count.toString()}`
              : "rolling…";
        }
        break;
      case "reveal":
        title = reveal.landedValues.length
          ? reveal.landedValues.join(" · ")
          : "NOTHING CHANGED";
        status = `RISEN TO ${stageRank(activeCat?.level ?? 1).toUpperCase()}`;
        break;
      case "finale":
        title = "COMPLETE";
        status = `${totalCount.toString()} cats`;
        break;
      case "done":
        break;
    }
    if (reveal.held) status = "HELD · say the word";
    return { title, status, tally: [], numerals: null };
  }, [
    step.kind,
    roll,
    reveal.activeBranch,
    reveal.landedValues,
    reveal.held,
    activeCat,
    totalCount,
  ]);

  const lineFrom: Point | null = plaqueRect
    ? {
        x:
          plaqueRect.x + plaqueRect.width / 2 > CANVAS_MID_X
            ? plaqueRect.x
            : plaqueRect.x + plaqueRect.width,
        y: plaqueRect.y + plaqueRect.height / 2,
      }
    : null;
  const targetRect = reveal.activeKey ? rects.get(reveal.activeKey) : undefined;
  const lineTargets: LeaderTarget[] =
    targetRect && reveal.activeKey
      ? [{ id: reveal.activeKey, rect: targetRect, anchor }]
      : [];
  const linesVisible = roll?.phase === "land" || step.kind === "reveal";
  const entranceKey = `${reveal.activeKey ?? ""}:${roll ? roll.index.toString() : "r"}`;

  return (
    <div
      ref={setRoot}
      data-evolution-look={look}
      data-ceremony-step={step.kind}
      data-roll-phase={roll?.phase ?? ""}
      data-reduced-motion={reveal.reducedMotion ? "1" : "0"}
      data-held={reveal.held ? "1" : "0"}
      style={{ position: "relative", width: 1280, height: 1080 }}
    >
      <style>{FRAME_STYLES}</style>
      {children}
      {chrome.plaque !== "none" && step.kind !== "done" ? (
        <Plaque
          model={plaqueModel}
          mode={chrome.plaque}
          container={container}
          slotKey={look}
          beatKey={step.kind}
          entranceKey={entranceKey}
          onAnchorRect={setPlaqueRect}
          breathing={reveal.held}
        />
      ) : null}
      {chrome.lines ? (
        <LeaderLines
          from={lineFrom}
          targets={lineTargets}
          visible={linesVisible}
          color={accent}
          drawKey={entranceKey}
        />
      ) : null}
    </div>
  );
}

/**
 * Plays an evolution ceremony on stream: re-renders every cat from the
 * params in the command, runs the clock-based themed ceremony inside the
 * selected look (or the classic chamber), then shows the lineage board with
 * a QR code to the saved /evolution/[slug] page.
 */
export function EvolutionScene({
  command,
  initialPhase,
  look,
  liveState,
}: Readonly<EvolutionSceneProps>) {
  const generatorRef = useRef<CatGeneratorApi | null>(null);
  const renderTokenRef = useRef(0);
  const [phase, setPhase] = useState<"ceremony" | "tree">(initialPhase);
  const [pools, setPools] = useState<EvolutionPools | null>(null);
  const [renderedCats, setRenderedCats] = useState<RenderedCat[]>([]);
  const renderedCatsRef = useRef<RenderedCat[]>([]);
  renderedCatsRef.current = renderedCats;
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the renderer + sprite pools, then render every cat in order.
  useEffect(() => {
    const token = ++renderTokenRef.current;
    setRenderedCats([]);
    setLoadError(null);

    (async () => {
      try {
        const [{ default: catGenerator }, { default: spriteMapper }] =
          await Promise.all([
            import("@/lib/single-cat/catGeneratorV3"),
            import("@/lib/single-cat/spriteMapper"),
          ]);
        if (renderTokenRef.current !== token) return;
        generatorRef.current = catGenerator as CatGeneratorApi;
        const mapper = spriteMapper as unknown as SpriteMapperApi;
        if (!mapper.loaded) {
          await mapper.init();
        }
        if (renderTokenRef.current !== token) return;
        setPools(buildEvolutionPools(mapper));

        const rendered: RenderedCat[] = [];
        for (const cat of command.cats) {
          if (renderTokenRef.current !== token) return;
          let previewUrl: string | null = null;
          try {
            const result = await generatorRef.current.generateCat(
              cat.catData.params,
            );
            previewUrl = canvasDataUrl(result);
          } catch (renderError) {
            console.warn(
              "[ObsOverlayClient] Failed to render evolution cat",
              cat.key,
              renderError,
            );
          }
          rendered.push({ ...cat, previewUrl });
          setRenderedCats([...rendered]);
        }
      } catch (error) {
        console.error(
          "[ObsOverlayClient] Failed to load evolution renderer",
          error,
        );
        if (renderTokenRef.current === token) {
          setLoadError("Unable to load the cat renderer.");
        }
      }
    })();

    return () => {
      renderTokenRef.current += 1;
    };
  }, [command]);

  // Slot-machine tease frame for the upcoming cat (classic chamber only).
  const requestTeaserFrame = useCallback(
    async (index: number) => {
      const generator = generatorRef.current;
      const upcoming = renderedCatsRef.current[index] ?? command.cats[index];
      if (!generator || !upcoming || !pools) return null;
      const list = renderedCatsRef.current.length
        ? renderedCatsRef.current
        : command.cats;
      const parent = Number(upcoming.level) <= 1 ? list[0] : list[index - 1];
      if (!parent) return null;
      try {
        const params = generateTeaserVariant(
          parent.catData,
          upcoming.additions,
          pools,
          { archetype: upcoming.archetype },
        );
        const rendered = await generator.generateCat(params);
        return canvasDataUrl(rendered);
      } catch (teaserError) {
        console.warn(
          "[ObsOverlayClient] Failed to render teaser frame",
          teaserError,
        );
        return null;
      }
    },
    [command, pools],
  );

  // One roll = one variant sheet: 12 wrong candidates + the landed frame.
  // Rejects while the renderer loads so the hook retries on the next step.
  const requestRollFrames = useCallback(
    async (catIndex: number, addition: number, seed: number) => {
      const generator = generatorRef.current;
      if (!generator || !pools) throw new Error("renderer not ready");
      const cat = command.cats[catIndex];
      const target = cat?.additions[addition];
      const base = rollBaseParams(command.cats, catIndex, addition);
      if (!cat || !target || !base) return { candidates: [], landed: null };
      const candidates = rollCandidates(
        base,
        target,
        pools,
        seededRandom(seed),
        CEREMONY_MS.candidateCount,
        cat.archetype,
      );
      const landedParams = applyAdditionsParams(
        rollParentFor(command.cats, catIndex),
        cat.additions.slice(0, addition + 1),
      );
      const option = { raw: null, display: "" };
      const descriptors = [
        ...candidates.map((params, k) => ({
          id: `c${k.toString()}`,
          option,
          params,
        })),
        { id: "landed", option, params: landedParams },
      ];
      const frames = await renderVariantFrames(generator, base, descriptors);
      const urls = frames.map((frame) => frame.canvas.toDataURL("image/png"));
      return {
        candidates: urls.slice(0, candidates.length),
        landed:
          urls.length === descriptors.length ? urls[urls.length - 1] : null,
      };
    },
    [command, pools],
  );

  // Skip to board from the control page (any look).
  useEffect(() => {
    if (liveState?.seq === command.seq && liveState.skipToBoard) {
      setPhase("tree");
    }
  }, [liveState, command.seq]);

  const ceremonyCats: CeremonyCat[] = renderedCats.map((cat) => ({
    key: cat.key,
    label: cat.label,
    level: cat.level,
    branchLabel: cat.branchLabel,
    archetype: cat.archetype,
    additions: cat.additions,
    previewUrl: cat.previewUrl,
  }));

  // Every look except classic plays the ceremony inside its own board on
  // the shared clock; the schedule needs every command cat from the start.
  const themedCeremony = look !== "classic";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const finishCeremony = useCallback(() => setPhase("tree"), []);
  const ignoreFinish = useCallback(() => {}, []);
  const reveal = useLineageCeremony({
    cats: command.cats.map((cat, i) => ({
      key: cat.key,
      label: cat.label,
      level: cat.level,
      branchLabel: cat.branchLabel,
      archetype: cat.archetype,
      previewUrl: renderedCats[i]?.previewUrl ?? null,
      // Same parent rule as rollParentFor: level ≤ 1 evolves from the starter.
      parentUrl: renderedCats[cat.level <= 1 ? 0 : i - 1]?.previewUrl ?? null,
      additions: cat.additions,
    })),
    totalCount: command.totalCount,
    chargeDurationMs: command.chargeDurationMs,
    startedAt: command.timestamp,
    seq: command.seq,
    liveState,
    requestRollFrames: themedCeremony ? requestRollFrames : undefined,
    onFinish: themedCeremony ? finishCeremony : ignoreFinish,
    confetti: !LOOK_ERUPTS_IN_MATERIAL.has(look),
    containerRef: rootRef,
    enabled: themedCeremony && phase === "ceremony",
  });

  if (loadError) {
    // Renderer failed — at least put the QR for the saved lineage on screen.
    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: "1280px", height: "1080px" }}
      >
        <QrBadge
          url={lineageUrl(command.slug)}
          label="Scan for the lineage"
          size={190}
        />
      </div>
    );
  }

  if (phase === "ceremony" && !themedCeremony) {
    return (
      <div
        className="relative flex items-center justify-center"
        data-evolution-look="classic"
        style={{ width: "1280px", height: "1080px", padding: "40px" }}
      >
        <div style={{ width: "920px", maxWidth: "100%" }}>
          <EvolutionCeremony
            cats={ceremonyCats}
            totalCount={command.totalCount}
            onFinish={finishCeremony}
            pools={pools}
            chargeDurationMs={command.chargeDurationMs}
            requestTeaserFrame={requestTeaserFrame}
            hideControls
            pacing="overlay"
            teaserFrameCap={12}
          />
        </div>
      </div>
    );
  }

  const Lineage = SHOW_LOOKS[look].Lineage;
  return (
    <EvolutionShowFrame
      look={look}
      reveal={reveal}
      cats={command.cats}
      totalCount={command.totalCount}
      rootRef={rootRef}
    >
      <Lineage
        model={buildLineageModel(
          command,
          renderedCats,
          lineageUrl(command.slug),
        )}
        reveal={reveal}
      />
    </EvolutionShowFrame>
  );
}
