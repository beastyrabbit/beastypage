"use client";

import { Loader2 } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useMemo,
} from "react";
import {
  OBSClassicWheel,
  type OBSClassicWheelHandle,
} from "../../OBSClassicWheel";
import {
  LAYER_GROUPS,
  LAYER_PARAM_IDS,
  type LayerGroup,
  type LayerRowState,
  PARAM_SEQUENCE,
  type ParamDefinition,
  type ParamRow,
  type WheelRewardState,
} from "../spinSupport";
import { isNoneValue } from "./format";
import { OBS_PANEL_STYLE } from "./panelStyle";
import type { OverlayThemeId } from "./themeMeta";
import { wheelSkinFor } from "./wheelSkins";

/** The non-layer params, in reveal order — the rows every trait list shows. */
export const BOARD_SLOTS: readonly ParamDefinition[] = PARAM_SEQUENCE.filter(
  (def) => !LAYER_PARAM_IDS.has(def.id),
);

export interface BoardSlot {
  def: ParamDefinition;
  /** null only if the engine never prefilled the row (shouldn't happen). */
  row: ParamRow | null;
  status: ParamRow["status"];
  /** Revealed and the value means "nothing" — most themes hide or dim these. */
  isNone: boolean;
}

/** Join the engine's rows to the fixed slot list. */
export function useBoardRows(paramRows: ParamRow[]): BoardSlot[] {
  return useMemo(() => {
    const map = new Map<string, ParamRow>();
    for (const row of paramRows) map.set(row.id, row);
    return BOARD_SLOTS.map((def) => {
      const row = map.get(def.id) ?? null;
      const status = row?.status ?? "pending";
      return {
        def,
        row,
        status,
        isNone: status === "revealed" && isNoneValue(row?.value),
      };
    });
  }, [paramRows]);
}

export function revealedCount(slots: BoardSlot[]): number {
  return slots.filter((s) => s.status === "revealed").length;
}

export interface LayerSummaryGroup {
  /** "tortie" | "accessories" | "scars" */
  key: LayerGroup;
  label: string;
  rows: LayerRowState[];
  /** Revealed, non-"None" values. */
  values: string[];
  active: boolean;
}

/** Layer groups (tortie / accessory / scar) with their revealed values. */
export function useLayerSummary(
  layerRows: Record<LayerGroup, LayerRowState[]>,
): LayerSummaryGroup[] {
  return useMemo(
    () =>
      LAYER_GROUPS.map((def) => {
        const rows = layerRows[def.layerKey] ?? [];
        return {
          key: def.layerKey,
          label: def.groupLabel,
          rows,
          values: rows
            .filter((r) => r.status === "revealed" && !isNoneValue(r.value))
            .map((r) => r.value),
          active: rows.some((r) => r.status === "active"),
        };
      }),
    [layerRows],
  );
}

/** 1920×1080 stage with the engine's 1.5s fade-in. */
export function SceneFade({
  spinVisible,
  width = 1920,
  height = 1080,
  style,
  theme,
  children,
}: Readonly<{
  spinVisible: boolean;
  width?: number;
  height?: number;
  style?: CSSProperties;
  /** Lets a scene scope its `prefers-reduced-motion` rule to `[data-obs-scene="<theme>"]`. */
  theme?: string;
  children: ReactNode;
}>) {
  return (
    <div
      data-obs-scene={theme}
      className="relative"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        opacity: spinVisible ? 1 : 0,
        transition: "opacity 1.5s ease-in-out",
        fontFamily: "var(--obs-font-sans)",
        color: "var(--obs-ink)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The "Loading…" chip shown while the generator initialises. */
export function LoadingBadge({ show }: Readonly<{ show: boolean }>) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center">
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{ ...OBS_PANEL_STYLE, background: "rgba(0,0,0,0.9)" }}
      >
        <Loader2
          className="size-5 animate-spin"
          style={{ color: "var(--obs-accent)" }}
        />
        <span className="text-sm" style={{ color: "var(--obs-muted)" }}>
          Loading…
        </span>
      </div>
    </div>
  );
}

interface WheelLayerProps {
  wheelRef: RefObject<OBSClassicWheelHandle | null>;
  wheelReward: WheelRewardState;
  wheelBannerVisible: boolean;
  /** Where the wheel is centred (px, stage coordinates). */
  wheel: { left: number; top: number; width: number; height: number };
  /** Where the reward banner sits (px, stage coordinates). */
  banner: { left: number; top: number; width: number };
  size?: number;
  /** Picks the wheel skin and banner look; defaults to classic. */
  theme?: OverlayThemeId;
}

/**
 * The wheel + reward banner every theme gets for free in Phase 1. Themes
 * only choose where it sits; Phase 2 may give each theme its own banner.
 */
export function WheelLayer({
  wheelRef,
  wheelReward,
  wheelBannerVisible,
  wheel,
  banner,
  size = 640,
  theme,
}: Readonly<WheelLayerProps>) {
  const show = wheelReward.status !== "hidden";
  const skin = wheelSkinFor(theme);
  if (!show) return null;
  const prizeName =
    wheelReward.status === "spinning"
      ? "???"
      : (wheelReward.prize?.prizeName ?? "");
  const prizeColor = wheelReward.prize?.color ?? "var(--obs-accent)";
  return (
    <>
      <div
        className="absolute z-20 flex items-center justify-center"
        style={{
          left: `${wheel.left}px`,
          top: `${wheel.top}px`,
          width: `${wheel.width}px`,
          height: `${wheel.height}px`,
          opacity: wheelReward.status === "spinning" ? 1 : 0,
          transition: "opacity 360ms ease",
          pointerEvents: "none",
        }}
      >
        {/* A dark pool under the wheel so the cat behind it doesn't peek out. */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            width: size + 220,
            height: size + 220,
            background: `radial-gradient(circle, ${skin.pool ?? "rgba(6, 8, 12, 0.82)"} 0 55%, transparent 72%)`,
          }}
        />
        <OBSClassicWheel
          ref={wheelRef}
          size={size}
          className="opacity-95"
          skin={skin}
        />
      </div>
      {wheelReward.prize && (
        <div
          className="absolute z-20 flex items-center justify-center"
          style={{
            left: `${banner.left}px`,
            top: `${banner.top}px`,
            width: `${banner.width}px`,
            opacity: wheelBannerVisible ? 1 : 0,
            transform: wheelBannerVisible
              ? "translateY(0)"
              : "translateY(10px)",
            transition: "opacity 280ms ease, transform 280ms ease",
            pointerEvents: "none",
          }}
        >
          <div
            className="flex min-w-[320px] items-center justify-center gap-3 px-5 py-3"
            style={skin.banner.style}
          >
            <span style={skin.banner.captionStyle}>{skin.banner.caption}</span>
            <span
              style={{
                ...skin.banner.valueStyle,
                ...(skin.banner.valueUsesPrizeColor
                  ? { color: prizeColor }
                  : {}),
              }}
            >
              {prizeName}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
