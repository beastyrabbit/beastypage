"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Wheel } from "spin-wheel";
import { cn } from "@/lib/utils";
import {
  CLASSIC_WHEEL_ITEMS,
  CLASSIC_WHEEL_PRIZES,
  type ClassicWheelSelection,
  WHEEL_SPIN_DURATION_MS,
} from "@/lib/wheel/classicWheel";
import { WHEEL_SKINS, type WheelSkin } from "./obs/themes/wheelSkins";

export interface OBSClassicWheelHandle {
  spinTo: (selection: ClassicWheelSelection) => Promise<void>;
  reset: () => void;
}

interface OBSClassicWheelProps {
  size?: number;
  className?: string;
  /** Per-theme look; defaults to the classic amber wheel. */
  skin?: WheelSkin;
}

export const OBSClassicWheel = forwardRef<
  OBSClassicWheelHandle,
  OBSClassicWheelProps
>(function OBSClassicWheel(
  { size = 640, className, skin = WHEEL_SKINS.classic }: OBSClassicWheelProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useRef<Wheel | null>(null);
  const resolveSpinRef = useRef<(() => void) | null>(null);
  const labelRingRef = useRef<SVGGElement | null>(null);
  /** Resolve a pending spinTo promise so callers never hang when the wheel goes away. */
  const settlePendingSpin = useCallback(() => {
    resolveSpinRef.current?.();
    resolveSpinRef.current = null;
  }, []);
  const rafRef = useRef<number | null>(null);
  const clipId = useId();

  /** Copy the wheel's rotation onto the label ring. */
  const syncLabels = useCallback(() => {
    const ring = labelRingRef.current;
    const wheel = wheelRef.current;
    if (!ring || !wheel) return;
    // `rotation` is a public getter at runtime; the package typings omit it.
    const rotation = (wheel as unknown as { rotation: number }).rotation;
    ring.setAttribute("transform", `rotate(${rotation})`);
  }, []);
  const stopLabelLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    syncLabels();
  }, [syncLabels]);
  const startLabelLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      syncLabels();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [syncLabels]);

  const createWheel = useCallback(() => {
    if (!containerRef.current) return;
    stopLabelLoop();
    settlePendingSpin();
    wheelRef.current?.remove();

    try {
      // Items carry their own colours, which win over the wheel-level
      // arrays, so the skin is applied per item.
      const segments = skin.segments(CLASSIC_WHEEL_PRIZES);
      // Labels are drawn by the SVG ring below (synced to the wheel's
      // rotation) so each theme gets real typography; the library's own
      // canvas labels are switched off.
      const items = CLASSIC_WHEEL_ITEMS.map((item, i) => ({
        ...item,
        backgroundColor: segments[i] ?? item.backgroundColor,
        labelColor: "transparent",
      }));
      const wheel = new Wheel(containerRef.current, {
        items,
        radius: Math.floor(size / 2) - 8,
        itemLabelRadius: 0.83,
        itemLabelRadiusMax: 0.3,
        itemLabelRotation: 0,
        itemLabelAlign: "right",
        itemLabelColors: ["transparent"],
        itemLabelBaselineOffset: -0.07,
        itemLabelFont: skin.labelFont,
        itemLabelFontSizeMax: Math.min(28, Math.floor(size / 14)),
        itemBackgroundColors: segments,
        rotationSpeedMax: 300,
        rotationResistance: -50,
        lineWidth: skin.lineWidth,
        lineColor: skin.lineColor,
        borderWidth: skin.borderWidth,
        borderColor: skin.borderColor,
        isInteractive: false,
        pointerAngle: 0,
      });

      wheel.onRest = () => {
        stopLabelLoop();
        resolveSpinRef.current?.();
        resolveSpinRef.current = null;
      };

      wheelRef.current = wheel;
      wheel.resize();
      syncLabels();
    } catch (err) {
      console.error("[OBSClassicWheel] Failed to create wheel instance", err);
      wheelRef.current = null;
    }
  }, [size, skin, stopLabelLoop, syncLabels, settlePendingSpin]);

  useEffect(() => {
    createWheel();
    return () => {
      // A theme switch remounts the wheel mid-spin: settle the awaiting
      // caller (the reveal continues with the banner) instead of hanging it.
      stopLabelLoop();
      settlePendingSpin();
      wheelRef.current?.remove();
      wheelRef.current = null;
    };
  }, [createWheel, stopLabelLoop, settlePendingSpin]);

  // Static label geometry: segment centres from the prize weights, 0° at the
  // top, clockwise — the same convention spin-wheel uses for its items.
  const labelGeometry = useMemo(() => {
    const total = CLASSIC_WHEEL_ITEMS.reduce((a, i) => a + i.weight, 0);
    const radius = Math.floor(size / 2) - 8;
    const labelColors = skin.labelColors(CLASSIC_WHEEL_PRIZES);
    let cursor = 0;
    return CLASSIC_WHEEL_ITEMS.map((item, i) => {
      const span = (item.weight / total) * 360;
      const start = cursor;
      cursor += span;
      const toXY = (deg: number, r: number) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        return `${(r * Math.cos(rad)).toFixed(2)},${(r * Math.sin(rad)).toFixed(2)}`;
      };
      const wedge = `M0,0 L${toXY(start, radius)} A${radius},${radius} 0 ${span > 180 ? 1 : 0} 1 ${toXY(start + span, radius)} Z`;
      return {
        label: item.label,
        centre: start + span / 2,
        wedge,
        color: labelColors[i % labelColors.length] ?? "#fff",
      };
    });
  }, [size, skin]);
  const labelRadius = (Math.floor(size / 2) - 8) * 0.9;
  const labelSize = Math.min(28, Math.floor(size / 14));

  useImperativeHandle(
    ref,
    () => ({
      spinTo(selection: ClassicWheelSelection) {
        // Resolve any previous in-flight spin so callers unblock
        resolveSpinRef.current?.();
        resolveSpinRef.current = null;

        if (!wheelRef.current) {
          createWheel();
        }
        if (!wheelRef.current) {
          console.warn(
            "[OBSClassicWheel] Wheel creation failed — container may not be mounted",
          );
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          resolveSpinRef.current = resolve;
          startLabelLoop();
          wheelRef.current?.spinToItem(
            selection.index,
            WHEEL_SPIN_DURATION_MS,
            false,
            6,
            1,
          );
          // Safety timeout in case onRest never fires
          setTimeout(() => {
            if (resolveSpinRef.current === resolve) {
              console.warn(
                "[OBSClassicWheel] Spin timed out after 10s — force resolving",
              );
              stopLabelLoop();
              resolveSpinRef.current = null;
              resolve();
            }
          }, 10000);
        });
      },
      reset() {
        // createWheel settles any pending spin and stops the label loop.
        createWheel();
      },
    }),
    [createWheel, startLabelLoop, stopLabelLoop],
  );

  return (
    <div
      className={cn("relative", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <WheelPointer skin={skin} />
      <div
        className="relative size-full overflow-hidden rounded-full"
        style={{ background: skin.faceBg, ...skin.rim }}
      >
        <div ref={containerRef} className="absolute inset-0" />
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={size}
          height={size}
          viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        >
          <defs>
            {labelGeometry.map((g, i) => (
              <clipPath key={g.label} id={`${clipId}-w${i}`}>
                <path d={g.wedge} />
              </clipPath>
            ))}
          </defs>
          <g ref={labelRingRef}>
            {labelGeometry.map((g, i) => (
              <g key={g.label} clipPath={`url(#${clipId}-w${i})`}>
                <text
                  transform={`rotate(${g.centre - 90})`}
                  x={labelRadius}
                  y={0}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill={g.color}
                  style={{
                    fontFamily: skin.labelFont,
                    fontSize: labelSize,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    paintOrder: "stroke",
                    stroke: skin.labelStroke ?? "rgba(0,0,0,0.35)",
                    strokeWidth: 3,
                    strokeLinejoin: "round",
                  }}
                >
                  {g.label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      {skin.ticks && (
        <div
          className="pointer-events-none absolute z-10 rounded-full"
          style={{
            inset: -skin.ticks.inset,
            background: `repeating-conic-gradient(from -0.5deg, ${skin.ticks.color} 0deg 1deg, transparent 1deg ${skin.ticks.every}deg)`,
            WebkitMaskImage: `radial-gradient(circle, transparent calc(50% - ${skin.ticks.width + 2}px), #000 calc(50% - ${skin.ticks.width + 1}px), #000 calc(50% - 2px), transparent calc(50% - 1px))`,
            maskImage: `radial-gradient(circle, transparent calc(50% - ${skin.ticks.width + 2}px), #000 calc(50% - ${skin.ticks.width + 1}px), #000 calc(50% - 2px), transparent calc(50% - 1px))`,
          }}
        />
      )}
      {skin.hub && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{
            width: skin.hub.size,
            height: skin.hub.size,
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
            ...skin.hub.style,
          }}
        >
          {skin.hub.glyph}
        </div>
      )}
    </div>
  );
});

function WheelPointer({ skin }: Readonly<{ skin: WheelSkin }>) {
  const { shape, color, shadow } = skin.pointer;
  if (shape === "needle") {
    // A sewing needle coming down onto the rim, eye at the top.
    return (
      <div
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ top: -62, width: 6, height: 92, marginLeft: -3 }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 3,
            background: `linear-gradient(180deg, ${color} 0%, #eef0f3 55%, #8b8f96 100%)`,
            boxShadow: shadow,
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1,
            top: 8,
            width: 4,
            height: 12,
            borderRadius: 2,
            border: "1.5px solid #6b6f76",
          }}
        />
      </div>
    );
  }
  if (shape === "roundel") {
    // A station marker sitting on the top of the line.
    return (
      <div
        className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
        style={{ top: -14 }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: color,
            border: "5px solid #111111",
            boxShadow: shadow,
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            margin: "-4px auto 0",
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: "12px solid #111111",
          }}
        />
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 -translate-y-full">
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "16px solid transparent",
          borderRight: "16px solid transparent",
          borderTop: `26px solid ${color}`,
          filter: `drop-shadow(${shadow})`,
        }}
      />
    </div>
  );
}
