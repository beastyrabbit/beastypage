"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { QrBadge } from "../../QrBadge";
import { OBS_PANEL_STYLE } from "../../themes/panelStyle";
import { packSquares } from "./batchLayout";
import type { BatchSceneViewProps } from "./batchView";

/** Inner size of the cat grid on the 1280×1080 canvas. */
const GRID_WIDTH = 1280 - 64 - 32 - 4;
const GRID_HEIGHT = 1080 - 48 - 52 - 32 - 4;
const GRID_GAP = 8;
const LABEL_HEIGHT = 34;

function catLabelColourClass(marked: boolean, potential: boolean): string {
  if (marked) return "text-red-300";
  if (potential) return "text-yellow-200";
  return "text-white/90";
}

/**
 * The original batch look: one panel, every survivor in a grid whose
 * sprites grow as cats leave, the show number on every card.
 */
export function SimpleBatchScene({ view }: Readonly<BatchSceneViewProps>) {
  const { survivors, spotlight, qrUrl } = view;
  const grid = packSquares(
    survivors.length,
    GRID_WIDTH - 32,
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
        @keyframes obs-batch-flash {
          0% { filter: brightness(2.2); }
          100% { filter: brightness(1); }
        }
        @keyframes obs-batch-marked {
          0%, 100% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.5), 0 0 26px rgba(239, 68, 68, 0.35); }
          50% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.95), 0 0 44px rgba(239, 68, 68, 0.6); }
        }
        @keyframes obs-batch-potential {
          0%, 100% { box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.45), 0 0 22px rgba(250, 204, 21, 0.3); }
          50% { box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.8), 0 0 36px rgba(250, 204, 21, 0.5); }
        }
        .obs-batch-card { position: relative; transition: opacity 1s ease, transform 1s ease; border-radius: 16px; padding: 6px 8px; }
        .obs-batch-card.marked { animation: obs-batch-marked 1.1s ease-in-out infinite; background: rgba(80, 12, 12, 0.45); }
        .obs-batch-card.potential { animation: obs-batch-potential 1.4s ease-in-out infinite; background: rgba(80, 64, 8, 0.4); }
        .obs-batch-card.eliminated { opacity: 0; transform: scale(0.7) rotate(6deg); }
        .obs-batch-sprite { animation: obs-batch-flash 600ms ease; }
        .obs-batch-num { position: absolute; left: 6px; top: 6px; min-width: 34px; height: 34px; padding: 0 8px; border-radius: 17px; display: flex; align-items: center; justify-content: center; font: 800 18px var(--obs-font-mono, ui-monospace, monospace); background: rgba(255,255,255,0.92); color: #111; box-shadow: 0 2px 6px rgba(0,0,0,0.5); letter-spacing: 0.02em; }
        .obs-batch-card.marked .obs-batch-num { background: #ef4444; color: #fff; }
        .obs-batch-card.potential .obs-batch-num { background: #facc15; color: #3b2d00; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between pb-3">
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
          <span className="text-amber-300">{view.statusLabel}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
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
              {cat.previewUrl ? (
                <Image
                  // Keyed by the preview url — the previous sprite stays
                  // until the new render is ready.
                  key={cat.previewUrl}
                  src={cat.previewUrl}
                  alt={cat.label}
                  width={spriteSize}
                  height={spriteSize}
                  unoptimized
                  className="obs-batch-sprite image-render-pixel object-contain"
                  style={{ width: spriteSize, height: spriteSize }}
                />
              ) : (
                <div
                  className="flex items-center justify-center text-[10px] text-white/30"
                  style={{ width: spriteSize, height: spriteSize }}
                >
                  …
                </div>
              )}
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

        {/* Spotlight — one cat shown big over the grid */}
        {spotlight?.previewUrl && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div
              className="relative flex flex-col items-center rounded-3xl border-2 px-12 py-8"
              style={{
                background: "rgba(8, 8, 10, 0.94)",
                borderColor: "rgba(56, 189, 248, 0.5)",
                boxShadow:
                  "0 0 90px rgba(0,0,0,0.8), 0 0 50px rgba(56,189,248,0.25)",
              }}
            >
              <span
                className="obs-batch-num"
                style={{ left: 16, top: 16, height: 44, fontSize: 24 }}
              >
                {spotlight.numberLabel}
              </span>
              <Image
                src={spotlight.previewUrl}
                alt={spotlight.label}
                width={520}
                height={520}
                unoptimized
                className="image-render-pixel object-contain"
                style={{ width: 520, height: 520 }}
              />
              <span className="mt-2 text-3xl font-black text-white">
                {spotlight.label}
              </span>
            </div>
          </div>
        )}

        {/* QR side panel — once the show is over and the litter is saved */}
        {qrUrl && (
          <div className="flex w-[250px] shrink-0 flex-col items-center justify-center">
            <QrBadge url={qrUrl} label="Scan for the litter" size={185} />
          </div>
        )}
      </div>
    </div>
  );
}
