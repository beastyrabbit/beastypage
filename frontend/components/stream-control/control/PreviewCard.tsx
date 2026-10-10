"use client";

import { Tv } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { OVERLAY_THEME_META } from "../obs/themes/themeMeta";
import { useStreamControl } from "./context";
import { PaletteDots } from "./look/ThemeTile";

/** Theme changes this soon after mount are the session load, not a pick. */
const SETTLE_MS = 1500;

/**
 * OBS overlay live preview — stays visible next to whichever tab is active
 * so settings changes give instant feedback. The iframe never reloads on a
 * theme change (Convex pushes it); a quick shimmer marks the switch.
 */
export function PreviewCard() {
  const { obsUrl, previewContainerRef, overlayTheme } = useStreamControl();
  const themeMeta = OVERLAY_THEME_META[overlayTheme];

  const mountedAt = useRef(0);
  const lastTheme = useRef(overlayTheme);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (lastTheme.current === overlayTheme) return;
    lastTheme.current = overlayTheme;
    if (Date.now() - mountedAt.current < SETTLE_MS) return;
    setFlash((n) => n + 1);
  }, [overlayTheme]);

  return (
    <div className="min-w-0 lg:sticky lg:top-4">
      <p className="section-eyebrow mb-2.5">Live preview</p>
      <section className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Tv className="size-3.5" aria-hidden="true" />
            OBS preview
          </h3>
          <div className="flex items-center gap-2">
            <motion.span
              key={overlayTheme}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              <PaletteDots theme={overlayTheme} />
              {themeMeta.label}
            </motion.span>
            <span className="rounded-md border border-border/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              1920×1080
            </span>
          </div>
        </div>
        <div
          ref={previewContainerRef}
          className="relative aspect-video overflow-hidden rounded-lg border border-border/30 bg-black/90"
        >
          {obsUrl ? (
            <iframe
              src={obsUrl}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: "1920px",
                height: "1080px",
                transform: "scale(var(--preview-scale, 0.3))",
              }}
              title="OBS Overlay Preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading API key…
            </div>
          )}
          {flash > 0 ? (
            <motion.div
              key={flash}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              initial={{ opacity: 1, x: "-100%" }}
              animate={{ opacity: 0, x: "100%" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
