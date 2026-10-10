"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { OVERLAY_THEME_META } from "../obs/themes/themeMeta";
import { useStreamControl } from "./context";
import { SliderControl } from "./controls";
import { ThemePicker } from "./look/ThemePicker";
import { useFollowGuard } from "./useFollowGuard";

type ObsLayoutMode = "default" | "spread";
type ObsBgMode = "transparent" | "colour";

const PILL_GROUP =
  "inline-flex gap-1 rounded-full border border-border/30 bg-muted/30 p-1";
const pillClass = (active: boolean) =>
  cn(
    "rounded-full px-3 py-1 text-xs font-semibold transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

/**
 * Look tab: the overlay theme picker, then the OBS appearance options
 * (spread layout for themes that support it, background colour/opacity).
 */
export function LookPanel() {
  const {
    overlayTheme,
    setOverlayTheme,
    syncSessionSettings,
    rawSessionSettings,
  } = useStreamControl();
  const supportsSpread = OVERLAY_THEME_META[overlayTheme].supportsSpread;

  // OBS appearance — follows the session settings, so a second open control
  // tab (or a reload) always shows the live values. Fresh local edits are
  // never reverted by in-flight echoes (useFollowGuard).
  const [layoutMode, setLayoutMode] = useState<ObsLayoutMode>("default");
  const [bgMode, setBgMode] = useState<ObsBgMode>("transparent");
  const [bgColour, setBgColour] = useState("#00ff00");
  const [bgOpacity, setBgOpacity] = useState(100);
  const { touch: touchLocalEdit, deferIfEditing, retryTick } = useFollowGuard();
  useEffect(() => {
    void retryTick;
    const raw = rawSessionSettings;
    if (!raw) return;
    const cancelRetry = deferIfEditing();
    if (cancelRetry) return cancelRetry;
    if (raw.obsLayoutMode === "spread" || raw.obsLayoutMode === "default") {
      setLayoutMode(raw.obsLayoutMode);
    }
    if (raw.obsBgMode === "colour" || raw.obsBgMode === "transparent") {
      setBgMode(raw.obsBgMode);
    }
    if (typeof raw.obsBgColour === "string") setBgColour(raw.obsBgColour);
    if (typeof raw.obsBgOpacity === "number") setBgOpacity(raw.obsBgOpacity);
  }, [rawSessionSettings, deferIfEditing, retryTick]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-background/80 backdrop-blur">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/30 px-5 py-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Overlay theme
          </h3>
          <p className="text-xs text-muted-foreground/70">
            Changes go live on the overlay right away.
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <ThemePicker value={overlayTheme} onChange={setOverlayTheme} />
        </div>
      </section>

      <section className="rounded-2xl border border-border/40 bg-background/80 backdrop-blur">
        <div className="border-b border-border/30 px-5 py-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            OBS appearance
          </h3>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <span className="mb-2 block text-xs font-medium text-muted-foreground">
              Overlay layout
            </span>
            {supportsSpread ? (
              <div className="animate-in fade-in duration-200">
                <div className={PILL_GROUP}>
                  {(
                    [
                      ["default", "BeastyPage layout"],
                      ["spread", "Spread (crop your own)"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={layoutMode === value}
                      onClick={() => {
                        touchLocalEdit();
                        setLayoutMode(value);
                        syncSessionSettings({ obsLayoutMode: value });
                      }}
                      className={pillClass(layoutMode === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Spread gives every element its own region with 50px of space
                  around it on a 2120×1180 canvas, so you can crop each one in
                  OBS and build your own layout. Turn on Test mode to see every
                  region's exact crop position.
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80 animate-in fade-in duration-200">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                Spread layout is available on the Classic theme.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
            <div>
              <span className="mb-2 block text-xs font-medium text-muted-foreground">
                Background
              </span>
              <div className={PILL_GROUP}>
                {(
                  [
                    ["transparent", "Transparent"],
                    ["colour", "Solid colour"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={bgMode === value}
                    onClick={() => {
                      touchLocalEdit();
                      setBgMode(value);
                      syncSessionSettings({ obsBgMode: value });
                    }}
                    className={pillClass(bgMode === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {bgMode === "colour" && (
              <>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground animate-in fade-in duration-200">
                  <span>Colour</span>
                  <input
                    type="color"
                    value={bgColour}
                    onChange={(event) => {
                      touchLocalEdit();
                      setBgColour(event.target.value);
                      syncSessionSettings({ obsBgColour: event.target.value });
                    }}
                    className="h-9 w-16 cursor-pointer rounded-lg border border-border/50 bg-background"
                  />
                </label>
                <div className="animate-in fade-in duration-200">
                  <SliderControl
                    label="Opacity"
                    value={bgOpacity}
                    min={5}
                    max={100}
                    step={5}
                    format={(value) => `${value}%`}
                    onChange={(value) => {
                      touchLocalEdit();
                      setBgOpacity(value);
                      syncSessionSettings({ obsBgOpacity: value });
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
