"use client";

import Image from "next/image";
import {
  getArchetypeTheme,
  STARTER_THEME,
  withAlpha,
} from "@/components/evolution/archetypes";
import {
  pixelFontClass,
  stageRank,
} from "@/components/evolution/evolutionDisplay";
import { cn } from "@/lib/utils";
import { QrBadge } from "../../QrBadge";
import { OBS_PANEL_STYLE } from "../../themes/panelStyle";
import type { LineageBoardProps } from "../LookBoardProps";
import type { LineageCat } from "../lineageModel";

/** Usable board area inside the 1280×1080 scene (padding, QR column, header). */
const BOARD_WIDTH = 1280 - 72 - 24 - 260 - 48;
const BOARD_HEIGHT = 1080 - 56 - 44 - 48;

/**
 * The original post-ceremony lineage: a dynamic layout that maximises
 * sprite size. A single evolution level renders as a flat grid of big
 * themed cards; deeper lineages get one column per branch sized to fill the
 * board. Cards pop in staggered for a quick "run-through" of the evolutions.
 */
export function ClassicLineage({ model }: Readonly<LineageBoardProps>) {
  const { starter, branches } = model;
  const branchCount = Math.max(branches.length, 1);
  const maxLevels = model.maxLevels;
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
          {model.totalCount} CATS
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Lineage board */}
        <div
          className="flex min-w-0 flex-1 flex-col gap-3 p-6"
          style={{
            ...OBS_PANEL_STYLE,
            // Classic: 24px (rounded-3xl); square themes stay square.
            borderRadius: "calc(var(--obs-panel-radius) * 1.2)",
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
          <QrBadge url={model.url} label="Scan for the lineage" size={190} />
        </div>
      </div>
    </div>
  );
}

function LineageSprite({
  cat,
  size,
}: Readonly<{ cat: LineageCat; size: number }>) {
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
