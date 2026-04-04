"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Wheel } from "spin-wheel";
import {
  CLASSIC_WHEEL_ITEMS,
  type ClassicWheelSelection,
} from "@/lib/wheel/classicWheel";
import { cn } from "@/lib/utils";

export interface OBSClassicWheelHandle {
  spinTo: (selection: ClassicWheelSelection) => Promise<void>;
  reset: () => void;
}

interface OBSClassicWheelProps {
  size?: number;
  className?: string;
}

export const OBSClassicWheel = forwardRef<
  OBSClassicWheelHandle,
  OBSClassicWheelProps
>(function OBSClassicWheel(
  { size = 640, className }: OBSClassicWheelProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useRef<Wheel | null>(null);
  const resolveSpinRef = useRef<(() => void) | null>(null);

  const createWheel = useCallback(() => {
    if (!containerRef.current) return;
    wheelRef.current?.remove();

    try {
      const wheel = new Wheel(containerRef.current, {
        items: CLASSIC_WHEEL_ITEMS,
        radius: Math.floor(size / 2) - 8,
        itemLabelRadius: 0.83,
        itemLabelRadiusMax: 0.3,
        itemLabelRotation: 0,
        itemLabelAlign: "right",
        itemLabelColors: ["#ffffff"],
        itemLabelBaselineOffset: -0.07,
        itemLabelFont: "Geist Sans, Inter, Arial, sans-serif",
        itemLabelFontSizeMax: Math.min(28, Math.floor(size / 14)),
        itemBackgroundColors: CLASSIC_WHEEL_ITEMS.map(
          (item) => item.backgroundColor,
        ),
        rotationSpeedMax: 300,
        rotationResistance: -50,
        lineWidth: 3,
        lineColor: "rgba(255,255,255,0.72)",
        borderWidth: 4,
        borderColor: "rgba(255,255,255,0.22)",
        isInteractive: false,
        pointerAngle: 0,
      });

      wheel.onRest = () => {
        resolveSpinRef.current?.();
        resolveSpinRef.current = null;
      };

      wheelRef.current = wheel;
      wheel.resize();
    } catch (err) {
      console.error("[OBSClassicWheel] Failed to create wheel instance", err);
      wheelRef.current = null;
    }
  }, [size]);

  useEffect(() => {
    createWheel();
    return () => {
      resolveSpinRef.current = null;
      wheelRef.current?.remove();
      wheelRef.current = null;
    };
  }, [createWheel]);

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
          wheelRef.current?.spinToItem(selection.index, 4200, false, 6, 1);
          // Safety timeout in case onRest never fires
          setTimeout(() => {
            if (resolveSpinRef.current === resolve) {
              console.warn(
                "[OBSClassicWheel] Spin timed out after 10s — force resolving",
              );
              resolveSpinRef.current = null;
              resolve();
            }
          }, 10000);
        });
      },
      reset() {
        // Resolve any pending spinTo promise before recreating
        resolveSpinRef.current?.();
        resolveSpinRef.current = null;
        createWheel();
      },
    }),
    [createWheel],
  );

  return (
    <div
      className={cn("relative", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <div className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 -translate-y-full">
        <div className="h-0 w-0 -rotate-180 border-l-[16px] border-r-[16px] border-b-[26px] border-l-transparent border-r-transparent border-b-amber-300 drop-shadow-[0_8px_18px_rgba(253,230,138,0.45)]" />
      </div>
      <div className="relative size-full overflow-hidden rounded-full border border-amber-100/10 bg-[#0b0f1a] shadow-[inset_0_20px_60px_rgba(0,0,0,0.55)]">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 rounded-full border border-amber-200/10" />
      </div>
    </div>
  );
});
