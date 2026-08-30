"use client";

import { Loader2 } from "lucide-react";
import { type RefObject, useMemo } from "react";
import { FlapDisplay, Presets } from "react-split-flap-effect";
import { cn } from "@/lib/utils";
import "react-split-flap-effect/extras/themes.css";
import {
  OBSClassicWheel,
  type OBSClassicWheelHandle,
} from "../../OBSClassicWheel";
import { QrBadge } from "../QrBadge";
import {
  DISPLAY_SIZE,
  LAYER_GROUPS,
  LAYER_PARAM_IDS,
  type LayerGroup,
  type LayerRowState,
  PARAM_SEQUENCE,
  type ParamId,
  type ParamRow,
  type WheelRewardState,
} from "../spinSupport";
import { SPREAD_CANVAS, SPREAD_REGIONS } from "../spreadLayout";

interface SpinBoardProps {
  spinVisible: boolean;
  initializing: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  wheelRef: RefObject<OBSClassicWheelHandle | null>;
  wheelReward: WheelRewardState;
  wheelBannerVisible: boolean;
  paramRows: ParamRow[];
  layerRows: Record<LayerGroup, LayerRowState[]>;
  flashParamId: ParamId | null;
  flashLayerKey: string | null;
  rollerLabel: string | null;
  rollerActiveValue: string | null;
  spinDone: boolean;
  /** Share URL of the saved result — shows a scannable QR when set. */
  viewUrl: string | null;
  /**
   * Spread layout: pushes each element apart on the full 1920×1080 canvas
   * so streamers can crop individual pieces in OBS for a custom interface.
   */
  spread?: boolean;
}

const flapChars = `${Presets.ALPHANUM} .-()_/•–:`;

// The fixed board slots — exclude all layer params (accessory, scar, tortie
// sub-params). Those have their own bottom panel.
const boardSlots = PARAM_SEQUENCE.filter((def) => !LAYER_PARAM_IDS.has(def.id));

/**
 * The spin result board — fixed-position overlay where nothing moves:
 * cat canvas top-left, roller + param board right column, layer details
 * bottom bar, plus the wheel reward overlay.
 */
export function SpinBoard({
  spinVisible,
  initializing,
  canvasRef,
  wheelRef,
  wheelReward,
  wheelBannerVisible,
  paramRows,
  layerRows,
  flashParamId,
  flashLayerKey,
  rollerLabel,
  rollerActiveValue,
  spinDone,
  viewUrl,
  spread = false,
}: SpinBoardProps) {
  // Build a map of revealed params for the fixed board
  const revealedMap = useMemo(() => {
    const map = new Map<string, ParamRow>();
    for (const row of paramRows) {
      map.set(row.id, row);
    }
    return map;
  }, [paramRows]);

  const showWheelOverlay = wheelReward.status !== "hidden";
  const wheelOverlayOpacity = wheelReward.status === "spinning" ? 1 : 0;
  // In spread mode the wheel has its own region, so the cat never dims.
  const catCanvasOpacity =
    !spread && wheelReward.status === "spinning" ? 0.14 : 1;
  const wheelPrizeName =
    wheelReward.status === "spinning"
      ? "???"
      : (wheelReward.prize?.prizeName ?? "");
  const wheelPrizeColor = wheelReward.prize?.color ?? "#f59e0b";

  // Spread mode gives every element its own separated region (50px gutters,
  // canvas larger than full HD) so each one can be cropped in OBS — see
  // spreadLayout.ts for the geometry shown on the test card.
  const regions = SPREAD_REGIONS;
  const catPosition = spread
    ? { left: `${regions.catCanvas.left}px`, top: `${regions.catCanvas.top}px` }
    : { left: "0px", top: "0px" };
  const wheelPosition = spread
    ? {
        left: `${regions.wheel.left}px`,
        top: `${regions.wheel.top}px`,
        width: `${regions.wheel.width}px`,
        height: `${regions.wheel.height}px`,
      }
    : { left: "0px", top: "0px", width: "750px", height: "780px" };
  const bannerPosition = spread
    ? {
        left: `${regions.wheelBanner.left}px`,
        top: `${regions.wheelBanner.top}px`,
        width: `${regions.wheelBanner.width}px`,
      }
    : { left: "0px", top: "560px", width: "750px" };
  const boardPosition = spread
    ? {
        left: `${regions.paramBoard.left}px`,
        top: `${regions.paramBoard.top}px`,
        width: `${regions.paramBoard.width}px`,
        height: `${regions.paramBoard.height}px`,
      }
    : { left: "750px", top: "20px", width: "510px", bottom: "220px" };
  const layerBarPosition = spread
    ? {
        left: `${regions.layerBar.left}px`,
        top: `${regions.layerBar.top}px`,
        width: `${regions.layerBar.width}px`,
        height: `${regions.layerBar.height}px`,
      }
    : { left: "20px", bottom: "20px", right: "20px", height: "180px" };
  const qrPosition = spread
    ? { left: `${regions.qr.left}px`, top: `${regions.qr.top}px` }
    : { left: "20px", top: "620px" };

  return (
    <div
      className="relative"
      style={{
        width: spread ? `${SPREAD_CANVAS.width}px` : "1280px",
        height: spread ? `${SPREAD_CANVAS.height}px` : "1080px",
        opacity: spinVisible ? 1 : 0,
        transition: "opacity 1.5s ease-in-out",
      }}
    >
      <style>{`
        @keyframes obs-dot-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes obs-done-pulse {
          0%, 100% { opacity: 0.8; text-shadow: 0 0 12px rgba(245,158,11,0.5), 0 0 24px rgba(245,158,11,0.25); }
          50% { opacity: 1; text-shadow: 0 0 20px rgba(245,158,11,0.7), 0 0 40px rgba(245,158,11,0.4); }
        }
        /* Split-flap overrides — clean dark tiles, single line */
        .obs-flap { white-space: nowrap !important; flex-wrap: nowrap !important; }
        .obs-flap [data-kind="digit"] {
          color: #e4e4e7 !important;
          background: #18181b !important;
          border: 1px solid #27272a !important;
          border-radius: 4px !important;
          margin-right: 2px !important;
          font-family: 'Geist Mono', ui-monospace, monospace !important;
          font-weight: 700 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5) !important;
        }
        .obs-flap-active [data-kind="digit"] {
          color: #fbbf24 !important;
          background: #1c1a0a !important;
          border-color: #44400a !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(251,191,36,0.3) !important;
        }
        .obs-flap-done [data-kind="digit"] {
          color: #a1a1aa !important;
          background: #111113 !important;
          border-color: #1e1e22 !important;
        }
        .obs-flap-pending [data-kind="digit"] {
          color: #3f3f46 !important;
          background: #0f0f10 !important;
          border-color: #1a1a1e !important;
        }
        @keyframes obs-row-flash {
          0% { background: transparent; }
          40% { background: rgba(245, 158, 11, 0.15); box-shadow: inset 0 0 20px rgba(245, 158, 11, 0.08); }
          100% { background: transparent; }
        }
        .obs-row-flash { animation: obs-row-flash 350ms ease-out; }
      `}</style>

      {showWheelOverlay && (
        <div
          className="absolute z-20 flex items-center justify-center"
          style={{
            ...wheelPosition,
            opacity: spread ? 1 : wheelOverlayOpacity,
            transition: "opacity 360ms ease",
            pointerEvents: "none",
          }}
        >
          <OBSClassicWheel ref={wheelRef} size={640} className="opacity-95" />
        </div>
      )}

      {/* ═══ Cat canvas — absolute, never moves ═══ */}
      <div
        className="absolute z-10 flex items-center justify-center"
        style={{
          ...catPosition,
          width: "750px",
          height: "780px",
          opacity: catCanvasOpacity,
          transition: "opacity 360ms ease",
        }}
      >
        <canvas
          ref={canvasRef}
          width={DISPLAY_SIZE}
          height={DISPLAY_SIZE}
          style={{
            width: "720px",
            height: "720px",
            imageRendering: "pixelated",
          }}
        />
      </div>

      {/* Share QR — bottom-left of the cat zone once the result is saved */}
      {spinDone && viewUrl && (
        <div className="absolute z-10" style={qrPosition}>
          <QrBadge url={viewUrl} size={180} />
        </div>
      )}

      {wheelReward.prize && (
        <div
          className="absolute z-20 flex items-center justify-center"
          style={{
            ...bannerPosition,
            opacity: wheelBannerVisible ? 1 : 0,
            transform: wheelBannerVisible
              ? "translateY(0)"
              : "translateY(10px)",
            transition: "opacity 280ms ease, transform 280ms ease",
            pointerEvents: "none",
          }}
        >
          <div
            className="flex min-w-[320px] items-center justify-center gap-3 rounded-2xl border px-5 py-3"
            style={{
              background: "rgba(12, 10, 6, 0.92)",
              borderColor: "rgba(245, 158, 11, 0.28)",
              boxShadow:
                "0 14px 40px rgba(0,0,0,0.45), 0 0 30px rgba(245,158,11,0.08)",
            }}
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              Wheel Reward
            </span>
            <span
              className="text-2xl font-black tracking-[0.08em]"
              style={{
                color: wheelPrizeColor,
                textShadow: "0 0 18px rgba(0,0,0,0.55)",
              }}
            >
              {wheelPrizeName}
            </span>
          </div>
        </div>
      )}

      {/* ═══ LAYER DETAILS — full width bottom bar, always visible at fixed size ═══ */}
      <div
        className="absolute z-10 overflow-hidden"
        style={{
          ...layerBarPosition,
          background:
            "linear-gradient(90deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 50%, rgba(10,10,10,0.92) 100%)",
          borderRadius: "16px",
          border: "2px solid rgba(245, 158, 11, 0.2)",
          boxShadow:
            "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
          padding: "14px 0",
        }}
      >
        <div className="flex h-full">
          {LAYER_GROUPS.map((definition) => {
            const group = definition.layerKey;
            const label = definition.groupLabel;
            const rows = layerRows[group];
            const flexWeight =
              definition.compoundMode === "tortieParts" ? 2 : 1;
            return (
              <div
                key={group}
                className="flex flex-col overflow-hidden px-5"
                style={{ flex: `${flexWeight} 1 0`, minWidth: 0 }}
              >
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                  {label}
                </div>
                <div className="flex-1 overflow-hidden">
                  {rows.map((row, i) => {
                    const layerKey = `${group}-${i}`;
                    const isFlashing = flashLayerKey === layerKey;
                    return (
                      <div
                        key={layerKey}
                        className={cn(
                          "flex items-center border-l-2 py-1 pl-3",
                          isFlashing && "obs-row-flash",
                        )}
                        style={{
                          borderColor:
                            row.status === "active"
                              ? "#f59e0b"
                              : row.status === "revealed"
                                ? "#3f3f46"
                                : "rgba(113,113,122,0.3)",
                        }}
                      >
                        <span
                          className={cn(
                            "w-[80px] shrink-0 text-sm",
                            row.status === "active"
                              ? "font-semibold text-amber-400"
                              : row.status === "revealed"
                                ? "text-zinc-300"
                                : "text-zinc-600",
                          )}
                        >
                          {row.label}
                        </span>
                        <span
                          className={cn(
                            "truncate font-mono text-sm font-bold",
                            row.status === "active"
                              ? "text-white"
                              : row.status === "revealed"
                                ? "text-white"
                                : "text-zinc-600",
                          )}
                        >
                          {row.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ RIGHT COLUMN: Roller + Param board — always leaves room for bottom bar ═══ */}
      <div
        className="absolute flex flex-col overflow-hidden"
        style={{
          ...boardPosition,
          background:
            "linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(15,12,5,0.90) 100%)",
          borderRadius: "20px",
          border: "2px solid rgba(245, 158, 11, 0.2)",
          boxShadow:
            "0 0 60px rgba(245, 158, 11, 0.06), inset 0 1px 0 rgba(245, 158, 11, 0.08)",
        }}
      >
        {/* Roller — current spinning param */}
        <div
          style={{
            height: "100px",
            borderBottom: "1px solid rgba(245, 158, 11, 0.1)",
            padding: "20px 28px",
          }}
        >
          {rollerLabel ? (
            <>
              <div className="flex items-center gap-2.5">
                <div
                  className="size-2 rounded-full bg-amber-500"
                  style={{ animation: "obs-dot-pulse 1s ease-in-out infinite" }}
                />
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-500/60">
                  {rollerLabel}
                </span>
              </div>
              {rollerActiveValue && (
                <div className="mt-2 truncate font-mono text-3xl font-bold text-white">
                  {rollerActiveValue}
                </div>
              )}
            </>
          ) : spinDone ? (
            <div className="flex items-center gap-2.5">
              <span
                className="text-lg font-black uppercase tracking-[0.3em]"
                style={{
                  color: "#f59e0b",
                  textShadow:
                    "0 0 12px rgba(245,158,11,0.5), 0 0 24px rgba(245,158,11,0.25)",
                  animation: "obs-done-pulse 2s ease-in-out infinite",
                }}
              >
                Done
              </span>
            </div>
          ) : (
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-700">
              Ready
            </span>
          )}
        </div>

        {/* Param board — all slots, always visible */}
        <div className="flex-1 overflow-hidden" style={{ padding: "12px 0" }}>
          {boardSlots.map((def) => {
            const row = revealedMap.get(def.id);
            const isActive = row?.status === "active";
            const isRevealed = row?.status === "revealed";
            const isPending = row?.status === "pending";
            const isNone = isRevealed && row?.value?.toLowerCase() === "none";
            const isFlashing = flashParamId === def.id;
            const valueLen = row?.value?.length ?? 0;
            // Use S size for long values (>12 chars), M for normal
            const sizeClass = valueLen > 12 ? "S" : "M";

            // Hide "None" rows after reveal (fade out)
            if (isNone) return null;

            // Safety: skip if row is somehow missing (shouldn't happen with prefill)
            if (!row) return null;

            let flapClass: string;
            if (isPending) {
              flapClass = "obs-flap-pending";
            } else if (isActive) {
              flapClass = "obs-flap-active";
            } else {
              flapClass = "obs-flap-done";
            }

            let flapValue: string;
            if (isPending) {
              flapValue = "???";
            } else if (isActive) {
              flapValue = "?".repeat(row.value.length);
            } else {
              flapValue = row.value.toUpperCase();
            }

            return (
              <div
                key={def.id}
                className={cn(
                  "flex items-center transition-all duration-200",
                  isFlashing && "obs-row-flash",
                )}
                style={{
                  padding: "8px 24px",
                  borderLeft: isActive
                    ? "3px solid #f59e0b"
                    : isPending
                      ? "3px solid rgba(113,113,122,0.3)"
                      : "3px solid transparent",
                  background: isActive
                    ? "rgba(245,158,11,0.05)"
                    : "transparent",
                }}
              >
                <span
                  className={cn(
                    "w-[130px] shrink-0 text-sm font-bold uppercase tracking-wide",
                    isActive
                      ? "text-amber-400"
                      : isPending
                        ? "text-zinc-600"
                        : "text-zinc-400",
                  )}
                >
                  {def.label}
                </span>

                <div className="flex-1 overflow-hidden">
                  <FlapDisplay
                    className={cn("obs-flap", sizeClass, flapClass)}
                    chars={flapChars}
                    length={isPending ? 3 : row.value.length}
                    value={flapValue}
                    timing={80}
                    padMode="end"
                  />
                </div>
              </div>
            );
          })}
          {showWheelOverlay && (
            <div
              className="mt-2 flex items-center border-t pt-3 transition-all duration-200"
              style={{
                marginInline: "24px",
                paddingInline: "0px",
                borderColor: "rgba(245, 158, 11, 0.12)",
              }}
            >
              <span
                className={cn(
                  "w-[130px] shrink-0 text-sm font-bold uppercase tracking-wide",
                  wheelReward.status === "spinning"
                    ? "text-amber-400"
                    : "text-zinc-400",
                )}
              >
                Wheel Reward
              </span>
              <div className="flex-1 overflow-hidden">
                <span
                  className={cn(
                    "block truncate font-mono text-xl font-bold text-white",
                  )}
                  style={{
                    color:
                      wheelReward.status === "settled"
                        ? wheelPrizeColor
                        : undefined,
                  }}
                >
                  {wheelPrizeName}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {initializing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 bg-black/90 px-6 py-4 rounded-lg">
            <Loader2 className="size-5 animate-spin text-amber-500" />
            <span className="text-sm text-zinc-400">Loading…</span>
          </div>
        </div>
      )}
    </div>
  );
}
