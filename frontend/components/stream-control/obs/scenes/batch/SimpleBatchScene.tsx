"use client";

import Image from "next/image";
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { QrBadge } from "../../QrBadge";
import { OBS_PANEL_STYLE } from "../../themes/panelStyle";
import { packSquares } from "./batchLayout";
import { BatchSprite } from "./batchShared";
import type { BatchSceneViewProps, BatchViewCat } from "./batchView";

/** Inner size of the cat grid on the 1280×1080 canvas. */
const GRID_WIDTH = 1280 - 64 - 32 - 4;
const HEADER_HEIGHT = 40;
/** The plaque band under the header (slot 120 + its gap). */
const PLAQUE_BAND = 128;
const GRID_HEIGHT = 1080 - 48 - HEADER_HEIGHT - PLAQUE_BAND - 32 - 4;
const GRID_GAP = 8;
const LABEL_HEIGHT = 34;
/**
 * Side column (spotlight / QR), always reserved so the grid never reflows
 * mid-beat: the wrapper measures sprite rects only on beat changes.
 */
const SIDE_WIDTH = 300;
const PANEL_GAP = 20;

function catLabelColourClass(marked: boolean, potential: boolean): string {
  if (marked) return "text-red-300";
  if (potential) return "text-yellow-200";
  return "text-white/90";
}

/**
 * Side column: the QR once the litter is saved, else the spotlight (one cat
 * shown big beside the grid, never over it), else a hint.
 */
function sideColumn(
  done: boolean,
  qrUrl: string | null,
  spotlight: BatchViewCat | null,
): ReactElement {
  if (done && qrUrl) {
    return (
      <div
        className="flex shrink-0 flex-col items-center justify-center"
        style={{ width: SIDE_WIDTH }}
      >
        <QrBadge url={qrUrl} label="Scan for the litter" size={185} />
      </div>
    );
  }
  if (spotlight) {
    return (
      <div
        className="relative flex shrink-0 flex-col items-center justify-center rounded-3xl border-2 px-3 py-6"
        style={{
          width: SIDE_WIDTH,
          background: "rgba(8, 8, 10, 0.94)",
          borderColor: "rgba(56, 189, 248, 0.5)",
          boxShadow: "0 0 50px rgba(56,189,248,0.2)",
        }}
      >
        <span
          className="obs-batch-num"
          style={{ left: 14, top: 14, height: 44, fontSize: 24 }}
        >
          {spotlight.numberLabel}
        </span>
        {spotlight.previewUrl ? (
          <Image
            src={spotlight.previewUrl}
            alt={spotlight.label}
            width={270}
            height={270}
            unoptimized
            className="image-render-pixel object-contain"
            style={{ width: 270, height: 270 }}
          />
        ) : (
          <div style={{ width: 270, height: 270 }} aria-hidden="true" />
        )}
        <span className="mt-2 max-w-full truncate text-2xl font-black text-white">
          {spotlight.label}
        </span>
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-3xl border-2 border-dashed px-6 text-center font-mono text-sm text-white/35"
      style={{ width: SIDE_WIDTH, borderColor: "rgba(255,255,255,0.12)" }}
    >
      {done ? "saving the litter…" : "show a cat to see it big"}
    </div>
  );
}

/**
 * The original batch look: one panel, every survivor in a grid whose
 * sprites grow as cats leave, the show number on every card. The spotlight
 * is a side column so the roster (and the mark) stay visible.
 */
export function SimpleBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const { survivors, spotlight, qrUrl } = view;
  const done = view.phase === "done";
  const grid = packSquares(
    survivors.length,
    GRID_WIDTH - 32 - SIDE_WIDTH - PANEL_GAP,
    GRID_HEIGHT,
    GRID_GAP,
    340 + LABEL_HEIGHT,
  );
  const spriteSize = Math.max(32, grid.cell - LABEL_HEIGHT);

  return (
    <div
      className="relative flex flex-col"
      style={{ width: "1280px", height: "1080px", padding: "24px 32px" }}
    >
      <style>{`
        @keyframes obs-batch-marked {
          0%, 100% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.5), 0 0 26px rgba(239, 68, 68, 0.35); }
          50% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.95), 0 0 44px rgba(239, 68, 68, 0.6); }
        }
        @keyframes obs-batch-potential {
          0%, 100% { box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.45), 0 0 22px rgba(250, 204, 21, 0.3); }
          50% { box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.8), 0 0 36px rgba(250, 204, 21, 0.5); }
        }
        .obs-batch-card { position: relative; transition: opacity 1.5s ease, transform 1.5s ease; border-radius: 16px; padding: 6px 8px; }
        .obs-batch-card.marked { animation: obs-batch-marked 1.1s ease-in-out infinite; background: rgba(80, 12, 12, 0.45); }
        .obs-batch-card.potential { animation: obs-batch-potential 1.4s ease-in-out infinite; background: rgba(80, 64, 8, 0.4); }
        .obs-batch-card.eliminated { opacity: 0; transform: scale(0.7) rotate(6deg); }
        .obs-batch-num { position: absolute; left: 6px; top: 6px; min-width: 34px; height: 34px; padding: 0 8px; border-radius: 17px; display: flex; align-items: center; justify-content: center; font: 800 18px var(--obs-font-mono, ui-monospace, monospace); background: rgba(255,255,255,0.92); color: #111; box-shadow: 0 2px 6px rgba(0,0,0,0.5); letter-spacing: 0.02em; }
        .obs-batch-card.marked .obs-batch-num { background: #ef4444; color: #fff; }
        .obs-batch-card.potential .obs-batch-num { background: #facc15; color: #3b2d00; }
        .obs-batch-plaque { --obs-plaque-accent: #fcd34d; }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="font-mono text-xl font-bold uppercase tracking-[0.3em] text-amber-200">
          🐾 {view.title}
        </span>
        <div className="flex items-center gap-5 font-mono text-base text-white/70">
          <span>
            Cats:{" "}
            <strong className="text-xl text-white">{view.remaining}</strong>
            <span className="text-white/50"> → {view.finalCount}</span>
          </span>
          <span>
            Stage{" "}
            <strong className="text-xl text-white">{view.stageNumber}</strong>/
            {view.stages.length}
          </span>
        </div>
      </div>

      {/* Plaque band: the wrapper portals the stage title / status / tally here. */}
      <div
        data-plaque-slot=""
        className="obs-batch-plaque"
        style={{ width: 560, height: 120, flex: "none", marginBottom: 8 }}
      />

      <div className="flex min-h-0 flex-1" style={{ gap: PANEL_GAP }}>
        {/* Cat grid */}
        <div
          className="grid min-w-0 flex-1 content-evenly justify-items-center gap-2 overflow-hidden p-4"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            ...OBS_PANEL_STYLE,
            // Classic: 24px (rounded-3xl); square themes stay square.
            borderRadius: "calc(var(--obs-panel-radius) * 1.2)",
          }}
        >
          {survivors.map((cat) => (
            <div
              key={cat.id}
              className={cn(
                "obs-batch-card flex flex-col items-center",
                cat.marked && "marked",
                cat.potential && "potential",
                cat.fading && "eliminated",
              )}
            >
              <span className="obs-batch-num">{cat.numberLabel}</span>
              <BatchSprite
                cat={cat}
                size={spriteSize}
                className="obs-batch-sprite"
              />
              {cat.favorite && (
                <span
                  className="absolute right-1 top-1 text-xl"
                  style={{
                    filter: "drop-shadow(0 0 6px rgba(244,114,182,0.8))",
                  }}
                >
                  💖
                </span>
              )}
              <span
                className={cn(
                  "max-w-full truncate text-base font-bold",
                  catLabelColourClass(cat.marked, cat.potential),
                )}
              >
                {cat.label}
              </span>
            </div>
          ))}
        </div>

        {sideColumn(done, qrUrl, spotlight)}
      </div>
    </div>
  );
}
