"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import {
  type CeremonyCat,
  EvolutionCeremony,
} from "@/components/evolution/EvolutionCeremony";
import {
  type EvolutionPools,
  generateTeaserVariant,
} from "@/lib/evolution/evolutionGenerator";
import { buildEvolutionPools } from "@/lib/evolution/evolutionPools";
import type {
  EvolutionStreamCat,
  EvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";
import { useLineageCeremony } from "../looks/ceremony";
import { buildLineageModel } from "../looks/lineageModel";
import type { ShowLookId } from "../looks/lookMeta";
import { SHOW_LOOKS } from "../looks/registry";
import { QrBadge } from "../QrBadge";

interface EvolutionSceneProps {
  command: EvolutionStreamCommand;
  /**
   * "ceremony" plays the full ceremony then shows the lineage; "tree" jumps
   * straight to the lineage + QR (used when the overlay reloads after the
   * ceremony would already have finished).
   */
  initialPhase: "ceremony" | "tree";
  /** Design of the lineage finale (session setting `showLook`). */
  look: ShowLookId;
}

type RenderedCat = EvolutionStreamCat & { previewUrl: string | null };

function lineageUrl(slug: string): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/evolution/${slug}`
    : `/evolution/${slug}`;
}

/**
 * Plays an evolution ceremony on stream: re-renders every cat from the
 * params in the command, feeds them progressively into EvolutionCeremony
 * (hands-off mode), then shows the lineage board of the selected look with
 * a QR code to the saved /evolution/[slug] page.
 */
export function EvolutionScene({
  command,
  initialPhase,
  look,
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
            previewUrl =
              result.imageDataUrl ??
              ("toDataURL" in result.canvas
                ? (result.canvas as HTMLCanvasElement).toDataURL("image/png")
                : null);
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

  // Slot-machine tease frame for the upcoming cat, same as the generator page.
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
        return (
          rendered.imageDataUrl ??
          ("toDataURL" in rendered.canvas
            ? (rendered.canvas as HTMLCanvasElement).toDataURL("image/png")
            : null)
        );
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

  const ceremonyCats: CeremonyCat[] = renderedCats.map((cat) => ({
    key: cat.key,
    label: cat.label,
    level: cat.level,
    branchLabel: cat.branchLabel,
    archetype: cat.archetype,
    additions: cat.additions,
    previewUrl: cat.previewUrl,
  }));

  // Every look except classic plays the ceremony inside its own board:
  // the same steps and timings, drawn in the look's visual language.
  const themedCeremony = look !== "classic";
  const finishCeremony = useCallback(() => setPhase("tree"), []);
  const reveal = useLineageCeremony({
    cats: ceremonyCats,
    totalCount: command.totalCount,
    chargeDurationMs: command.chargeDurationMs,
    requestTeaserFrame,
    onFinish: finishCeremony,
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
        style={{ width: "1280px", height: "1080px", padding: "40px" }}
      >
        <div style={{ width: "920px", maxWidth: "100%" }}>
          <EvolutionCeremony
            cats={ceremonyCats}
            totalCount={command.totalCount}
            onFinish={() => setPhase("tree")}
            pools={pools}
            chargeDurationMs={command.chargeDurationMs}
            requestTeaserFrame={requestTeaserFrame}
            hideControls
          />
        </div>
      </div>
    );
  }

  const Lineage = SHOW_LOOKS[look].Lineage;
  return (
    <Lineage
      model={buildLineageModel(command, renderedCats, lineageUrl(command.slug))}
      reveal={phase === "ceremony" ? reveal : undefined}
    />
  );
}
