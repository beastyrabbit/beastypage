"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CatGeneratorApi,
  SpriteMapperApi,
} from "@/components/cat-builder/types";
import {
  getArchetypeTheme,
  STARTER_THEME,
  withAlpha,
} from "@/components/evolution/archetypes";
import {
  type CeremonyCat,
  EvolutionCeremony,
} from "@/components/evolution/EvolutionCeremony";
import {
  pixelFontClass,
  stageRank,
} from "@/components/evolution/evolutionDisplay";
import {
  type EvolutionPools,
  generateTeaserVariant,
} from "@/lib/evolution/evolutionGenerator";
import { buildEvolutionPools } from "@/lib/evolution/evolutionPools";
import type {
  EvolutionStreamCat,
  EvolutionStreamCommand,
} from "@/lib/evolution/streamEvolution";
import { cn } from "@/lib/utils";
import { QrBadge } from "../QrBadge";

interface EvolutionSceneProps {
  command: EvolutionStreamCommand;
  /**
   * "ceremony" plays the full ceremony then shows the lineage; "tree" jumps
   * straight to the lineage + QR (used when the overlay reloads after the
   * ceremony would already have finished).
   */
  initialPhase: "ceremony" | "tree";
}

type RenderedCat = EvolutionStreamCat & { previewUrl: string | null };

/**
 * Plays an evolution ceremony on stream: re-renders every cat from the
 * params in the command, feeds them progressively into EvolutionCeremony
 * (hands-off mode), then shows a compact lineage board with a QR code to
 * the saved /evolution/[slug] page.
 */
export function EvolutionScene({ command, initialPhase }: EvolutionSceneProps) {
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

  if (loadError) {
    // Renderer failed — at least put the QR for the saved lineage on screen.
    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: "1280px", height: "1080px" }}
      >
        <LineageQr slug={command.slug} />
      </div>
    );
  }

  if (phase === "ceremony") {
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

  return <LineageBoard command={command} renderedCats={renderedCats} />;
}

function LineageQr({ slug }: { slug: string }) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/evolution/${slug}`
      : `/evolution/${slug}`;
  return <QrBadge url={url} label="Scan for the lineage" size={190} />;
}

/** Usable board area inside the 1280×1080 scene (padding, QR column, header). */
const BOARD_WIDTH = 1280 - 72 - 24 - 260 - 48;
const BOARD_HEIGHT = 1080 - 56 - 44 - 48;

/**
 * Post-ceremony lineage with a dynamic layout that maximises sprite size:
 * a single evolution level renders as a flat grid of big themed cards; deeper
 * lineages get one column per branch sized to fill the board. Cards pop in
 * staggered for a quick "run-through" of the evolutions.
 */
function LineageBoard({
  command,
  renderedCats,
}: {
  command: EvolutionStreamCommand;
  renderedCats: RenderedCat[];
}) {
  const byKey = new Map(renderedCats.map((cat) => [cat.key, cat]));
  const cats = command.cats.map(
    (cat) => byKey.get(cat.key) ?? { ...cat, previewUrl: null },
  );
  const starter = cats.find((cat) => cat.level === 0) ?? cats[0];
  const branches: Array<{ label: string; cats: RenderedCat[] }> = [];
  for (const cat of cats) {
    if (cat.level === 0 || !cat.branchLabel) continue;
    let branch = branches.find((entry) => entry.label === cat.branchLabel);
    if (!branch) {
      branch = { label: cat.branchLabel, cats: [] };
      branches.push(branch);
    }
    branch.cats.push(cat);
  }
  const branchCount = Math.max(branches.length, 1);
  const maxLevels = Math.max(
    1,
    ...branches.map((branch) => branch.cats.length),
  );
  const flatLayout = maxLevels === 1;

  // Maximise the sprites for whatever shape this lineage has.
  const evolutionCount = branches.reduce(
    (sum, branch) => sum + branch.cats.length,
    0,
  );
  let spriteSize: number;
  let flatColumns = 1;
  let starterSize: number;
  if (flatLayout) {
    flatColumns = Math.min(5, Math.max(2, Math.ceil(evolutionCount / 2)));
    const rows = Math.ceil(evolutionCount / flatColumns);
    starterSize = rows > 1 ? 150 : 190;
    spriteSize = Math.min(
      230,
      Math.floor(BOARD_WIDTH / flatColumns) - 36,
      Math.floor((BOARD_HEIGHT - starterSize - 60) / rows) - 60,
    );
  } else {
    starterSize = 130;
    spriteSize = Math.min(
      210,
      Math.floor(BOARD_WIDTH / branchCount) - 40,
      Math.floor((BOARD_HEIGHT - starterSize - 80) / maxLevels) - 52,
    );
  }
  spriteSize = Math.max(spriteSize, 72);

  return (
    <div
      className="relative flex flex-col"
      style={{ width: "1280px", height: "1080px", padding: "28px 36px" }}
    >
      <style>{`
        @keyframes obs-lineage-pop {
          0% { opacity: 0; transform: translateY(14px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-center gap-4 pb-3">
        <span
          className={cn(
            pixelFontClass,
            "text-sm tracking-wider text-amber-200",
          )}
        >
          ✨ EVOLUTION LINEAGE ✨
        </span>
        <span className={cn(pixelFontClass, "text-[10px] text-white/60")}>
          {command.totalCount} CATS
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Lineage board */}
        <div
          className="flex min-w-0 flex-1 flex-col gap-3 rounded-3xl border-2 p-6"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 100%)",
            borderColor: "rgba(245, 158, 11, 0.2)",
            boxShadow:
              "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
          }}
        >
          {/* Starter */}
          {starter && (
            <div
              className="flex items-center justify-center gap-4"
              style={{ animation: "obs-lineage-pop 500ms ease both" }}
            >
              <LineageSprite cat={starter} size={starterSize} />
              <div className="flex flex-col">
                <span
                  className={cn(pixelFontClass, "text-[10px] text-white/50")}
                >
                  {STARTER_THEME.glyph} STARTER
                </span>
                <span className="text-lg font-semibold text-white">
                  {starter.label}
                </span>
              </div>
            </div>
          )}

          {flatLayout ? (
            // One level: a flat grid of big themed cards.
            <div
              className="grid min-h-0 flex-1 content-evenly justify-items-center gap-3"
              style={{
                gridTemplateColumns: `repeat(${flatColumns}, minmax(0, 1fr))`,
              }}
            >
              {branches.map((branch, index) => {
                const cat = branch.cats[0];
                const theme = getArchetypeTheme(cat?.archetype);
                if (!cat) return null;
                return (
                  <div
                    key={branch.label}
                    className="flex w-full flex-col items-center rounded-2xl border px-2 py-3"
                    style={{
                      borderColor: withAlpha(theme.from, 0.35),
                      background: `linear-gradient(180deg, ${withAlpha(theme.from, 0.1)}, transparent 75%)`,
                      animation: "obs-lineage-pop 500ms ease both",
                      animationDelay: `${300 + index * 160}ms`,
                    }}
                  >
                    <span
                      className={cn(pixelFontClass, "text-[10px]")}
                      style={{ color: theme.from }}
                    >
                      {theme.glyph} {branch.label}
                    </span>
                    <LineageSprite cat={cat} size={spriteSize} />
                    <span className="max-w-full truncate px-1 text-sm font-bold text-white/90">
                      {cat.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            // Multiple levels: one column per branch, sprites fill the rows.
            <div
              className="grid min-h-0 flex-1 gap-3"
              style={{
                gridTemplateColumns: `repeat(${branchCount}, minmax(0, 1fr))`,
              }}
            >
              {branches.map((branch, branchIndex) => {
                const theme = getArchetypeTheme(branch.cats[0]?.archetype);
                return (
                  <div
                    key={branch.label}
                    className="flex min-h-0 flex-col items-center gap-1 rounded-2xl border p-2"
                    style={{
                      borderColor: withAlpha(theme.from, 0.35),
                      background: `linear-gradient(180deg, ${withAlpha(theme.from, 0.08)}, transparent 70%)`,
                      animation: `obs-lineage-pop 500ms ease both`,
                      animationDelay: `${300 + branchIndex * 140}ms`,
                    }}
                  >
                    <span
                      className={cn(pixelFontClass, "text-[10px]")}
                      style={{ color: theme.from }}
                    >
                      {theme.glyph} {branch.label}
                    </span>
                    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-evenly gap-1">
                      {branch.cats.map((cat, levelIndex) => (
                        <div
                          key={cat.key}
                          className="flex w-full flex-col items-center"
                          style={{
                            animation: "obs-lineage-pop 500ms ease both",
                            animationDelay: `${500 + branchIndex * 140 + levelIndex * 220}ms`,
                          }}
                        >
                          <LineageSprite cat={cat} size={spriteSize} />
                          <span className="max-w-full truncate px-1 text-xs font-semibold text-white/90">
                            {cat.label}
                          </span>
                          <span
                            className={cn(
                              pixelFontClass,
                              "text-[8px] text-white/40",
                            )}
                          >
                            {stageRank(cat.level)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* QR side panel */}
        <div className="flex w-[260px] shrink-0 flex-col items-center justify-center gap-4">
          <LineageQr slug={command.slug} />
        </div>
      </div>
    </div>
  );
}

function LineageSprite({ cat, size }: { cat: RenderedCat; size: number }) {
  if (!cat.previewUrl) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-white/40"
        style={{ width: size, height: size }}
      >
        …
      </div>
    );
  }
  return (
    <Image
      src={cat.previewUrl}
      alt={cat.label}
      width={size}
      height={size}
      unoptimized
      className="image-render-pixel object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)]"
      style={{ width: size, height: size }}
    />
  );
}
